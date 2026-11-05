// Réglages SEO communs à tout le site : adresse publique, pages à déclarer à
// Google (sitemap), chemins à lui cacher (robots.txt), FAQ de l'accueil et
// balisage « Organisation ».

import { SITE } from "./legal.js";
import { PAGES_SEO } from "./seoContenus.js";

// Adresse publique du site, sans « / » final. Surchargeable par variable
// d'environnement si le domaine change un jour.
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || "https://www.lootaclim.fr").replace(/\/+$/, "");

export function urlAbsolue(chemin) {
  return SITE_URL + (chemin === "/" ? "" : chemin);
}

// Pages « classiques » (hors gabarit SEO) à mettre dans le sitemap.
const PAGES_FIXES = [
  { chemin: "/", priorite: 1, frequence: "weekly" },
  { chemin: "/qui-sommes-nous", priorite: 0.5, frequence: "monthly" },
  { chemin: "/contact", priorite: 0.4, frequence: "yearly" },
  { chemin: "/mentions-legales", priorite: 0.1, frequence: "yearly" },
  { chemin: "/confidentialite", priorite: 0.1, frequence: "yearly" },
];

function prioriteSeo(page) {
  if (page.type === "produit" || ["/tarifs", "/climatiseurs", "/livraison-climatiseur-24h"].includes(page.chemin)) return 0.9;
  if (page.type === "article") return 0.7;
  return 0.8;
}

export function pagesDuSitemap() {
  return [
    ...PAGES_FIXES,
    ...PAGES_SEO.map((p) => ({
      chemin: p.chemin,
      priorite: prioriteSeo(p),
      frequence: p.type === "article" ? "monthly" : "weekly",
    })),
  ];
}

// Ce que Google n'a pas à explorer : back-office, API, pages de confirmation
// de réservation (personnelles) et tunnel de réservation.
export const CHEMINS_PRIVES = ["/admin", "/api", "/reserver/confirmation"];

// FAQ de l'accueil, balisée FAQPage. Les {repères} sont remplis avec la base.
export const FAQ_ACCUEIL = [
  {
    q: "Combien coûte la location d'un climatiseur à Paris ?",
    r: "Chez LOOTACLIM, la location d'un climatiseur mobile coûte à partir de {prixMin} € par jour, avec -{remise7} % dès 7 jours et -{remise30} % dès 30 jours. La livraison et la reprise coûtent {livraison} € par location.",
  },
  {
    q: "En combien de temps le climatiseur est-il livré ?",
    r: "Sous 24h, sur un créneau de 2 heures que vous choisissez. On installe le climatiseur et le kit fenêtre, puis on le met en route avant de partir.",
  },
  {
    q: "Où livrez-vous ?",
    r: "Dans les 20 arrondissements de Paris et en petite couronne : Hauts-de-Seine (92), Seine-Saint-Denis (93) et Val-de-Marne (94).",
  },
  {
    q: "Faut-il faire des travaux ?",
    r: "Non. Un climatiseur mobile n'a pas d'unité extérieure : la gaine d'air chaud passe par une fenêtre, fermée par un kit de calfeutrage posé sans perçage.",
  },
];

export function organisationLd() {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: SITE.nom,
    url: SITE_URL,
    logo: `${SITE_URL}/icon.png`,
    email: SITE.email,
    description:
      "Location de climatiseurs mobiles livrés et installés en 24h à Paris et en petite couronne (92, 93, 94), sans travaux.",
    areaServed: ["Paris", "Hauts-de-Seine", "Seine-Saint-Denis", "Val-de-Marne"],
  };
}
