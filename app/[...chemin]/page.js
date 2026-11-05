// Route unique des pages SEO (tarifs, modèles, zones, villes, blog…).
// Les routes existantes (accueil, /reserver, /admin, /contact…) restent
// prioritaires : Next.js ne passe ici que pour les adresses qu'aucune autre
// route ne reconnaît. Une adresse absente de lib/seoContenus.js donne un 404.

import { notFound } from "next/navigation";
import { prisma } from "../../lib/prisma";
import { ARTICLES, trouverPage, filAriane, faqDePage } from "../../lib/seoContenus";
import { remplirTout, valeursDepuisProduits, filArianeLd, faqLd, articleLd, produitLd } from "../../lib/seoGabarits";
import { SITE_URL, urlAbsolue } from "../../lib/seo";
import SeoPage from "../SeoPage";

// Prix et surfaces toujours à jour avec le back-office.
export const dynamic = "force-dynamic";

const TITRES_FIXES = {
  "/": "Accueil",
  "/contact": "Nous écrire",
  "/qui-sommes-nous": "Qui sommes-nous",
};

function chemin(params) {
  return "/" + (params.chemin ?? []).map(decodeURIComponent).join("/");
}

async function charger(params) {
  const brute = trouverPage(chemin(params));
  if (!brute) return null;

  const produits = await prisma.product.findMany({
    include: { images: { orderBy: { position: "asc" } } },
    orderBy: { dailyPrice: "asc" },
  });
  const valeurs = valeursDepuisProduits(produits);

  let page;
  try {
    page = remplirTout(brute, valeurs);
  } catch (e) {
    // Un modèle manquant en base : on préfère un 404 à une page avec des trous.
    console.error(`[seo] ${brute.chemin} : ${e.message}`);
    return null;
  }
  const produit = page.produit ? produits.find((p) => p.slug === page.produit) : null;
  if (page.produit && !produit) return null;

  return { page, produits: produits.filter((p) => p.active), produit, valeurs };
}

export async function generateMetadata({ params }) {
  const d = await charger(params);
  if (!d) return {};
  const { page } = d;
  const url = urlAbsolue(page.chemin);
  return {
    title: { absolute: page.title },
    description: page.description,
    alternates: { canonical: url },
    openGraph: {
      title: page.title,
      description: page.description,
      url,
      type: page.type === "article" ? "article" : "website",
      ...(page.type === "article" ? { publishedTime: page.date, modifiedTime: page.date } : {}),
    },
  };
}

export default async function Page({ params }) {
  const d = await charger(params);
  if (!d) notFound();
  const { page, produits, produit, valeurs } = d;

  const fil = filAriane(page);
  const faq = faqDePage(page);
  const url = urlAbsolue(page.chemin);

  const voirAussi = (page.voirAussi ?? []).map((c) => {
    const cible = trouverPage(c);
    return { chemin: c, titre: cible ? remplirTout(cible.h1, valeurs) : TITRES_FIXES[c] ?? c };
  });

  const jsonLd = [filArianeLd(fil, SITE_URL)];
  if (faq.length) jsonLd.push(faqLd(faq));
  if (page.type === "article") {
    jsonLd.push(articleLd({ titre: page.h1, description: page.description, url, datePublication: page.date, siteUrl: SITE_URL }));
  }
  if (produit) {
    const img = produit.images?.[0]?.url;
    jsonLd.push(produitLd({ produit, description: page.enBref, url, image: img ? urlAbsolue(img) : undefined }));
  }

  return (
    <SeoPage
      page={page}
      fil={fil}
      faq={faq}
      produits={produits}
      produit={produit}
      voirAussi={voirAussi}
      articles={remplirTout(ARTICLES, valeurs)}
      jsonLd={jsonLd}
    />
  );
}
