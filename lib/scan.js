// Scan d'une étiquette de machine : quelle action proposer, et quoi imprimer.
//
// Principe directeur : ne jamais proposer un bouton qui échouerait. Les règles
// de livraison et de reprise ne sont donc PAS réécrites ici — on appelle
// directement deliveryDoneEffects, celle qu'utilise déjà le tableau de
// réservations. Impossible que les deux divergent un jour.

import { deliveryDoneEffects, unitStatusChangeError } from "./transitions.js";

// Statuts qui se pilotent à la main ; les autres découlent des livraisons.
const HORS_SERVICE = ["MAINTENANCE"];

/**
 * L'unique action pertinente pour cette machine à cet instant.
 *
 * @param unit      { status, productId }
 * @param booking   la réservation à laquelle la machine est affectée, ou null
 * @param delivery  la prochaine intervention de cette réservation, ou null
 * @param candidate une réservation en attente de machine, ou null
 * @returns { id, label, blocked } — blocked porte la raison quand l'action
 *          existe mais n'est pas encore possible — ou null s'il n'y a rien.
 */
export function nextAction({ unit, booking, delivery, candidate = null } = {}) {
  if (!unit) return null;

  // Une machine sortie du parc ne fait plus rien, quoi qu'il se passe autour.
  if (unit.status === "RETIRED") return null;

  // Une intervention planifiée l'emporte sur tout le reste : tant qu'une
  // machine est en location, elle ne peut pas être affectée ailleurs.
  if (booking && delivery && delivery.status === "SCHEDULED") {
    const resultat = deliveryDoneEffects(delivery, booking);
    const livraison = delivery.type === "PICKUP"
      ? { id: "pickup", label: "Marquer récupérée" }
      : { id: "deliver", label: "Marquer livrée" };
    return { ...livraison, blocked: resultat.error ?? null };
  }

  if (HORS_SERVICE.includes(unit.status)) {
    const erreur = unitStatusChangeError(unit, "AVAILABLE");
    return { id: "service", label: "Remettre en service", blocked: erreur };
  }

  // Machine libre, et une réservation attend une machine de ce modèle.
  if (unit.status === "AVAILABLE" && candidate && !candidate.unitId) {
    return {
      id: "assign",
      label: `Affecter à ${candidate.reference}`,
      blocked: null,
    };
  }

  return null;
}

/**
 * Adresse encodée dans le QR code. Une adresse complète, et non le seul numéro
 * de série : l'appareil photo d'un téléphone l'ouvre alors tout seul, sans
 * aucune application à installer.
 */
export function scanUrl(base, serialNumber) {
  const racine = String(base ?? "").replace(/\/+$/, "");
  return `${racine}/admin/scan/${encodeURIComponent(serialNumber)}`;
}

/** Découpe les machines en pages d'étiquettes, pour l'impression. */
export function labelSheets(units = [], parPage = 24) {
  const taille = Math.max(1, parPage);
  const pages = [];
  for (let i = 0; i < units.length; i += taille) {
    pages.push(units.slice(i, i + taille));
  }
  return pages;
}

/**
 * Convertit la matrice d'un QR code en segments horizontaux.
 *
 * Rendre un rectangle par module noir donnerait des centaines d'éléments et,
 * à l'impression, de fins liserés blancs entre eux. En fusionnant les modules
 * voisins d'une même ligne, on obtient un dessin net et bien plus léger.
 *
 * @param modules { size, data } tel que fourni par QRCode.create
 * @returns [{ x, y, largeur }]
 */
export function qrRuns(modules) {
  const taille = modules?.size ?? 0;
  const data = modules?.data ?? [];
  const segments = [];

  for (let y = 0; y < taille; y++) {
    let debut = -1;
    for (let x = 0; x <= taille; x++) {
      const noir = x < taille && data[y * taille + x] === 1;
      if (noir && debut === -1) debut = x;
      if (!noir && debut !== -1) {
        segments.push({ x: debut, y, largeur: x - debut });
        debut = -1;
      }
    }
  }
  return segments;
}
