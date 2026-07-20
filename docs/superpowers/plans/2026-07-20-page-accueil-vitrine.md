# Page d'accueil vitrine — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remplacer le placeholder de `/` par une page d'accueil complète : hero à cartes flottantes, "comment ça marche", aperçu des modèles (stock en direct), réassurance, CTA final.

**Architecture:** `app/page.js` reste un Server Component (requête Prisma directe, comme `/catalogue`). Un seul nouveau composant client, `app/Reveal.js`, encapsule l'apparition au scroll (IntersectionObserver) autour de chaque section. Tout le reste est du CSS ajouté à `app/globals.css`, dans le style déjà en place (variables `--navy/--ice/--frost/--cool/--deep`, `Space Grotesk`/`Inter`, cartes en verre dépoli).

**Tech Stack:** Next.js 14 (App Router), React Server Components, CSS pur (pas de librairie d'animation). Aucune nouvelle dépendance npm.

## Global Constraints

- Spec : `docs/superpowers/specs/2026-07-20-page-accueil-vitrine-design.md`
- Pas de vraies photos produit (aucune n'existe dans le projet) — design uniquement graphique/CSS.
- Pas de rendu 3D WebGL, pas d'effet de parallax à la souris (écartés en brainstorming).
- Respect de `prefers-reduced-motion` : flottement et apparition au scroll désactivés si demandé.
- Cette page est presentationnelle (comme `/catalogue`, `/admin` déjà dans le projet) : **pas de nouveau fichier `*.test.js`**, cohérent avec la convention déjà en place dans ce projet (voir en-tête de `lib/stripe.js`) — vérification par `npm run build` + contrôle manuel dans le navigateur à la dernière tâche.
- Un commit par tâche, directement sur `main` (pas de worktree, convention du projet).

---

### Task 1: `app/Reveal.js` — composant d'apparition au scroll

**Files:**
- Create: `app/Reveal.js`

**Interfaces:**
- Produces: `export default function Reveal({ children, className })` — composant client. Rend un `<div>` dont la classe passe de `"reveal"` à `"reveal visible"` dès qu'il entre dans le viewport (une seule fois). `className` (optionnel, défaut `""`) est ajouté tel quel après `"reveal"`/`"visible"`. Utilisé par `app/page.js` (Task 3) autour des sections 2 à 5.

- [ ] **Step 1: Écrire le composant**

```jsx
"use client";

import { useEffect, useRef, useState } from "react";

// Ajoute la classe "visible" dès que l'élément entre dans le viewport, une
// seule fois — utilisé pour l'apparition en fondu au scroll des sections de
// la page d'accueil (voir .reveal / .reveal.visible dans globals.css).
export default function Reveal({ children, className = "" }) {
  const ref = useRef(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { threshold: 0.15 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={ref} className={`reveal ${visible ? "visible" : ""} ${className}`}>
      {children}
    </div>
  );
}
```

- [ ] **Step 2: Vérifier qu'il n'y a pas d'erreur de build**

Run: `npm run build`
Expected: `✓ Compiled successfully` (le composant n'est utilisé nulle part encore, donc pas d'effet visible — on vérifie juste l'absence d'erreur de syntaxe/типage).

- [ ] **Step 3: Commit**

```bash
git add app/Reveal.js
git commit -m "feat(accueil): composant Reveal (apparition au scroll)"
```

---

### Task 2: CSS de la page d'accueil

**Files:**
- Modify: `app/globals.css` (ajout en fin de fichier, après la section `/* ---- Back-office (étape 3) ---- */`)

**Interfaces:**
- Produces (classes CSS consommées par Task 3) : `.hero`, `.hero-copy`, `.hero-cards`, `.hero-card`, `.hero-card-1`, `.hero-card-2`, `.hero-card-3`, `.home-section`, `.reveal`, `.reveal.visible`, `.steps`, `.step`, `.reassurance`, `.reassurance-item`, `.home-cta`.

- [ ] **Step 1: Ajouter le bloc CSS**

Ajouter à la fin de `app/globals.css` :

```css

/* ---- Page d'accueil (étape 6) ---- */
.hero { display: grid; grid-template-columns: 1.1fr 1fr; gap: 40px; align-items: center; min-height: 420px; }
.hero-copy { text-align: left; }
.hero-cards { position: relative; height: 320px; }
.hero-card {
  position: absolute;
  background: rgba(255, 255, 255, 0.92);
  backdrop-filter: blur(10px);
  border: 1px solid rgba(63, 182, 224, 0.25);
  border-radius: 16px;
  padding: 16px 20px;
  box-shadow: 0 20px 40px rgba(18, 115, 166, 0.18);
  font-weight: 600;
  font-size: 15px;
  color: var(--navy);
  animation: hero-float 6s ease-in-out infinite;
}
.hero-card small { display: block; font-weight: 400; color: #5c7d94; font-size: 12.5px; margin-top: 3px; }
.hero-card-1 { top: 10px; right: 60px; --rot: 3deg; animation-delay: 0s; }
.hero-card-2 { top: 130px; right: 130px; --rot: -2deg; animation-delay: 1.5s; }
.hero-card-3 { top: 250px; right: 40px; --rot: 4deg; animation-delay: 3s; }

@keyframes hero-float {
  0%, 100% { transform: translateY(0) rotate(var(--rot, 0deg)); }
  50% { transform: translateY(-14px) rotate(var(--rot, 0deg)); }
}

.home-section { margin-top: 90px; }

.reveal { opacity: 0; transform: translateY(24px); transition: opacity 0.7s var(--ease), transform 0.7s var(--ease); }
.reveal.visible { opacity: 1; transform: translateY(0); }

.steps { display: grid; grid-template-columns: repeat(3, 1fr); gap: 24px; margin-top: 30px; }
.step p { margin-top: 8px; font-size: 14px; color: #5c7d94; line-height: 1.6; }

.reassurance { display: grid; grid-template-columns: repeat(4, 1fr); gap: 18px; margin-top: 20px; }
.reassurance-item { text-align: center; padding: 20px 14px; }
.reassurance-item .ico { font-size: 26px; margin-bottom: 8px; }
.reassurance-item p { font-size: 13.5px; color: #5c7d94; margin-top: 4px; }

.home-cta { text-align: center; }
.home-cta .btn { margin-top: 20px; }

@media (prefers-reduced-motion: reduce) {
  .hero-card { animation: none; }
  .reveal { opacity: 1; transform: none; transition: none; }
}

@media (max-width: 820px) {
  .hero { grid-template-columns: 1fr; text-align: center; }
  .hero-copy { text-align: center; }
  .hero-cards { position: static; height: auto; display: flex; flex-direction: column; gap: 14px; margin-top: 30px; }
  .hero-card { position: static; animation: none; }
  .steps, .reassurance { grid-template-columns: 1fr; }
}
```

- [ ] **Step 2: Vérifier qu'il n'y a pas d'erreur de build**

Run: `npm run build`
Expected: `✓ Compiled successfully` (CSS pas encore utilisé par une page — on vérifie juste l'absence d'erreur).

- [ ] **Step 3: Commit**

```bash
git add app/globals.css
git commit -m "feat(accueil): styles CSS (hero flottant, apparition au scroll, sections)"
```

---

### Task 3: Réécrire `app/page.js`

**Files:**
- Modify: `app/page.js` (remplacement intégral du fichier actuel)

**Interfaces:**
- Consumes: `Reveal` (Task 1, `export default` depuis `./Reveal`), classes CSS de Task 2, `prisma` (`../lib/prisma`, déjà utilisé par `app/catalogue/page.js`), `euros` (`../lib/constants`).

- [ ] **Step 1: Remplacer le contenu du fichier**

```jsx
import Link from "next/link";
import { prisma } from "../lib/prisma";
import { euros } from "../lib/constants";
import Reveal from "./Reveal";

export const dynamic = "force-dynamic"; // stock des modèles toujours à jour

const STEPS = [
  {
    title: "Choisissez votre modèle",
    text: "Comparez les 3 climatiseurs selon la surface à rafraîchir et réservez vos dates en ligne.",
  },
  {
    title: "Livraison en 24h",
    text: "On vous livre et on installe la machine chez vous, sur le créneau de 2h que vous avez choisi.",
  },
  {
    title: "On reprend en fin de location",
    text: "À la date convenue, on repasse récupérer la machine — rien à faire de votre côté.",
  },
];

const REASSURANCE = [
  { ico: "📍", title: "Paris & petite couronne", text: "Livraison dans tout Paris et la petite couronne." },
  { ico: "🔧", title: "Sans travaux", text: "Aucune installation fixe, aucun perçage." },
  { ico: "💳", title: "Caution simple", text: "Empreinte bancaire, jamais débitée sauf dégât constaté." },
  { ico: "📅", title: "Annulation flexible", text: "Vous changez d'avis ? On annule sans frais avant livraison." },
];

export default async function Home() {
  const products = await prisma.product.findMany({
    where: { active: true },
    include: { units: true },
    orderBy: { dailyPrice: "asc" },
  });

  return (
    <div>
      <section className="hero">
        <div className="hero-copy">
          <span className="eyebrow">Paris · Livraison en 24h</span>
          <h1 style={{ fontSize: "clamp(40px, 6vw, 72px)", lineHeight: 0.98, margin: "18px 0" }}>
            L&apos;été à Paris,
            <br />
            <span style={{ color: "var(--cool)" }}>enfin frais.</span>
          </h1>
          <p style={{ maxWidth: 440, color: "#33536b", fontWeight: 300, fontSize: 18 }}>
            Louez un climatiseur mobile, livré et installé chez vous. Sans
            travaux, sans engagement, sans transpirer.
          </p>
          <Link href="/catalogue" className="btn btn-primary" style={{ marginTop: 30, display: "inline-block" }}>
            Voir les climatiseurs
          </Link>
        </div>
        <div className="hero-cards" aria-hidden="true">
          <div className="hero-card hero-card-1">
            🚚 Livraison 24h
            <small>Paris &amp; petite couronne</small>
          </div>
          <div className="hero-card hero-card-2">
            💶 dès 12€
            <small>par jour, dégressif</small>
          </div>
          <div className="hero-card hero-card-3">
            ✓ Sans engagement
            <small>caution simple</small>
          </div>
        </div>
      </section>

      <Reveal className="home-section">
        <span className="eyebrow">Comment ça marche</span>
        <h2 className="section-title">3 étapes, zéro complication</h2>
        <div className="steps">
          {STEPS.map((s, i) => (
            <div className="step" key={s.title}>
              <span className="step-num">{i + 1}</span>
              <strong>{s.title}</strong>
              <p>{s.text}</p>
            </div>
          ))}
        </div>
      </Reveal>

      <Reveal className="home-section">
        <span className="eyebrow">Nos modèles</span>
        <h2 className="section-title">Choisissez votre fraîcheur</h2>
        <div className="grid3">
          {products.map((p) => {
            const dispo = p.units.filter((u) => u.status === "AVAILABLE").length;
            return (
              <Link
                href={`/reserver/${p.slug}`}
                key={p.id}
                className="card product-card"
                style={{ display: "block", textDecoration: "none", color: "inherit" }}
              >
                <div className="ph">📷 {p.name}</div>
                <h3>{p.name}</h3>
                <div className="specs">Jusqu&apos;à {p.maxAreaM2} m²</div>
                <div className="price">
                  {euros(p.dailyPrice)} <small>/ jour</small>
                </div>
                <p style={{ marginTop: 10 }}>
                  {dispo > 0 ? (
                    <span className="stock-ok">✓ {dispo} disponible{dispo > 1 ? "s" : ""}</span>
                  ) : (
                    <span className="stock-ko">Indisponible actuellement</span>
                  )}
                </p>
              </Link>
            );
          })}
        </div>
      </Reveal>

      <Reveal className="home-section">
        <div className="reassurance">
          {REASSURANCE.map((r) => (
            <div className="reassurance-item" key={r.title}>
              <div className="ico">{r.ico}</div>
              <strong>{r.title}</strong>
              <p>{r.text}</p>
            </div>
          ))}
        </div>
      </Reveal>

      <Reveal className="home-section home-cta">
        <h2 className="section-title" style={{ fontSize: 28 }}>
          Prêt à retrouver la fraîcheur ?
        </h2>
        <Link href="/catalogue" className="btn btn-primary">
          Voir les climatiseurs
        </Link>
      </Reveal>
    </div>
  );
}
```

- [ ] **Step 2: Vérifier le build**

Run: `npm run build`
Expected: `✓ Compiled successfully`, route `/` listée dans la sortie.

- [ ] **Step 3: Commit**

```bash
git add app/page.js
git commit -m "feat(accueil): page d'accueil complète (hero, étapes, modèles, réassurance, CTA)"
```

---

### Task 4: Vérification manuelle dans le navigateur

**Files:** aucun (vérification uniquement)

- [ ] **Step 1: Lancer le site**

Run: `npm run dev`, ouvrir `http://localhost:3000/`

- [ ] **Step 2: Checklist visuelle**

- Les 3 cartes du hero flottent doucement (mouvement vertical continu, désynchronisé entre les 3).
- En scrollant, chaque section (étapes, modèles, réassurance, CTA) apparaît en fondu/glissement.
- Les 3 modèles affichent le bon prix et le bon stock (comparer avec `/catalogue`), et chaque carte mène bien vers `/reserver/<slug>`.
- Réduire la fenêtre (< 820px) : le hero passe en une colonne, les cartes ne se chevauchent plus, les grilles passent à 1 colonne.
- Dans les Préférences Système → Accessibilité → activer "Réduire les animations" (ou `prefers-reduced-motion` via les DevTools) : le flottement et l'apparition au scroll doivent disparaître (tout doit s'afficher directement, sans animation).

- [ ] **Step 3: Corriger si besoin, sinon terminé**

Si un point de la checklist échoue, corriger dans le fichier concerné (Task 2 ou 3) et recommitter — pas de nouvelle tâche à créer pour ça, ce sont des ajustements du même travail.
