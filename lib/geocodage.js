// Adresse → coordonnées GPS, via la Géoplateforme de l'IGN (Base Adresse
// Nationale) : la référence officielle française, gratuite, sans clé.

const URL_SERVICE = "https://data.geopf.fr/geocodage/search";
// En dessous, la correspondance est trop incertaine pour y envoyer un livreur.
const SCORE_MIN = 0.5;

export function lireReponseGeocodage(json, codePostal) {
  const f = json?.features?.[0];
  if (!f) return null;
  const { score, postcode, label } = f.properties ?? {};
  if (!(score >= SCORE_MIN)) return null;
  if (codePostal && postcode && postcode !== codePostal) return null;
  const [lng, lat] = f.geometry?.coordinates ?? [];
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng, label };
}

/** Ne lève jamais : une adresse introuvable renvoie null. */
export async function geocoder({ line1, zip, city }, fetchImpl = fetch) {
  try {
    const params = new URLSearchParams({ q: `${line1} ${zip} ${city}`, limit: "1", index: "address" });
    const res = await fetchImpl(`${URL_SERVICE}?${params}`, { signal: AbortSignal.timeout(6000) });
    if (!res.ok) return null;
    return lireReponseGeocodage(await res.json(), zip);
  } catch {
    return null;
  }
}
