# Fusion catalogue/accueil — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Supprimer `/catalogue` (redondant avec l'accueil), remplacer la section "Nos modèles" de `/` par des fiches produits complètes en rangées alternées, rediriger et remettre à jour tous les liens internes.

**Architecture:** `app/page.js` reste un Server Component ; la section produits passe de la grille compacte actuelle à des rangées pleine largeur (une par modèle). `app/catalogue/` est supprimé, remplacé par une redirection déclarative dans `next.config.js`. Tous les liens internes vers `/catalogue` sont réécrits vers `/#modeles` (ou `#modeles` depuis l'accueil elle-même).

**Tech Stack:** Next.js 14 (App Router, `redirects()` dans `next.config.js`), CSS pur. Aucune nouvelle dépendance.

## Global Constraints

- Spec : `docs/superpowers/specs/2026-07-20-fusion-catalogue-accueil-design.md`
- Pas de vraies photos aujourd'hui — chaque rangée doit gérer `p.images[0]` absent (bloc "photo à venir") sans casser si une image existe.
- Page présentationnelle : pas de nouveau `*.test.js` (cohérent avec le reste du projet), vérification par `npm run build` + `npm test` (pas de régression `lib/`) + contrôle manuel.
- Un commit par tâche, directement sur `main`.

---

### Task 1: Supprimer `/catalogue`, ajouter la redirection

**Files:**
- Create: `next.config.js`
- Delete: `app/catalogue/page.js` (et le dossier `app/catalogue/` s'il devient vide)

**Interfaces:**
- Produces: redirection HTTP 301 `/catalogue` → `/#modeles`, active dès le prochain `npm run build`/`npm run dev` (les redirections `next.config.js` sont lues au démarrage du serveur).

- [ ] **Step 1: Créer `next.config.js`**

```js
/** @type {import('next').NextConfig} */
const nextConfig = {
  async redirects() {
    return [
      { source: "/catalogue", destination: "/#modeles", permanent: true },
    ];
  },
};

module.exports = nextConfig;
```

- [ ] **Step 2: Supprimer la page catalogue**

```bash
rm app/catalogue/page.js
rmdir app/catalogue
```

- [ ] **Step 3: Vérifier le build**

Run: `npm run build`
Expected: `✓ Compiled successfully`, plus de route `/catalogue` dans la liste des routes affichées.

- [ ] **Step 4: Commit**

```bash
git add next.config.js
git add -u app/catalogue
git commit -m "feat(accueil): supprimer /catalogue, rediriger vers /#modeles"
```

---

### Task 2: CSS des rangées produits + défilement doux

**Files:**
- Modify: `app/globals.css` (ajout en fin de fichier, après le bloc "Page d'accueil (étape 6)" ajouté précédemment)

**Interfaces:**
- Produces (classes consommées par Task 3) : `.model-row`, `.model-row.rev`, `.model-photo`, `.model-photo.placeholder`, `.model-badges`, `.model-badge`, `.model-info`. Ajoute aussi `scroll-behavior: smooth` sur `html` (sous `prefers-reduced-motion: no-preference`) et `scroll-margin-top` sur `#modeles`.

- [ ] **Step 1: Ajouter le bloc CSS**

Ajouter à la fin de `app/globals.css` :

```css

/* ---- Fusion catalogue/accueil ---- */
@media (prefers-reduced-motion: no-preference) {
  html { scroll-behavior: smooth; }
}

#modeles { scroll-margin-top: 100px; }

.model-row { display: grid; grid-template-columns: 1fr 1.3fr; gap: 36px; align-items: center; }
.model-row.rev { grid-template-columns: 1.3fr 1fr; }
.model-row.rev .model-photo { order: 2; }
.model-row + .model-row { margin-top: 70px; }

.model-photo { aspect-ratio: 4/3; border-radius: 18px; overflow: hidden; }
.model-photo img { width: 100%; height: 100%; object-fit: cover; display: block; }
.model-photo.placeholder {
  background: repeating-linear-gradient(45deg, var(--frost), var(--frost) 14px, var(--ice) 14px, var(--ice) 28px);
  border: 2px dashed rgba(63, 182, 224, 0.5);
  display: flex; align-items: center; justify-content: center;
  color: #5c7d94; font-size: 13px; text-align: center; padding: 20px;
}

.model-info h3 { font-size: 26px; margin-bottom: 10px; }
.model-badges { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 12px; }
.model-badge { background: rgba(255,255,255,0.85); border: 1px solid rgba(63,182,224,0.25); border-radius: 100px; padding: 5px 14px; font-size: 12.5px; color: var(--navy); font-weight: 600; }
.model-info .desc { font-size: 14.5px; color: #5c7d94; line-height: 1.7; margin-bottom: 16px; }
.model-info .price { font-family: "Space Grotesk"; font-size: 24px; font-weight: 700; color: var(--deep); margin-bottom: 4px; }
.model-info .price small { font-size: 13px; font-weight: 400; color: #5c7d94; }
.model-info .avail { margin-bottom: 14px; }

@media (max-width: 820px) {
  .model-row, .model-row.rev { grid-template-columns: 1fr; }
  .model-row.rev .model-photo { order: 0; }
  .model-row + .model-row { margin-top: 44px; }
}
```

- [ ] **Step 2: Vérifier le build**

Run: `npm run build`
Expected: `✓ Compiled successfully`.

- [ ] **Step 3: Commit**

```bash
git add app/globals.css
git commit -m "feat(accueil): styles des rangées produits + défilement doux"
```

---

### Task 3: Réécrire la section "Nos modèles" de `app/page.js`

**Files:**
- Modify: `app/page.js`

**Interfaces:**
- Consumes: classes CSS de Task 2, `prisma`, `euros`, `Reveal` (déjà importés).

- [ ] **Step 1: Étendre la requête Prisma (ajouter `images`)**

Remplacer :

```js
  const products = await prisma.product.findMany({
    where: { active: true },
    include: { units: true },
    orderBy: { dailyPrice: "asc" },
  });
```

Par :

```js
  const products = await prisma.product.findMany({
    where: { active: true },
    include: { units: true, images: { orderBy: { position: "asc" } } },
    orderBy: { dailyPrice: "asc" },
  });
```

- [ ] **Step 2: Remplacer la section "Nos modèles"**

Remplacer tout le bloc :

```jsx
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
```

Par :

```jsx
      <Reveal className="home-section">
        <div id="modeles">
          <span className="eyebrow">Nos modèles</span>
          <h2 className="section-title">Choisissez votre fraîcheur</h2>
          {products.map((p, i) => {
            const dispo = p.units.filter((u) => u.status === "AVAILABLE").length;
            const reservable = p.units.some((u) => !["RETIRED", "MAINTENANCE"].includes(u.status));
            const photo = p.images[0];
            return (
              <div className={`model-row ${i % 2 === 1 ? "rev" : ""}`} key={p.id}>
                <div className={`model-photo${photo ? "" : " placeholder"}`}>
                  {photo ? <img src={photo.url} alt={photo.alt} /> : "Photo à venir"}
                </div>
                <div className="model-info">
                  <h3>{p.name}</h3>
                  <div className="model-badges">
                    <span className="model-badge">Jusqu&apos;à {p.maxAreaM2} m²</span>
                    <span className="model-badge">{p.powerKw} kW</span>
                    <span className="model-badge">{p.noiseDb} dB</span>
                  </div>
                  <p className="desc">{p.description}</p>
                  <div className="price">
                    {euros(p.dailyPrice)} <small>/ jour</small>
                  </div>
                  <p className="avail">
                    {dispo > 0 ? (
                      <span className="stock-ok">✓ {dispo} disponible{dispo > 1 ? "s" : ""}</span>
                    ) : (
                      <span className="stock-ko">Indisponible actuellement</span>
                    )}
                  </p>
                  {reservable && (
                    <Link href={`/reserver/${p.slug}`} className="btn btn-primary">
                      Réserver
                    </Link>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </Reveal>
```

- [ ] **Step 3: Mettre à jour les deux boutons "Voir les climatiseurs" de cette page**

Remplacer (hero, ligne ~51) :

```jsx
          <Link href="/catalogue" className="btn btn-primary" style={{ marginTop: 30, display: "inline-block" }}>
```

Par :

```jsx
          <Link href="#modeles" className="btn btn-primary" style={{ marginTop: 30, display: "inline-block" }}>
```

Et remplacer (CTA final) :

```jsx
        <Link href="/catalogue" className="btn btn-primary">
          Voir les climatiseurs
        </Link>
```

Par :

```jsx
        <Link href="#modeles" className="btn btn-primary">
          Voir les climatiseurs
        </Link>
```

- [ ] **Step 4: Vérifier le build et les tests**

Run: `npm run build && npm test`
Expected: `✓ Compiled successfully`, `74/74` tests toujours au vert (aucun test ne touche `app/page.js`).

- [ ] **Step 5: Commit**

```bash
git add app/page.js
git commit -m "feat(accueil): fiches produits complètes en rangées alternées (fusion catalogue)"
```

---

### Task 4: Mettre à jour les liens restants + le cache back-office

**Files:**
- Modify: `app/layout.js`
- Modify: `app/reserver/confirmation/[reference]/page.js`
- Modify: `app/reserver/[slug]/page.js`
- Modify: `app/admin/actions.js`

**Interfaces:** aucune nouvelle — met à jour des `href`/`revalidatePath` existants pour pointer vers `/`/`/#modeles` au lieu de `/catalogue`.

- [ ] **Step 1: Menu du site (`app/layout.js`)**

Remplacer :

```jsx
            <Link href="/catalogue">Catalogue</Link>
```

Par :

```jsx
            <Link href="/#modeles">Catalogue</Link>
```

- [ ] **Step 2: Page de confirmation (`app/reserver/confirmation/[reference]/page.js`)**

Remplacer :

```jsx
        <Link href="/catalogue" className="btn btn-primary">
          Retour au catalogue
        </Link>
```

Par :

```jsx
        <Link href="/#modeles" className="btn btn-primary">
          Retour au catalogue
        </Link>
```

- [ ] **Step 3: Page de réservation, cas "modèle indisponible" (`app/reserver/[slug]/page.js`)**

Remplacer :

```jsx
            Ce modèle n&apos;est pas réservable pour le moment.{" "}
            <Link href="/catalogue">Voir les autres modèles</Link>.
```

Par :

```jsx
            Ce modèle n&apos;est pas réservable pour le moment.{" "}
            <Link href="/#modeles">Voir les autres modèles</Link>.
```

- [ ] **Step 4: Cache back-office (`app/admin/actions.js`)**

Dans `updateProduct` ET `createProduct`, remplacer chaque occurrence de :

```js
  revalidatePath("/catalogue");
```

Par :

```js
  revalidatePath("/");
```

(Deux occurrences au total, une par fonction — laisser `revalidatePath("/admin/produits")` inchangé juste au-dessus de chacune.)

- [ ] **Step 5: Vérifier le build et les tests**

Run: `npm run build && npm test`
Expected: `✓ Compiled successfully`, `74/74` tests au vert.

- [ ] **Step 6: Commit**

```bash
git add app/layout.js "app/reserver/confirmation/[reference]/page.js" "app/reserver/[slug]/page.js" app/admin/actions.js
git commit -m "fix: mettre à jour les liens internes et le cache après suppression de /catalogue"
```

---

### Task 5: Vérification manuelle

**Files:** aucun

- [ ] **Step 1: Lancer le site**

Run: `npm run dev`, ouvrir `http://localhost:3000/`

- [ ] **Step 2: Checklist**

- La section "Nos modèles" affiche les 3 modèles en rangées alternées (photo à gauche puis à droite), avec description, caractéristiques, prix, stock, bouton Réserver.
- Cliquer sur "Catalogue" dans le menu, ou sur un bouton "Voir les climatiseurs" : scroll fluide jusqu'à la section, qui n'est pas cachée sous le menu fixe.
- Aller sur `http://localhost:3000/catalogue` : redirection immédiate vers `/#modeles`.
- Depuis `/reserver/confirmation/<réf>` et `/reserver/<slug>`, les liens vers "le catalogue" fonctionnent (plus de 404).
- Modifier le prix d'un modèle dans `/admin/produits` : le nouveau prix apparaît immédiatement sur `/` (pas besoin de vider un cache).

- [ ] **Step 3: Corriger si besoin, sinon terminé**

Si un point échoue, corriger dans le fichier concerné et recommitter — pas de nouvelle tâche à créer.
