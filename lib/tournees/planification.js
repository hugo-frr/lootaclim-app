// Relie le solveur à la base : charger les interventions du jour, géocoder,
// calculer, enregistrer. Les appels réseau (géocodage, temps de trajet) se
// font toujours AVANT la transaction : une transaction ne doit jamais
// attendre un service extérieur.

import { prisma } from "../prisma.js";
import { toDay, nowInParis, minuteInParis } from "../dates.js";
import { geocoder } from "../geocodage.js";
import { matriceTemps, traceTournee } from "../itineraires.js";
import { ENTREPOT, CAPACITE_VEHICULE, DEBUT_JOURNEE_MIN, FIN_JOURNEE_MIN } from "./config.js";
import { versArrets, interventionPlanifiable } from "./arrets.js";
import { resoudre, ordreConserveSiIncomplet } from "./solveur.js";

export class ErreurTournee extends Error {}

export const DETAILS_INTERVENTION = {
  booking: { include: { customer: true, address: true, product: true, unit: true, kit: true } },
};

export async function interventionsDuJour(day) {
  const deliveries = await prisma.delivery.findMany({
    where: { date: new Date(day), status: "SCHEDULED" },
    include: { ...DETAILS_INTERVENTION, tour: true },
  });
  return deliveries.filter((d) => interventionPlanifiable(d, d.booking.status));
}

// Remplit les coordonnées manquantes, en base et sur les objets chargés.
async function geocoderAdresses(deliveries) {
  const faites = new Map();
  for (const d of deliveries) {
    const a = d.booking.address;
    if (a.lat != null && a.lng != null) continue;
    if (!faites.has(a.id)) {
      const r = await geocoder(a);
      if (r) await prisma.address.update({ where: { id: a.id }, data: { lat: r.lat, lng: r.lng } });
      faites.set(a.id, r);
    }
    const r = faites.get(a.id);
    if (r) Object.assign(a, { lat: r.lat, lng: r.lng });
  }
}

/** À la réservation, sans jamais la ralentir ni la faire échouer. */
export async function geocoderAdresseParId(addressId) {
  try {
    const a = await prisma.address.findUnique({ where: { id: addressId } });
    if (!a || a.lat != null) return;
    const r = await geocoder(a);
    if (r) await prisma.address.update({ where: { id: a.id }, data: { lat: r.lat, lng: r.lng } });
  } catch (e) {
    console.error("Géocodage à la réservation impossible :", e.message);
  }
}

// Aujourd'hui, on ne planifie pas dans le passé.
function debutPour(day) {
  return day === nowInParis().day ? Math.max(DEBUT_JOURNEE_MIN, minuteInParis()) : DEBUT_JOURNEE_MIN;
}

const aDesCoordonnees = (d) => d.booking.address.lat != null && d.booking.address.lng != null;

// Prépare la matrice et lance le solveur. departs[i] : position de départ du
// véhicule i, ou null pour l'entrepôt.
async function calculer(deliveries, vehiculesBase, departs = []) {
  const points = [ENTREPOT];
  const vehicules = vehiculesBase.map((v, i) => {
    let depart = 0;
    if (departs[i]) {
      depart = points.length;
      points.push(departs[i]);
    }
    return { ...v, depart, arrivee: 0 };
  });
  const items = deliveries.map((d) => {
    const lieu = points.length;
    points.push({ lat: d.booking.address.lat, lng: d.booking.address.lng });
    return { id: d.id, type: d.type, bookingId: d.bookingId, timeSlot: d.timeSlot, floor: d.booking.address.floor, lieu };
  });
  const { minutes } = await matriceTemps(points);
  const resultat = resoudre({ arrets: versArrets(items), vehicules, temps: minutes });
  const pointDe = new Map(items.map((i) => [i.id, points[i.lieu]]));
  return { resultat, pointDe, points, vehicules };
}

