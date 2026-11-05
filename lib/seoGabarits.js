// Remplit les textes SEO avec les vraies valeurs de la base (prix, surfaces,
// puissances, cautions) et fabrique le balisage schema.org lu par Google et
// les IA. Les textes de lib/seoContenus.js contiennent des repères comme
// {seine.prix} : changer un prix dans le back-office met donc toutes les
// pages à jour, sans retoucher un seul texte.

import { DELIVERY_FEE, discountRate } from "./pricing.js";

// 12 → "12" ; 12.5 → "12,50" ; 2.9 → "2,9"
export function nombreFr(n, decimalesSiFraction = 1) {
  if (Number.isInteger(n)) return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  return n.toFixed(decimalesSiFraction).replace(".", ",");
}

export function eurosFr(centimes) {
  return nombreFr(centimes / 100, 2);
}

// Construit le dictionnaire des valeurs à partir des produits de la base.
export function valeursDepuisProduits(produits) {
  const v = {
    livraison: eurosFr(DELIVERY_FEE),
    remise7: nombreFr(Math.round(discountRate(7) * 100)),
    remise30: nombreFr(Math.round(discountRate(30) * 100)),
  };
  for (const p of produits) {
    const k = p.slug;
    v[`${k}.nom`] = p.name;
    v[`${k}.prix`] = eurosFr(p.dailyPrice);
    v[`${k}.surface`] = nombreFr(p.maxAreaM2);
    v[`${k}.puissance`] = nombreFr(p.powerKw);
    v[`${k}.bruit`] = nombreFr(p.noiseDb);
    v[`${k}.caution`] = eurosFr(p.depositAmount);
  }
  const prixMin = produits.length ? Math.min(...produits.map((p) => p.dailyPrice)) : null;
  if (prixMin !== null) v.prixMin = eurosFr(prixMin);
  return v;
}

const REPERE = /\{([a-zA-Z0-9.]+)\}/g;

// Remplace les {repères} d'un texte. Un repère inconnu déclenche une erreur :
// mieux vaut une page absente qu'une page publiée avec « {seine.prix} ».
export function remplir(texte, valeurs) {
  return texte.replace(REPERE, (tout, cle) => {
    if (!(cle in valeurs)) throw new Error(`Valeur SEO manquante : ${cle}`);
    return valeurs[cle];
  });
}

// Applique remplir() à toutes les chaînes d'un objet (page entière).
export function remplirTout(objet, valeurs) {
  if (typeof objet === "string") return remplir(objet, valeurs);
  if (Array.isArray(objet)) return objet.map((x) => remplirTout(x, valeurs));
  if (objet && typeof objet === "object") {
    const res = {};
    for (const [k, x] of Object.entries(objet)) res[k] = remplirTout(x, valeurs);
    return res;
  }
  return objet;
}

// Liste les {repères} d'un objet (pour les tests).
export function reperesUtilises(objet, acc = new Set()) {
  if (typeof objet === "string") for (const m of objet.matchAll(REPERE)) acc.add(m[1]);
  else if (Array.isArray(objet)) objet.forEach((x) => reperesUtilises(x, acc));
  else if (objet && typeof objet === "object") Object.values(objet).forEach((x) => reperesUtilises(x, acc));
  return acc;
}

// ---- Balisage schema.org ----

export function filArianeLd(fil, siteUrl) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: fil.map((e, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: e.nom,
      item: siteUrl + e.chemin,
    })),
  };
}

export function faqLd(faq) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faq.map((f) => ({
      "@type": "Question",
      name: f.q,
      acceptedAnswer: { "@type": "Answer", text: f.r },
    })),
  };
}

export function articleLd({ titre, description, url, datePublication, dateMaj, siteUrl }) {
  const editeur = { "@type": "Organization", name: "LOOTACLIM", url: siteUrl };
  return {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: titre,
    description,
    mainEntityOfPage: url,
    datePublished: datePublication,
    dateModified: dateMaj ?? datePublication,
    inLanguage: "fr-FR",
    author: editeur,
    publisher: editeur,
  };
}

export function produitLd({ produit, description, url, image }) {
  return {
    "@context": "https://schema.org",
    "@type": "Product",
    name: `Climatiseur mobile ${produit.name}`,
    description,
    url,
    ...(image ? { image } : {}),
    brand: { "@type": "Brand", name: "LOOTACLIM" },
    additionalProperty: [
      { "@type": "PropertyValue", name: "Puissance frigorifique", value: produit.powerKw, unitCode: "KWT" },
      { "@type": "PropertyValue", name: "Niveau sonore", value: produit.noiseDb, unitText: "dB" },
      { "@type": "PropertyValue", name: "Surface conseillée", value: produit.maxAreaM2, unitCode: "MTK" },
    ],
    offers: {
      "@type": "Offer",
      url,
      priceCurrency: "EUR",
      price: (produit.dailyPrice / 100).toFixed(2),
      priceSpecification: {
        "@type": "UnitPriceSpecification",
        price: (produit.dailyPrice / 100).toFixed(2),
        priceCurrency: "EUR",
        unitCode: "DAY",
        referenceQuantity: { "@type": "QuantitativeValue", value: 1, unitCode: "DAY" },
      },
      availability: "https://schema.org/InStock",
      areaServed: ["Paris", "Hauts-de-Seine", "Seine-Saint-Denis", "Val-de-Marne"],
    },
  };
}

// Tableau surface → puissance conseillée (règle des 100 W/m²).
export function tableauPuissance(surfaces = [10, 15, 20, 25, 30, 35, 40, 50]) {
  return surfaces.map((m2) => {
    const kw = m2 / 10;
    const btu = Math.round((kw * 3412) / 100) * 100;
    return { surface: m2, kw, btu };
  });
}
