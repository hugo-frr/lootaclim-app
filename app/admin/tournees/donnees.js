// Petits utilitaires d'affichage partagés par les vues admin et livreur.

import { nowInParis } from "../../../lib/dates";

/** Le jour demandé dans l'URL (AAAA-MM-JJ), ou aujourd'hui. */
export function jourDemande(param) {
  return /^\d{4}-\d{2}-\d{2}$/.test(param ?? "") && !Number.isNaN(Date.parse(param))
    ? param
    : nowInParis().day;
}

export const adresseTexte = (a) => `${a.line1}, ${a.zip} ${a.city}`;

export const libelleArret = (d) =>
  `${d.type === "PICKUP" ? "Reprise" : "Livraison"} · ${d.booking.customer.firstName} ${d.booking.customer.lastName} · ${d.timeSlot}`;

/** Les arrêts d'une tournée, prêts pour la carte. */
export function pointsDeTournee(deliveries) {
  return deliveries
    .filter((d) => d.booking.address.lat != null)
    .map((d, i) => ({
      lat: d.booking.address.lat,
      lng: d.booking.address.lng,
      numero: d.ordre ?? i + 1,
      label: libelleArret(d),
      fait: d.status !== "SCHEDULED",
    }));
}

export const dateLongue = (day) =>
  new Date(day).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