export async function planifierJour(day, driverIds) {
  const date = new Date(day);
  const tours = await prisma.tour.findMany({ where: { date } });
  const commencees = tours.filter((t) => t.status === "STARTED");
  const idsCommencees = new Set(commencees.map((t) => t.id));
  const occupes = new Set(commencees.map((t) => t.driverId));
  const libres = driverIds.filter((id) => !occupes.has(id));

  const aPlacer = (await interventionsDuJour(day)).filter((d) => !idsCommencees.has(d.tourId));
  await geocoderAdresses(aPlacer);
  const localisees = aPlacer.filter(aDesCoordonnees);

  const debut = debutPour(day);
  const { resultat, pointDe } = await calculer(
    localisees,
    libres.map((id) => ({ id, debut, fin: FIN_JOURNEE_MIN, capacite: CAPACITE_VEHICULE }))
  );
  const traces = await Promise.all(
    resultat.tournees.map((t) =>
      t.arrets.length ? traceTournee([ENTREPOT, ...t.arrets.map((a) => pointDe.get(a.id)), ENTREPOT]) : null
    )
  );

  await prisma.$transaction(
    async (tx) => {
      // Un livreur a pu partir pendant le calcul : on ne touche pas à sa tournée.
      const parties = await tx.tour.count({ where: { date, status: "STARTED", driverId: { in: libres } } });
      if (parties) throw new ErreurTournee("Un livreur vient de commencer sa tournée. Relancez le calcul.");
      const anciennes = (await tx.tour.findMany({ where: { date, status: "PLANNED" }, select: { id: true } })).map((t) => t.id);
      await tx.delivery.updateMany({
        where: { tourId: { in: anciennes } },
        data: { tourId: null, ordre: null, heurePrevue: null },
      });
      await tx.tour.deleteMany({ where: { id: { in: anciennes } } });
      for (const [i, t] of resultat.tournees.entries()) {
        if (!t.arrets.length) continue;
        const tour = await tx.tour.create({
          data: {
            date,
            driverId: t.vehicule,
            conduiteMin: t.conduite,
            trace: traces[i] ? JSON.stringify(traces[i]) : null,
          },
        });
        for (const [k, a] of t.arrets.entries()) {
          await tx.delivery.update({
            where: { id: a.id },
            data: { tourId: tour.id, ordre: k + 1, heurePrevue: a.debut },
          });
        }
      }
    },
    { isolationLevel: "Serializable", timeout: 20000 }
  );

  const placees = resultat.tournees.reduce((s, t) => s + t.arrets.length, 0);
  return { placees, nonPlacees: aPlacer.length - placees };
}

/**
 * Réordonne les arrêts restants d'une tournée, depuis l'entrepôt ou depuis
 * la position du livreur. Aucun arrêt n'en sort jamais. Renvoie
 * { complet: false } si tous les créneaux ne peuvent plus être tenus.
 */
export async function reordonnerTournee(tourId, { depart = null } = {}) {
  const tour = await prisma.tour.findUnique({
    where: { id: tourId },
    include: { deliveries: { include: DETAILS_INTERVENTION, orderBy: [{ ordre: "asc" }, { timeSlot: "asc" }] } },
  });
  if (!tour) return { complet: true };
  if (!tour.deliveries.length) {
    if (tour.status === "PLANNED") await prisma.tour.delete({ where: { id: tourId } });
    return { complet: true };
  }
  const faites = tour.deliveries.filter((d) => d.status !== "SCHEDULED");
  const restantes = tour.deliveries.filter((d) => d.status === "SCHEDULED");
  await geocoderAdresses(restantes);
  const localisees = restantes.filter(aDesCoordonnees);
  const sansCoord = restantes.filter((d) => !aDesCoordonnees(d));

  const { resultat, pointDe, points, vehicules } = await calculer(
    localisees,
    [{ id: tour.driverId, debut: debutPour(toDay(tour.date)), fin: FIN_JOURNEE_MIN, capacite: CAPACITE_VEHICULE }],
    [depart]
  );
  const ids = ordreConserveSiIncomplet(resultat, localisees.map((d) => d.id));
  const heures = resultat.nonCases.length ? new Map() : new Map(resultat.tournees[0].arrets.map((a) => [a.id, a.debut]));
  const ordre = [...ids, ...sansCoord.map((d) => d.id)];
  const trace = ids.length
    ? await traceTournee([points[vehicules[0].depart], ...ids.map((id) => pointDe.get(id)), ENTREPOT])
    : null;

  await prisma.$transaction(async (tx) => {
    for (const [k, id] of ordre.entries()) {
      await tx.delivery.update({
        where: { id },
        data: { ordre: faites.length + k + 1, ...(heures.has(id) ? { heurePrevue: heures.get(id) } : {}) },
      });
    }
    await tx.tour.update({
      where: { id: tourId },
      data: {
        trace: trace ? JSON.stringify(trace) : null,
        ...(resultat.nonCases.length ? {} : { conduiteMin: resultat.tournees[0].conduite }),
      },
    });
  });
  return { complet: !resultat.nonCases.length && !sansCoord.length };
}

/** Donne une intervention à un autre livreur, puis réordonne les deux tournées. */
export async function reattribuer(deliveryId, driverId) {
  const d = await prisma.delivery.findUnique({ where: { id: deliveryId } });
  if (!d || d.status !== "SCHEDULED") return "Cette intervention n'est plus à faire.";
  const ancienne = d.tourId;
  const cible = await prisma.tour.upsert({
    where: { date_driverId: { date: d.date, driverId } },
    update: {},
    create: { date: d.date, driverId },
  });
  if (cible.id === ancienne) return null;
  await prisma.delivery.update({ where: { id: deliveryId }, data: { tourId: cible.id, ordre: null, heurePrevue: null } });
  const { complet } = await reordonnerTournee(cible.id);
  if (ancienne) await reordonnerTournee(ancienne);
  return complet
    ? null
    : "Arrêt déplacé, mais cette tournée ne peut plus tenir tous ses créneaux : l'ordre n'a pas été recalculé. Déplacez un autre arrêt ou prévenez le client.";
}
