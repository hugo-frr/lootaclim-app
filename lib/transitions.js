// Règles d'enchaînement des statuts (réservations, livraisons, machines).
// Fonctions pures : elles renvoient null (autorisé) ou un message d'erreur
// en français ; deliveryDoneEffects renvoie les effets à appliquer.

import { addDays } from "./dates.js";

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
    return { booking: "DELIVERED", unit: "RENTED" };
  }
  if (delivery.type === "PICKUP") {
    if (booking.status !== "DELIVERED") {
      return { error: "Marquez d'abord la livraison comme effectuée." };
    }
    return { booking: "RETURNED", unit: "AVAILABLE" };
  }
  return { error: "Type d'intervention inconnu." };
}

export function deliveryFailError(delivery) {
  return delivery.status === "SCHEDULED"
    ? null
    : "Cette intervention n'est plus planifiée.";
}
