// Liens qui ouvrent le guidage vocal dans Google Maps ou Waze. Le guidage
// n'est pas refait dans le site : une page web perd la position GPS dès que
// l'écran se verrouille, les applications de navigation non.

// Google Maps accepte 9 étapes + la destination par lien.
const ARRETS_PAR_LIEN = 10;

// 6 décimales : une dizaine de centimètres, largement assez pour un GPS.
const coord = ({ lat, lng }) => `${+lat.toFixed(6)},${+lng.toFixed(6)}`;

export function lienGuidage(appli, point) {
  if (appli === "waze") {
    return `https://waze.com/ul?${new URLSearchParams({ ll: coord(point), navigate: "yes" })}`;
  }
  return `https://www.google.com/maps/dir/?${new URLSearchParams({
    api: "1",
    destination: coord(point),
    travelmode: "driving",
  })}`;
}

/**
 * La tournée entière dans Google Maps, en tronçons. Sans point de départ :
 * Google part de la position actuelle du téléphone, ce qui est juste aussi
 * bien au premier tronçon qu'aux suivants.
 */
export function liensTournee(points) {
  const liens = [];
  for (let i = 0; i < points.length; i += ARRETS_PAR_LIEN) {
    const troncon = points.slice(i, i + ARRETS_PAR_LIEN);
    const params = new URLSearchParams({
      api: "1",
      destination: coord(troncon[troncon.length - 1]),
      travelmode: "driving",
    });
    if (troncon.length > 1) params.set("waypoints", troncon.slice(0, -1).map(coord).join("|"));
    liens.push({ de: i + 1, a: i + troncon.length, url: `https://www.google.com/maps/dir/?${params}` });
  }
  return liens;
}

// Île-de-France, large. Une position hors de ce cadre est une erreur du
// téléphone (ou un formulaire trafiqué) : on part alors de l'entrepôt.
const CADRE = { latMin: 48.1, latMax: 49.3, lngMin: 1.4, lngMax: 3.6 };

export function departValide(lat, lng) {
  if (lat === "" || lng === "" || lat == null || lng == null) return null;
  const la = Number(lat);
  const lo = Number(lng);
  if (!Number.isFinite(la) || !Number.isFinite(lo)) return null;
  if (la < CADRE.latMin || la > CADRE.latMax || lo < CADRE.lngMin || lo > CADRE.lngMax) return null;
  return { lat: la, lng: lo };
}
