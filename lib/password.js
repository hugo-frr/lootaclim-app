// Hachage des mots de passe des comptes du back-office.
//
// PBKDF2-SHA256 via l'API Web Crypto, comme lib/session.js le fait déjà pour
// signer les sessions : aucune dépendance ajoutée, et le même code fonctionne
// dans Node comme dans le runtime edge du middleware.

const encoder = new TextEncoder();

// Recommandation OWASP pour PBKDF2-SHA256. Mesuré à ~110 ms sur la machine de
// développement : indolore pour une connexion, coûteux pour qui essaierait des
// millions de mots de passe.
export const PBKDF2_ITERATIONS = 600000;

const LONGUEUR_MIN = 10;
const LONGUEUR_MAX = 200;

function hex(octets) {
  return [...new Uint8Array(octets)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function octetsDeHex(chaine) {
  const octets = new Uint8Array(chaine.length / 2);
  for (let i = 0; i < octets.length; i++) {
    octets[i] = parseInt(chaine.slice(i * 2, i * 2 + 2), 16);
  }
  return octets;
}

async function deriver(motDePasse, sel, iterations) {
  const cle = await crypto.subtle.importKey(
    "raw",
    encoder.encode(motDePasse),
    "PBKDF2",
    false,
    ["deriveBits"]
  );
  return crypto.subtle.deriveBits(
    { name: "PBKDF2", salt: sel, iterations, hash: "SHA-256" },
    cle,
    256
  );
}

/** Empreinte à stocker : "itérations.sel.empreinte", en hexadécimal. */
export async function hashPassword(motDePasse) {
  // Le sel est tiré au hasard pour chaque compte : sans lui, deux personnes
  // ayant choisi le même mot de passe auraient la même empreinte, et une seule
  // table précalculée les casserait toutes les deux.
  const sel = crypto.getRandomValues(new Uint8Array(16));
  const bits = await deriver(motDePasse, sel, PBKDF2_ITERATIONS);
  return `${PBKDF2_ITERATIONS}.${hex(sel)}.${hex(bits)}`;
}

/** Le mot de passe correspond-il à l'empreinte enregistrée ? */
export async function verifyPassword(motDePasse, stocke) {
  if (typeof stocke !== "string" || typeof motDePasse !== "string") return false;

  const parties = stocke.split(".");
  if (parties.length !== 3) return false;

  const [brutIterations, selHex, empreinteHex] = parties;
  // Le nombre d'itérations est relu depuis l'empreinte, jamais pris dans la
  // constante courante : le jour où on l'augmente, les comptes existants
  // doivent continuer de fonctionner.
  const iterations = Number(brutIterations);
  if (!Number.isInteger(iterations) || iterations < 1 || iterations > 5000000) return false;
  if (!/^[0-9a-f]+$/.test(selHex) || selHex.length % 2 !== 0) return false;
  if (!/^[0-9a-f]{64}$/.test(empreinteHex)) return false;

  const attendu = hex(await deriver(motDePasse, octetsDeHex(selHex), iterations));

  // Comparaison en temps constant : on parcourt toujours toute la chaîne, pour
  // ne pas révéler par la durée combien de caractères étaient corrects.
  let diff = 0;
  for (let i = 0; i < attendu.length; i++) {
    diff |= attendu.charCodeAt(i) ^ empreinteHex.charCodeAt(i);
  }
  return diff === 0;
}

/** Message d'erreur si le mot de passe choisi ne convient pas, sinon null. */
export function passwordError(motDePasse) {
  if (typeof motDePasse !== "string" || motDePasse.length < LONGUEUR_MIN) {
    return `Le mot de passe doit faire au moins ${LONGUEUR_MIN} caractères.`;
  }
  if (motDePasse.length > LONGUEUR_MAX) {
    return `Le mot de passe ne peut pas dépasser ${LONGUEUR_MAX} caractères.`;
  }
  return null;
}
