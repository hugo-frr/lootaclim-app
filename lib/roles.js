// Qui a le droit de faire quoi dans le back-office.
//
// Une seule table fait autorité : les pages y lisent ce qu'elles affichent, et
// les actions serveur y relisent ce qu'elles autorisent. Vérifier uniquement à
// l'affichage ne protégerait de rien — un formulaire se poste à la main.

export const ROLES = ["ADMIN", "MAGASINIER", "LIVREUR"];

export const ROLE_LABELS = {
  ADMIN: "Administrateur",
  MAGASINIER: "Magasinier",
  LIVREUR: "Livreur",
};

// Pour chaque action, les rôles qui l'obtiennent.
export const PERMISSIONS = {
  // Argent et pilotage — réservés
  voirFinances: ["ADMIN"], // chiffre d'affaires, prix, montants des cautions
  gererArgent: ["ADMIN"], // poser, libérer, encaisser une caution ; rembourser
  gererProduits: ["ADMIN"], // modèles, tarifs, photos
  gererEquipe: ["ADMIN"], // comptes et rôles
  voirEnquete: ["ADMIN"], // enquête de marché et liste d'attente
  confirmerReservation: ["ADMIN"],
  annulerReservation: ["ADMIN"],

  // Entrepôt
  gererStock: ["ADMIN", "MAGASINIER"], // machines, kits, statuts, notes
  imprimerEtiquettes: ["ADMIN", "MAGASINIER"],
  voirReservations: ["ADMIN", "MAGASINIER"], // le tableau complet

  // Terrain
  scanner: ["ADMIN", "MAGASINIER", "LIVREUR"],
  livrer: ["ADMIN", "MAGASINIER", "LIVREUR"], // marquer livrée ou récupérée
  voirTournees: ["ADMIN", "MAGASINIER", "LIVREUR"], // interventions du jour
  planifierTournees: ["ADMIN"], // répartir les interventions entre livreurs
};

/**
 * Ce rôle a-t-il le droit de faire cette action ?
 *
 * Refuse par défaut : un rôle inconnu, absent, ou une action non répertoriée
 * ne donnent aucun droit. Au moindre doute, on dit non.
 */
export function can(role, action) {
  const autorises = PERMISSIONS[action];
  if (!Array.isArray(autorises)) return false;
  return autorises.includes(role);
}

/** Où atterrir après la connexion, selon ce qu'on a le droit de faire. */
export function homePathFor(role) {
  return role === "LIVREUR" ? "/admin/tournees" : "/admin";
}
