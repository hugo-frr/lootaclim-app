// Enregistrement des photos de modèles envoyées depuis le back-office.
// Stockage sur le disque local (public/images/) : simple et suffisant tant
// que le site tourne en local ou sur un serveur Node classique. À REVOIR
// avant la mise en ligne réelle sur Vercel, où ce dossier n'est plus
// modifiable à l'exécution (voir README, section "Notes importantes") — il
// faudra alors basculer vers un vrai service de stockage (type Vercel Blob).

import { writeFile, mkdir } from "node:fs/promises";
import path from "node:path";

const ALLOWED_TYPES = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};
const MAX_SIZE = 8 * 1024 * 1024; // 8 Mo

// Enregistre le fichier envoyé et renvoie son chemin public (/images/...).
// Lève une erreur explicite (message affichable tel quel) si le format ou
// la taille ne conviennent pas.
export async function saveProductImage(file, slug) {
  const ext = ALLOWED_TYPES[file.type];
  if (!ext) {
    throw new Error("Format d'image non supporté (jpg, png ou webp uniquement).");
  }
  if (file.size > MAX_SIZE) {
    throw new Error("L'image dépasse la taille maximale (8 Mo).");
  }

  const filename = `${slug}-${Date.now()}.${ext}`;
  const dir = path.join(process.cwd(), "public", "images");
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, filename), Buffer.from(await file.arrayBuffer()));
  return `/images/${filename}`;
}
