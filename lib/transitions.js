// Règles d'enchaînement des statuts (réservations, livraisons, machines).
// Fonctions pures : elles renvoient null (autorisé) ou un message d'erreur
// en français ; deliveryDoneEffects renvoie les effets à appliquer.

import { addDays } from "./dates.js";

// Une caution est due dès que la livraison a lieu aujourd'hui ou demain, ou
// est déjà passée sans avoir été posée (filet de rattrapage : panne du cron
// un jour donné, ou pose manuelle tardive) — jamais avant, pour ne pas
// bloquer une carte trop tôt (les blocages bancaires expirent au bout
// d'environ 7 jours).
export function depositDue(deliveryDay, today) {
  return deliveryDay <= addDays(today, 1);
}

export function confirmError(booking) {
  return booking.status === "PENDING"
    ? null
    : "Seule une demande « En attente » peut être confirmée.";
}

export function cancelError(booking) {
  return ["PENDING", "CONFIRMED"].includes(booking.status)
    ? null
    : "Une réservation livrée ou terminée ne peut plus être annulée.";
}

// Marquer une intervention « effectuée ». delivery : { type, status },
// booking : { status, unitId }. Renvoie { error } ou { booking, unit }
// (les nouveaux statuts à appliquer atomiquement).
export function deliveryDoneEffects(delivery, booking) {
  if (delivery.status !== "SCHEDULED") {
    return { error: "Cette intervention n'est plus planifiée." };
  }
  if (delivery.type === "DROPOFF") {
    if (booking.status !== "CONFIRMED") {
      return { error: "Confirmez la réservation avant de marquer la livraison effectuée." };
    }
    if (!booking.unitId) {
      return { error: "Affectez d'abord une machine à cette réservation." };
    }
    if (booking.depositAmount > 0 && booking.depositStatus !== "HELD") {
      return {
        error: "La caution n'a pas encore été posée sur ce client — vérifiez la carte avant de livrer.",
      };
    }
    const effects = { booking: "DELIVERED", unit: "RENTED" };
    if (booking.kitId) effects.kit = "RENTED";
    return effects;
  }
  if (delivery.type === "PICKUP") {
    if (booking.status !== "DELIVERED") {
      return { error: "Marquez d'abord la livraison comme effectuée." };
    }
    const effects = { booking: "RETURNED", unit: "AVAILABLE" };
    if (booking.kitId) effects.kit = "AVAILABLE";
    return effects;
  }
  return { error: "Type d'intervention inconnu." };
}

export function deliveryFailError(delivery) {
  return delivery.status === "SCHEDULED"
    ? null
    : "Cette intervention n'est plus planifiée.";
}

// Affectation d'une machine physique à une réservation.
// booking : { status, productId, startDay, endDay } (jours "AAAA-MM-JJ") —
// unit : { status, productId } — unitBookings : les AUTRES réservations déjà
// affectées à cette machine [{ startDay, endDay, status }].
const BLOCKING_STATUSES = ["PENDING", "CONFIRMED", "DELIVERED"];

export function unitAssignmentError(booking, unit, unitBookings) {
  if (!["PENDING", "CONFIRMED"].includes(booking.status)) {
    return "Cette réservation ne peut plus recevoir de machine.";
  }
  if (unit.productId !== booking.productId) {
    return "Cette machine n'est pas du bon modèle.";
  }
  if (["RETIRED", "MAINTENANCE"].includes(unit.status)) {
    return "Cette machine est indisponible (maintenance ou retirée du parc).";
  }
  for (const other of unitBookings) {
    if (!BLOCKING_STATUSES.includes(other.status)) continue;
    // Chaque location occupe [début, fin + 1 jour de battement] : deux fenêtres
    // se croisent si chacune commence avant la fin de l'autre.
    if (
      booking.startDay <= addDays(other.endDay, 1) &&
      other.startDay <= addDays(booking.endDay, 1)
    ) {
      return "Cette machine est déjà réservée sur des dates qui chevauchent.";
    }
  }
  return null;
}

// Affectation d'un kit de calfeutrage à une réservation — même logique que
// l'affectation d'une machine, mais sans contrainte de modèle (un kit est
// universel). booking : { status, startDay, endDay } — kit : { status } —
// kitBookings : les AUTRES réservations déjà affectées à ce kit.
export function kitAssignmentError(booking, kit, kitBookings) {
  if (!["PENDING", "CONFIRMED"].includes(booking.status)) {
    return "Cette réservation ne peut plus recevoir de kit.";
  }
  if (["RETIRED", "MAINTENANCE"].includes(kit.status)) {
    return "Ce kit est indisponible (maintenance ou retiré).";
  }
  for (const other of kitBookings) {
    if (!BLOCKING_STATUSES.includes(other.status)) continue;
    if (
      booking.startDay <= addDays(other.endDay, 1) &&
      other.startDay <= addDays(booking.endDay, 1)
    ) {
      return "Ce kit est déjà affecté sur des dates qui chevauchent.";
    }
  }
  return null;
}

// Changement MANUEL du statut d'une machine depuis le back-office.
// RENTED et IN_TRANSIT sont pilotés par les livraisons, jamais à la main.
const MANUAL_STATUSES = ["AVAILABLE", "MAINTENANCE", "RETIRED"];

export function unitStatusChangeError(unit, newStatus) {
  if (!MANUAL_STATUSES.includes(newStatus)) {
    return "Ce statut est piloté par les livraisons.";
  }
  if (!MANUAL_STATUSES.includes(unit.status)) {
    return "Cette machine est en location : marquez d'abord la reprise effectuée.";
  }
  return null;
}

// Changement MANUEL du statut d'un kit — mêmes règles que pour une machine.
export function kitStatusChangeError(kit, newStatus) {
  if (!MANUAL_STATUSES.includes(newStatus)) {
    return "Ce statut est piloté par les livraisons.";
  }
  if (!MANUAL_STATUSES.includes(kit.status)) {
    return "Ce kit est en location : marquez d'abord la reprise effectuée.";
  }
  return null;
}

// Libération/encaissement de la caution : uniquement après la reprise,
// et seulement si une caution est effectivement posée.
export function depositReleaseError(booking) {
  if (booking.status !== "RETURNED") {
    return "La réservation doit être terminée avant de statuer sur la caution.";
  }
  if (booking.depositStatus !== "HELD") return "Aucune caution posée à libérer.";
  return null;
}

export function depositCaptureError(booking, amountCents) {
  const statusError = depositReleaseError(booking);
  if (statusError) return statusError;
  if (!Number.isInteger(amountCents) || amountCents <= 0) {
    return "Le montant à encaisser doit être positif.";
  }
  if (amountCents > booking.depositAmount) {
    return "Le montant à encaisser dépasse la caution posée.";
  }
  return null;
}
