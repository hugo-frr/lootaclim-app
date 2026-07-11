// Disponibilité des machines par dates — fonctions pures, sans accès à la
// base : elles reçoivent les données en paramètres et sont donc testables.

import { addDays, eachDay } from "./dates.js";
import { TIME_SLOTS } from "./constants.js";

// Nombre de machines réellement louables d'un modèle. Les statuts
// AVAILABLE/RENTED/IN_TRANSIT décrivent l'instant présent, pas le futur :
// ce sont les réservations qui font foi pour le calendrier.
export function capacity(units) {
  return units.filter((u) => !["RETIRED", "MAINTENANCE"].includes(u.status)).length;
}

// Statuts de réservation qui bloquent le calendrier
const BLOCKING_STATUSES = ["PENDING", "CONFIRMED", "DELIVERED"];

// Jours "complets" (toutes les machines prises) sur [horizonStart, horizonEnd].
// Chaque réservation occupe ses dates + 1 jour de battement après la fin.
// bookings : [{ startDay, endDay, status }] — cap : capacité du modèle.
export function fullDays(bookings, cap, horizonStart, horizonEnd) {
  const counts = new Map();
  for (const b of bookings) {
    if (!BLOCKING_STATUSES.includes(b.status)) continue;
    const from = b.startDay < horizonStart ? horizonStart : b.startDay;
    const until = addDays(b.endDay, 1); // battement
    const to = until > horizonEnd ? horizonEnd : until;
    for (const day of eachDay(from, to)) {
      counts.set(day, (counts.get(day) ?? 0) + 1);
    }
  }
  const full = new Set();
  for (const [day, n] of counts) if (n >= cap) full.add(day);
  return full;
}

// Une plage [startDay, endDay] est-elle réservable ?
// Renvoie null si oui, sinon un message d'erreur en français.
// La plage + son jour de battement doivent être entièrement libres.
export function rangeError(startDay, endDay, full, minDay, maxDay) {
  if (!startDay || !endDay || endDay < startDay) return "Dates invalides.";
  if (startDay < minDay) return "Cette date de début n'est plus réservable.";
  if (endDay > maxDay) return "Réservation possible jusqu'à 3 mois à l'avance.";
  for (const day of eachDay(startDay, addDays(endDay, 1))) {
    if (full.has(day)) {
      return "Ces dates ne sont plus disponibles (toutes les machines sont réservées sur une partie de la période).";
    }
  }
  return null;
}

// Créneaux de livraison proposables pour un jour de début donné.
// Le jour même, un créneau déjà commencé n'est plus proposé.
export function deliverySlotsFor(startDay, now) {
  if (startDay > now.day) return TIME_SLOTS;
  return TIME_SLOTS.filter((s) => now.hour < s.startHour);
}

// Premier jour réservable : aujourd'hui s'il reste un créneau, sinon demain
export function minStartDay(now) {
  return deliverySlotsFor(now.day, now).length > 0 ? now.day : addDays(now.day, 1);
}

// Créneaux de reprise. Pour une location d'un seul jour, la reprise doit
// être strictement après la livraison.
export function pickupSlotsFor(startDay, endDay, deliverySlotId) {
  if (startDay !== endDay) return TIME_SLOTS;
  const delivery = TIME_SLOTS.find((s) => s.id === deliverySlotId);
  if (!delivery) return TIME_SLOTS;
  return TIME_SLOTS.filter((s) => s.startHour > delivery.startHour);
}
