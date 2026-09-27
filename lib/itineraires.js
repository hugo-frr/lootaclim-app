// Temps de trajet réels et tracés, via OpenRouteService (clé gratuite dans
// ORS_API_KEY). Sans clé ou en cas de panne, on retombe sur l'estimation à
// vol d'oiseau : les tournées restent calculables, juste moins précises.

import { matriceEstimee, tempsEstimeMin } from "./tournees/distances.js";

const ORS = "https://api.openrouteservice.org/v2";
// Offre gratuite : 3 500 cellules par matrice, 50 étapes par tracé.
const MAX_POINTS_MATRICE = 59;
const MAX_POINTS_TRACE = 50;

export function lireMatriceOrs(json, points) {
  return json.durations.map((ligne, i) =>
    ligne.map((s, j) => (Number.isFinite(s) ? s / 60 : tempsEstimeMin(points[i], points[j])))
  );
}

async function appelOrs(chemin, corps) {
  const res = await fetch(`${ORS}${chemin}`, {
    method: "POST",
    headers: { Authorization: process.env.ORS_API_KEY, "Content-Type": "application/json" },
    body: JSON.stringify(corps),
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) throw new Error(`OpenRouteService ${res.status}`);
  return res.json();
}

export async function matriceTemps(points) {
  if (process.env.ORS_API_KEY && points.length > 1 && points.length <= MAX_POINTS_MATRICE) {
    try {
      const json = await appelOrs("/matrix/driving-car", {
        locations: points.map((p) => [p.lng, p.lat]),
        metrics: ["duration"],
      });
      return { minutes: lireMatriceOrs(json, points), source: "ors" };
    } catch (e) {
      console.error("Matrice OpenRouteService indisponible, estimation utilisée :", e.message);
    }
  }
  return { minutes: matriceEstimee(points), source: "estimation" };
}

/** Tracé routier [lng, lat][], ou null (la carte reliera alors les arrêts en pointillés). */
export async function traceTournee(points) {
  if (!process.env.ORS_API_KEY || points.length < 2 || points.length > MAX_POINTS_TRACE) return null;
  try {
    const json = await appelOrs("/directions/driving-car/geojson", {
      coordinates: points.map((p) => [p.lng, p.lat]),
    });
    return json.features?.[0]?.geometry?.coordinates ?? null;
  } catch (e) {
    console.error("Tracé OpenRouteService indisponible :", e.message);
    return null;
  }
}
