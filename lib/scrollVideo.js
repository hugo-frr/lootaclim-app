// Vidéo de fond pilotée par le défilement : la page fait avancer la vidéo,
// elle ne se lit jamais toute seule. Calcul pur, testable sans navigateur.

// Progression du défilement de la page, ramenée entre 0 (haut) et 1 (bas).
// Renvoie 0 si la page n'est pas défilable, pour éviter une division par zéro.
export function scrubProgress(scrollY, documentHeight, viewportHeight) {
  const scrollable = documentHeight - viewportHeight;
  if (!(scrollable > 0)) return 0;
  return Math.min(1, Math.max(0, scrollY / scrollable));
}

// Position à atteindre dans la vidéo, en secondes.
// Tant que "loadedmetadata" n'a pas eu lieu, video.duration vaut NaN — et une
// durée infinie existe sur les flux continus. Les deux donnent 0.
export function videoTimeAt(progress, duration) {
  if (!Number.isFinite(duration) || duration <= 0) return 0;
  const p = Math.min(1, Math.max(0, progress));
  return p * duration;
}

// Faut-il vraiment déplacer la tête de lecture ? En dessous d'une image
// d'écart, le déplacement serait invisible, mais chaque réassignation de
// currentTime relance le décodeur : à 60 fois par seconde, la lecture hoquette.
export function shouldSeek(courant, cible, seuil) {
  if (!Number.isFinite(courant) || !Number.isFinite(cible)) return false;
  return Math.abs(cible - courant) > seuil;
}
