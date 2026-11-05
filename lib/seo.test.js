import { test } from "node:test";
import assert from "node:assert/strict";
import { PAGES_SEO, trouverPage, filAriane, faqDePage, ARTICLES } from "./seoContenus.js";
import {
  remplir,
  remplirTout,
  reperesUtilises,
  valeursDepuisProduits,
  nombreFr,
  eurosFr,
  faqLd,
  filArianeLd,
  produitLd,
  tableauPuissance,
} from "./seoGabarits.js";
import { pagesDuSitemap, CHEMINS_PRIVES, FAQ_ACCUEIL, urlAbsolue, SITE_URL } from "./seo.js";

// Les 3 modèles tels que le jeu d'essai (prisma/seed.js) les crée.
const PRODUITS = [
  { slug: "seine", name: "SEINE", dailyPrice: 1200, maxAreaM2: 20, powerKw: 2, noiseDb: 42, depositAmount: 10000 },
  { slug: "rivoli", name: "RIVOLI", dailyPrice: 1800, maxAreaM2: 35, powerKw: 2.9, noiseDb: 46, depositAmount: 15000 },
  { slug: "trocadero", name: "TROCADÉRO", dailyPrice: 2600, maxAreaM2: 55, powerKw: 3.5, noiseDb: 50, depositAmount: 25000 },
];
const VALEURS = valeursDepuisProduits(PRODUITS);
const PAGES_FIXES = ["/", "/contact", "/qui-sommes-nous", "/mentions-legales", "/confidentialite"];

function tousLesLiens(page) {
  const liens = [...(page.voirAussi ?? [])];
  if (page.parent) liens.push(page.parent);
  for (const s of page.sections) {
    for (const l of s.liens ?? []) liens.push(l.href);
    for (const h of s.h3 ?? []) if (h.lien) liens.push(h.lien.href);
  }
  return liens;
}

test("formatage des nombres à la française", () => {
  assert.equal(nombreFr(12), "12");
  assert.equal(nombreFr(2.9), "2,9");
  assert.equal(nombreFr(3412), "3 412");
  assert.equal(eurosFr(1200), "12");
  assert.equal(eurosFr(1250), "12,50");
  assert.equal(eurosFr(2900), "29");
});

test("les valeurs connues sont tirées des produits et du tarif", () => {
  assert.equal(VALEURS["seine.prix"], "12");
  assert.equal(VALEURS["rivoli.puissance"], "2,9");
  assert.equal(VALEURS["trocadero.caution"], "250");
  assert.equal(VALEURS.prixMin, "12");
  assert.equal(VALEURS.livraison, "29");
  assert.equal(VALEURS.remise7, "15");
  assert.equal(VALEURS.remise30, "30");
});

test("un repère inconnu fait échouer le remplissage au lieu d'être publié", () => {
  assert.equal(remplir("dès {seine.prix} €", VALEURS), "dès 12 €");
  assert.throws(() => remplir("{inconnu.prix}", VALEURS), /manquante/);
});

test("chaque page se remplit entièrement, sans repère ni note restante", () => {
  for (const page of PAGES_SEO) {
    const rempli = JSON.stringify(remplirTout(page, VALEURS));
    assert.doesNotMatch(rempli, /\{[a-zA-Z0-9.]+\}/, page.chemin);
    assert.doesNotMatch(rempli, /À COMPL[ÉE]TER|TODO|XXX/i, page.chemin);
  }
  for (const cle of reperesUtilises(PAGES_SEO)) assert.ok(cle in VALEURS, cle);
  assert.doesNotThrow(() => remplirTout(FAQ_ACCUEIL, VALEURS));
});

test("29 pages, adresses, titles et H1 uniques", () => {
  assert.equal(PAGES_SEO.length, 29);
  for (const champ of ["chemin", "title", "description", "h1"]) {
    const vus = PAGES_SEO.map((p) => p[champ]);
    assert.equal(new Set(vus).size, vus.length, `doublon de ${champ}`);
  }
});

