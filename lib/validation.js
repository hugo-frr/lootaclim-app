// Validation serveur du formulaire de réservation. Les contrôles côté
// navigateur (required, pattern…) ne sont qu'un confort : c'est ici que
// tout est réellement vérifié.

import { TIME_SLOTS, DELIVERY_ZONES, FLOOR_LABELS } from "./constants.js";

const FIELDS = [
  "startDay",
  "endDay",
  "deliverySlot",
  "pickupSlot",
  "firstName",
  "lastName",
  "email",
  "phone",
  "line1",
  "zip",
  "city",
  "floor",
  "accessCode",
];

// Renvoie { error: "message en français" } ou { data: champs nettoyés }.
// now : { day, hour } (heure de Paris), pour la règle du créneau commencé.
export function validateBookingForm(fields, now) {
  const clean = {};
  for (const key of FIELDS) clean[key] = String(fields[key] ?? "").trim();

  const required = {
    firstName: "le prénom",
    lastName: "le nom",
    email: "l'email",
    phone: "le téléphone",
    line1: "l'adresse",
    zip: "le code postal",
    city: "la ville",
  };
  for (const [key, label] of Object.entries(required)) {
    if (!clean[key]) return { error: `Merci de renseigner ${label}.` };
  }

  const isDay = (v) => /^\d{4}-\d{2}-\d{2}$/.test(v);
  if (!isDay(clean.startDay) || !isDay(clean.endDay) || clean.endDay < clean.startDay) {
    return { error: "Merci de choisir vos dates sur le calendrier." };
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean.email)) {
    return { error: "Cet email ne semble pas valide." };
  }
  const phoneDigits = clean.phone.replace(/[\s.\-+()]/g, "");
  if (!/^\d{9,14}$/.test(phoneDigits)) {
    return { error: "Ce numéro de téléphone ne semble pas valide." };
  }
  if (!/^\d{5}$/.test(clean.zip) || !DELIVERY_ZONES.some((z) => clean.zip.startsWith(z))) {
    return {
      error: "Nous livrons Paris et la petite couronne (codes postaux 75, 92, 93, 94).",
    };
  }
  if (!Object.hasOwn(FLOOR_LABELS, clean.floor)) return { error: "Merci de choisir un étage." };

  const delivery = TIME_SLOTS.find((s) => s.id === clean.deliverySlot);
  const pickup = TIME_SLOTS.find((s) => s.id === clean.pickupSlot);
  if (!delivery || !pickup) {
    return { error: "Merci de choisir vos créneaux de livraison et de reprise." };
  }
  if (clean.startDay === now.day && now.hour >= delivery.startHour) {
    return {
      error: "Ce créneau de livraison est déjà commencé : choisissez un créneau plus tard.",
    };
  }
  if (clean.startDay === clean.endDay && pickup.startHour <= delivery.startHour) {
    return { error: "Pour une location d'un jour, la reprise doit être après la livraison." };
  }

  return { data: clean };
}
