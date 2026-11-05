// Règles qui protègent les deux garanties des tournées : une reprise du jour
// ne passe jamais avant sa livraison, et une tournée commencée n'appartient
// plus qu'à son livreur.

const aFaire = (d) => d.status === "SCHEDULED";

/**
 * Les interventions à déplacer ensemble : la livraison et la reprise d'une
 * location d'un jour, encore à faire toutes les deux. duJour : toutes les
 * interventions de ce jour-là.
 */
export function interventionsLiees(delivery, duJour) {
  return duJour
    .filter((d) => d.id === delivery.id || (d.bookingId === delivery.bookingId && aFaire(d)))
    .map((d) => d.id);
}

/**
 * Reprises à ne pas planifier : leur livraison du même jour reste à faire
 * mais n'est pas dans le calcul (tournée déjà commencée). Confiées à un
 * autre livreur, elles pourraient passer avant la machine.
 */
export function reprisesOrphelines(aPlacer, duJour) {
  const placees = new Set(aPlacer.map((d) => d.id));
  return aPlacer
    .filter(
      (p) =>
        p.type === "PICKUP" &&
        duJour.some((d) => d.type === "DROPOFF" && d.bookingId === p.bookingId && aFaire(d) && !placees.has(d.id))
    )
    .map((p) => p.id);
}

/** Refus de « Donner à… » quand une des deux tournées est commencée. */
export function erreurReattribution(source, cible) {
  if (source?.status === "STARTED" || cible?.status === "STARTED") {
    return "Ce livreur a déjà commencé sa tournée : elle ne peut plus recevoir ni céder d'arrêt.";
  }
  return null;
}