test("chaque page a ses balises dans des longueurs raisonnables", () => {
  for (const page of PAGES_SEO) {
    const p = remplirTout(page, VALEURS);
    assert.ok(p.title.length >= 30 && p.title.length <= 95, `${p.chemin} title ${p.title.length}`);
    assert.ok(p.description.length >= 100 && p.description.length <= 170, `${p.chemin} meta ${p.description.length}`);
    assert.ok(p.h1.length > 10, p.chemin);
    assert.match(p.chemin, /^\/[a-z0-9/-]+$/, p.chemin);
    if (p.type !== "blog") assert.ok(p.enBref, `${p.chemin} sans « En bref »`);
  }
});

test("tous les liens internes mènent à une page qui existe", () => {
  for (const page of PAGES_SEO) {
    for (const lien of tousLesLiens(page)) {
      assert.ok(trouverPage(lien) || PAGES_FIXES.includes(lien), `${page.chemin} → ${lien}`);
    }
  }
});

test("chaque page département renvoie vers ses villes, chaque ville vers son département", () => {
  const villes = PAGES_SEO.filter((p) => p.type === "ville");
  assert.equal(villes.length, 6);
  for (const v of villes) {
    const dept = trouverPage(v.parent);
    assert.equal(dept.type, "departement");
    assert.ok(tousLesLiens(dept).includes(v.chemin), `${dept.chemin} ne lie pas ${v.chemin}`);
    assert.ok(v.voirAussi.includes(v.parent));
  }
});

test("le fil d'Ariane part de l'accueil et finit sur la page", () => {
  const fil = filAriane(trouverPage("/location-climatiseur-val-de-marne/vincennes"));
  assert.deepEqual(
    fil.map((e) => e.chemin),
    ["/", "/zones-de-livraison", "/location-climatiseur-val-de-marne", "/location-climatiseur-val-de-marne/vincennes"],
  );
  const ld = filArianeLd(fil, SITE_URL);
  assert.equal(ld.itemListElement[3].position, 4);
  assert.equal(ld.itemListElement[0].item, SITE_URL + "/");
});

test("les FAQ et le balisage FAQPage sont complets", () => {
  for (const page of PAGES_SEO.filter((p) => p.type !== "blog")) {
    const faq = faqDePage(page);
    assert.ok(faq.length >= 1, `${page.chemin} sans FAQ`);
    for (const f of faq) assert.ok(f.q.endsWith("?") && f.r.length > 1, `${page.chemin} : ${f.q}`);
  }
  assert.equal(faqDePage(trouverPage("/faq")).length, 9);
  const ld = faqLd([{ q: "Q ?", r: "R." }]);
  assert.equal(ld["@type"], "FAQPage");
  assert.equal(ld.mainEntity[0].acceptedAnswer.text, "R.");
});

test("les articles ont une date, les fiches produit un balisage Product avec prix par jour", () => {
  assert.equal(ARTICLES.length, 8);
  for (const a of ARTICLES) assert.match(a.date, /^\d{4}-\d{2}-\d{2}$/);
  const ld = produitLd({ produit: PRODUITS[0], description: "x", url: urlAbsolue("/climatiseurs/seine") });
  assert.equal(ld.offers.price, "12.00");
  assert.equal(ld.offers.priceSpecification.unitCode, "DAY");
});

test("le tableau de puissance suit la règle des 100 W/m²", () => {
  const t = tableauPuissance([20, 35]);
  assert.deepEqual(t[0], { surface: 20, kw: 2, btu: 6800 });
  assert.equal(t[1].kw, 3.5);
});

test("le sitemap liste 34 pages publiques et aucune page privée", () => {
  const chemins = pagesDuSitemap().map((p) => p.chemin);
  assert.equal(chemins.length, 34);
  assert.equal(new Set(chemins).size, 34);
  for (const c of chemins) assert.ok(!CHEMINS_PRIVES.some((x) => c.startsWith(x)), c);
  assert.ok(chemins.includes("/climatiseurs/seine"));
  assert.equal(urlAbsolue("/"), SITE_URL);
});

test("les pages pas encore prêtes ne sont ni publiées ni liées", () => {
  const brouillons = ["/alternative-kiloutou-location-climatiseur", "/blog/louer-ou-acheter-climatiseur"];
  const tout = JSON.stringify(PAGES_SEO);
  for (const b of brouillons) assert.ok(!tout.includes(b), b);
});
