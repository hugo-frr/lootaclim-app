// Génère une adresse web ("slug") à partir d'un nom de modèle : minuscules,
// accents retirés, tout ce qui n'est pas alphanumérique remplacé par un
// tiret. "Climatiseur Bastille" → "climatiseur-bastille".
export function slugify(name) {
  return name
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
