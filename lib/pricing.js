// Calcul du devis de location. Tout est en CENTIMES.

import { daysBetweenInclusive } from "./dates.js";

export const DELIVERY_FEE = 2900; // livraison + reprise, zone 75/92/93/94

// Remise dégressive : -15 % dès 7 jours, -30 % dès 30 jours
export function discountRate(days) {
  if (days >= 30) return 0.3;
  if (days >= 7) return 0.15;
  return 0;
}

export function quote(dailyPrice, startDay, endDay) {
  const days = daysBetweenInclusive(startDay, endDay);
  const subtotal = dailyPrice * days;
  const rate = discountRate(days);
  const discount = Math.round(subtotal * rate);
  const floorFee = 0; // prévu en base, activé plus tard
  return {
    days,
    subtotal,
    discountRate: rate,
    discount,
    deliveryFee: DELIVERY_FEE,
    floorFee,
    total: subtotal - discount + DELIVERY_FEE + floorFee,
  };
}
