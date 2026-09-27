"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "../../../lib/prisma";
import { can } from "../../../lib/roles";
import { departValide } from "../../../lib/tournees/navigation";
import { planifierJour, reattribuer, reordonnerTournee, ErreurTournee } from "../../../lib/tournees/planification";
import { requireCan } from "../auth";
import { markDelivery } from "../actions";
import { jourDemande } from "./donnees";

function retour(day, { erreur, info } = {}) {
  revalidatePath("/admin/tournees");
  const p = new URLSearchParams({ jour: day });
  if (erreur) p.set("erreur", erreur);
  if (info) p.set("info", info);
  redirect(`/admin/tournees?${p}`);
}

export async function calculerTournees(formData) {
  await requireCan("planifierTournees");
  const day = jourDemande(String(formData.get("jour") ?? ""));
  const demandes = formData.getAll("livreurs").map(String);
  // Seuls de vrais comptes livreurs actifs : un identifiant trafiqué ne crée pas de tournée.
  const livreurs = await prisma.user.findMany({
    where: { id: { in: demandes }, role: "LIVREUR", active: true },
    select: { id: true },
    orderBy: { name: "asc" },
  });
  if (!livreurs.length) return retour(day, { erreur: "Cochez au moins un livreur." });
  let bilan;
  try {
    bilan = await planifierJour(day, livreurs.map((l) => l.id));
  } catch (e) {
    if (e instanceof ErreurTournee) return retour(day, { erreur: e.message });
    if (e.code === "P2034") return retour(day, { erreur: "Quelqu'un modifiait les tournées en même temps. Relancez le calcul." });
    throw e;
  }
  const info = bilan.nonPlacees
    ? `${bilan.placees} arrêt(s) répartis, ${bilan.nonPlacees} non placé(s) : voir la liste en rouge.`
    : `${bilan.placees} arrêt(s) répartis.`;
  retour(day, { info });
}

export async function deplacerArret(formData) {
  await requireCan("planifierTournees");
  const day = jourDemande(String(formData.get("jour") ?? ""));
  const driverId = String(formData.get("livreur") ?? "");
  const livreur = await prisma.user.findFirst({ where: { id: driverId, role: "LIVREUR", active: true } });
  if (!livreur) return retour(day, { erreur: "Livreur introuvable." });
  const erreur = await reattribuer(String(formData.get("id") ?? ""), livreur.id);
  retour(day, erreur ? { erreur } : { info: `Arrêt confié à ${livreur.name}.` });
}

export async function commencerTournee(formData) {
  const user = await requireCan("voirTournees");
  const tour = await prisma.tour.findUnique({ where: { id: String(formData.get("id") ?? "") } });
  if (!tour || tour.driverId !== user.id) {
    return retour(jourDemande(""), { erreur: "Cette tournée n'est pas la vôtre." });
  }
  const day = tour.date.toISOString().slice(0, 10);
  if (tour.status !== "STARTED") {
    await prisma.tour.update({ where: { id: tour.id }, data: { status: "STARTED", startedAt: new Date() } });
  }
  const depart = departValide(formData.get("lat"), formData.get("lng"));
  await reordonnerTournee(tour.id, { depart });
  retour(day, { info: depart ? "C'est parti ! Ordre recalculé depuis votre position." : "C'est parti !" });
}

export async function marquerArret(formData) {
  const user = await requireCan("livrer");
  const d = await prisma.delivery.findUnique({
    where: { id: String(formData.get("id") ?? "") },
    include: { tour: true },
  });
  if (!can(user.role, "planifierTournees") && d?.tour?.driverId !== user.id) {
    return retour(jourDemande(""), { erreur: "Cet arrêt n'est pas dans votre tournée." });
  }
  formData.set("retour", "/admin/tournees");
  return markDelivery(formData);
}
