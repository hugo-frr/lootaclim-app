// Distances et temps de trajet estimés, quand aucun service de calcul
// d'itinéraire n'est configuré.

import { FACTEUR_DETOUR, VITESSE_MOYENNE_KMH } from "./config.js";

const RAYON_TERRE_KM = 6371;
const rad = (deg) => (deg * Math.PI) / 180;

/** Distance à vol d'oiseau (formule de haversine), en kilomètres. */
export function distanceKm(a, b) {
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * RAYON_TERRE_KM * Math.asin(Math.sqrt(h));
}

/** Temps de conduite estimé, en minutes. */
export function tempsEstimeMin(a, b) {
  return ((distanceKm(a, b) * FACTEUR_DETOUR) / VITESSE_MOYENNE_KMH) * 60;
}

/** Matrice des temps estimés entre tous les points, en minutes. */
export function matriceEstimee(points) {
  return points.map((a) => points.map((b) => tempsEstimeMin(a, b)));
}
