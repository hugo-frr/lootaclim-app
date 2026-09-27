// Transforme les interventions de la base (livraisons, reprises) en arrêts
// que le solveur sait manipuler : un lieu, une fenêtre horaire, un temps sur
// place, un effet sur le chargement du véhicule.

import {
  TEMPS_SUR_PLACE_MIN,
  SUPPLEMENT_SANS_ASCENSEUR_MIN,
  DEBUT_JOURNEE_MIN,
  FIN_JOURNEE_MIN,
} from "./config.js";

/** "9h-11h" → [540, 660], en minutes depuis minuit. */
export function fenetreDuCreneau(creneau) {
  const m = /^(\d{1,2})h-(\d{1,2})h$/.exec(String(creneau ?? ""));
  // Un créneau illisible ne doit pas rendre l'arrêt impossible : on laisse
  // toute la journée, l'admin verra l'heure prévue.
  if (!m) return [DEBUT_JOURNEE_MIN, FIN_JOURNEE_MIN];
  return [Number(m[1]) * 60, Number(m[2]) * 60];
}

export function tempsSurPlace(etage) {
  return TEMPS_SUR_PLACE_MIN + (etage === "esc" ? SUPPLEMENT_SANS_ASCENSEUR_MIN : 0);
}

/**
 * L'intervention doit-elle figurer dans une tournée ? Seulement si on peut
 * réellement la faire : une livraison de réservation confirmée, une reprise
 * de machine livrée (ou livrée le jour même, pour une location d'un jour).
 */
export function interventionPlanifiable(delivery, statutReservation) {
  if (delivery.status !== "SCHEDULED") return false;
  if (delivery.type === "DROPOFF") return statutReservation === "CONFIRMED";
  if (delivery.type === "PICKUP") return ["CONFIRMED", "DELIVERED"].includes(statutReservation);
  return false;
}

export function versArrets(items) {
  const livraisonDe = new Map(
    items.filter((i) => i.type === "DROPOFF").map((i) => [i.bookingId, i.id])
  );
  return items.map((i) => ({
    id: i.id,
    type: i.type,
    lieu: i.lieu,
    fenetre: fenetreDuCreneau(i.timeSlot),
    service: tempsSurPlace(i.floor),
    // Location d'un seul jour : on ne reprend pas une machine pas encore livrée.
    apres: i.type === "PICKUP" ? livraisonDe.get(i.bookingId) ?? null : null,
  }));
}

/** 750 → "12h30" */
export function heureTexte(minutes) {
  const m = Math.round(minutes);
  return `${Math.floor(m / 60)}h${String(m % 60).padStart(2, "0")}`;
}
