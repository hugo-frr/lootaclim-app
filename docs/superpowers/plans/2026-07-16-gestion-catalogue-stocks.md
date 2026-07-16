# Gestion du catalogue et des stocks — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permettre depuis `/admin` de créer un nouveau modèle de climatiseur, d'ajouter une machine en stock, et de gérer un nouveau type d'article (kits de calfeutrage) suivi individuellement comme les machines — sans jamais passer par Prisma Studio.

**Architecture:** Les kits de calfeutrage sont un quasi-miroir du modèle `Unit` existant (statut, affectation à une réservation, pilotage automatique par les livraisons), mais universels (aucun lien à un modèle précis). La création de modèle et de machine réutilise les mêmes formulaires/actions Server Actions déjà en place pour l'édition, avec une génération automatique de l'adresse web (slug) pour les nouveaux modèles.

**Tech Stack:** Next.js 14 (App Router, Server Actions), Prisma + SQLite, `node --test` pour les fonctions pures.

## Global Constraints

- Toutes les chaînes visibles par l'utilisateur sont en français, ton simple.
- Les montants sont toujours en CENTIMES en base ; conversion euros↔centimes uniquement aux frontières (formulaires).
- Toute règle de décision (transitions, slug) reste une fonction pure testée par `node --test` — les fonctions qui touchent Prisma ne sont pas unitairement testées (vérifiées en bout en bout à la tâche 7), même convention que les étapes précédentes.
- Jamais de suppression définitive d'un modèle, d'une machine ou d'un kit : seul le passage au statut « Retiré » (ou « Non visible » pour un modèle) existe.
- `npm test` doit rester vert après chaque tâche.
- Commits fréquents, un par tâche minimum.

---

## Task 1: Schéma — Kit, Booking.kitId, libellés

**Files:**
- Modify: `prisma/schema.prisma`
- Modify: `lib/constants.js`

**Interfaces:**
- Produces: modèle Prisma `Kit` (`id`, `serialNumber`, `status`, `notes`, `bookings`), champ `Booking.kitId` (+ relation `kit`), constante `KIT_STATUS` exportée de `lib/constants.js`. Consommés par toutes les tâches suivantes.

- [ ] **Step 1: Ajouter le modèle `Kit` et le champ `Booking.kitId` dans `prisma/schema.prisma`**

Ajouter ce nouveau modèle, juste après le modèle `Unit` :

```prisma
// Un kit de calfeutrage physique — universel, pas lié à un modèle précis.
model Kit {
  id           String    @id @default(cuid())
  serialNumber String    @unique
  status       String    @default("AVAILABLE") // AVAILABLE | RENTED | MAINTENANCE | RETIRED
  notes        String?
  bookings     Booking[]
}
```

Dans le modèle `Booking`, ajouter le champ et la relation juste après `unitId` :

```prisma
  unit        Unit?      @relation(fields: [unitId], references: [id])
  unitId      String?
  kit         Kit?       @relation(fields: [kitId], references: [id])
  kitId       String?
```

- [ ] **Step 2: Lancer la migration**

Run: `npx prisma migrate dev --name kits-calfeutrage`
Expected: `Your database is now in sync with your schema.`

- [ ] **Step 3: Ajouter les libellés dans `lib/constants.js`**

Ajouter juste après l'export `UNIT_STATUS` :

```js
export const KIT_STATUS = {
  AVAILABLE: "Disponible",
  RENTED: "En location",
  MAINTENANCE: "En maintenance",
  RETIRED: "Retiré",
};
```

- [ ] **Step 4: Vérifier que rien n'est cassé**

Run: `npm test`
Expected: tous les tests existants passent toujours (aucune fonction pure modifiée dans cette tâche).

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma prisma/migrations lib/constants.js
git commit -m "feat: modèle Kit (calfeutrage) et libellés"
```

---

## Task 2: `lib/slug.js` — génération d'adresse web

**Files:**
- Create: `lib/slug.js`
- Test: `lib/slug.test.js`

**Interfaces:**
- Produces: `slugify(name)` → `string`, consommée par la tâche 4 (`createProduct`).

- [ ] **Step 1: Écrire les tests qui échouent**

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { slugify } from "./slug.js";

test("slugify : cas simple", () => {
  assert.equal(slugify("Rivoli"), "rivoli");
});

test("slugify : accents retirés", () => {
  assert.equal(slugify("Climatiseur Bastille"), "climatiseur-bastille");
  assert.equal(slugify("Été Frais"), "ete-frais");
});

test("slugify : espaces multiples et caractères spéciaux réduits à un seul tiret", () => {
  assert.equal(slugify("  Super   Modèle !!  "), "super-modele");
  assert.equal(slugify("Modèle n°2 (2026)"), "modele-n-2-2026");
});
```

- [ ] **Step 2: Vérifier que les tests échouent**

Run: `node --test lib/slug.test.js`
Expected: FAIL — `Cannot find module './slug.js'`.

- [ ] **Step 3: Implémenter `lib/slug.js`**

```js
// Génère une adresse web ("slug") à partir d'un nom de modèle : minuscules,
// accents retirés, tout ce qui n'est pas alphanumérique remplacé par un
// tiret. "Climatiseur Bastille" → "climatiseur-bastille".
export function slugify(name) {
  return name
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
```

Le `\p{Diacritic}` (propriété Unicode, nécessite le drapeau `u`) retire les
accents une fois le nom décomposé par `normalize("NFD")` — plus lisible et
moins piégeux à recopier qu'une plage de caractères combinants écrite en
dur.

- [ ] **Step 4: Vérifier que les tests passent**

Run: `node --test lib/slug.test.js`
Expected: PASS, 3/3.

- [ ] **Step 5: Lancer la suite complète**

Run: `npm test`
Expected: tout au vert.

- [ ] **Step 6: Commit**

```bash
git add lib/slug.js lib/slug.test.js
git commit -m "feat: génération automatique du slug d'un modèle"
```

---

## Task 3: Règles de kit (transitions.js)

**Files:**
- Modify: `lib/transitions.js`
- Test: `lib/transitions.test.js`

**Interfaces:**
- Produces:
  - `kitAssignmentError(booking, kit, kitBookings)` → `string | null` — `booking` : `{ status, startDay, endDay }`, `kit` : `{ status }`, `kitBookings` : `[{ startDay, endDay, status }]`.
  - `kitStatusChangeError(kit, newStatus)` → `string | null`.
  - `deliveryDoneEffects(delivery, booking)` étendue : `booking` peut désormais inclure `kitId` ; l'objet renvoyé inclut `kit: "RENTED"` (DROPOFF) ou `kit: "AVAILABLE"` (PICKUP) uniquement si `booking.kitId` est renseigné.
  - Toutes consommées par `app/admin/actions.js` (tâche 6).

- [ ] **Step 1: Écrire les tests qui échouent**

Dans `lib/transitions.test.js`, ajouter juste après le test `"deliveryDoneEffects : livraison effectuée → livrée + machine en location"` :

```js
test("deliveryDoneEffects : livraison avec kit affecté → le kit passe aussi en location", () => {
  const r = deliveryDoneEffects(
    { type: "DROPOFF", status: "SCHEDULED" },
    { status: "CONFIRMED", unitId: "u1", kitId: "k1", depositAmount: 0, depositStatus: "NONE" }
  );
  assert.deepEqual(r, { booking: "DELIVERED", unit: "RENTED", kit: "RENTED" });
});
```

Ajouter juste après le test `"deliveryDoneEffects : reprise effectuée → terminée + machine disponible"` :

```js
test("deliveryDoneEffects : reprise avec kit affecté → le kit redevient disponible", () => {
  const r = deliveryDoneEffects(
    { type: "PICKUP", status: "SCHEDULED" },
    { status: "DELIVERED", unitId: "u1", kitId: "k1" }
  );
  assert.deepEqual(r, { booking: "RETURNED", unit: "AVAILABLE", kit: "AVAILABLE" });
});
```

Ajouter à la fin du fichier :

```js
test("kitAssignmentError : cas valide", () => {
  const booking = { status: "PENDING", startDay: "2026-08-01", endDay: "2026-08-05" };
  const kit = { status: "AVAILABLE" };
  assert.equal(kitAssignmentError(booking, kit, []), null);
});

test("kitAssignmentError : kit indisponible, réservation trop avancée", () => {
  const booking = { status: "PENDING", startDay: "2026-08-01", endDay: "2026-08-05" };
  assert.match(kitAssignmentError(booking, { status: "MAINTENANCE" }, []), /indisponible/);
  assert.match(
    kitAssignmentError({ ...booking, status: "DELIVERED" }, { status: "AVAILABLE" }, []),
    /ne peut plus/
  );
});

test("kitAssignmentError : chevauchement avec battement refusé, dates disjointes acceptées", () => {
  const booking = { status: "CONFIRMED", startDay: "2026-08-10", endDay: "2026-08-12" };
  const kit = { status: "AVAILABLE" };
  assert.equal(
    kitAssignmentError(booking, kit, [{ startDay: "2026-08-05", endDay: "2026-08-08", status: "CONFIRMED" }]),
    null
  );
  assert.match(
    kitAssignmentError(booking, kit, [{ startDay: "2026-08-05", endDay: "2026-08-09", status: "CONFIRMED" }]),
    /chevauchent/
  );
  assert.equal(
    kitAssignmentError(booking, kit, [{ startDay: "2026-08-05", endDay: "2026-08-09", status: "CANCELLED" }]),
    null
  );
});

test("kitStatusChangeError : trois statuts manuels, le reste piloté par les livraisons", () => {
  assert.equal(kitStatusChangeError({ status: "AVAILABLE" }, "MAINTENANCE"), null);
  assert.equal(kitStatusChangeError({ status: "RETIRED" }, "AVAILABLE"), null);
  assert.match(kitStatusChangeError({ status: "RENTED" }, "AVAILABLE"), /location/);
  assert.match(kitStatusChangeError({ status: "AVAILABLE" }, "RENTED"), /livraisons/);
});
```

Mettre à jour l'import en haut du fichier pour inclure les deux nouvelles fonctions :

```js
import {
  confirmError,
  cancelError,
  deliveryDoneEffects,
  deliveryFailError,
  unitAssignmentError,
  unitStatusChangeError,
  depositDue,
  depositReleaseError,
  depositCaptureError,
  kitAssignmentError,
  kitStatusChangeError,
} from "./transitions.js";
```

- [ ] **Step 2: Vérifier que les tests échouent**

Run: `node --test lib/transitions.test.js`
Expected: FAIL — `kitAssignmentError`/`kitStatusChangeError` non exportées ; les deux nouveaux tests `deliveryDoneEffects` échouent (pas de champ `kit` dans le résultat).

- [ ] **Step 3: Implémenter dans `lib/transitions.js`**

Modifier la branche `DROPOFF` de `deliveryDoneEffects` :

```js
    if (booking.depositAmount > 0 && booking.depositStatus !== "HELD") {
      return {
        error: "La caution n'a pas encore été posée sur ce client — vérifiez la carte avant de livrer.",
      };
    }
    const effects = { booking: "DELIVERED", unit: "RENTED" };
    if (booking.kitId) effects.kit = "RENTED";
    return effects;
  }
```

Modifier la branche `PICKUP` :

```js
  if (delivery.type === "PICKUP") {
    if (booking.status !== "DELIVERED") {
      return { error: "Marquez d'abord la livraison comme effectuée." };
    }
    const effects = { booking: "RETURNED", unit: "AVAILABLE" };
    if (booking.kitId) effects.kit = "AVAILABLE";
    return effects;
  }
```

Ajouter juste après `unitAssignmentError` (avant le commentaire `// Changement MANUEL du statut d'une machine...`) :

```js
// Affectation d'un kit de calfeutrage à une réservation — même logique que
// l'affectation d'une machine, mais sans contrainte de modèle (un kit est
// universel). booking : { status, startDay, endDay } — kit : { status } —
// kitBookings : les AUTRES réservations déjà affectées à ce kit.
export function kitAssignmentError(booking, kit, kitBookings) {
  if (!["PENDING", "CONFIRMED"].includes(booking.status)) {
    return "Cette réservation ne peut plus recevoir de kit.";
  }
  if (["RETIRED", "MAINTENANCE"].includes(kit.status)) {
    return "Ce kit est indisponible (maintenance ou retiré).";
  }
  for (const other of kitBookings) {
    if (!BLOCKING_STATUSES.includes(other.status)) continue;
    if (
      booking.startDay <= addDays(other.endDay, 1) &&
      other.startDay <= addDays(booking.endDay, 1)
    ) {
      return "Ce kit est déjà affecté sur des dates qui chevauchent.";
    }
  }
  return null;
}

```

Ajouter juste après `unitStatusChangeError` :

```js

// Changement MANUEL du statut d'un kit — mêmes règles que pour une machine.
export function kitStatusChangeError(kit, newStatus) {
  if (!MANUAL_STATUSES.includes(newStatus)) {
    return "Ce statut est piloté par les livraisons.";
  }
  if (!MANUAL_STATUSES.includes(kit.status)) {
    return "Ce kit est en location : marquez d'abord la reprise effectuée.";
  }
  return null;
}
```

- [ ] **Step 4: Vérifier que les tests passent**

Run: `node --test lib/transitions.test.js`
Expected: PASS, tous les tests du fichier au vert.

- [ ] **Step 5: Lancer la suite complète**

Run: `npm test`
Expected: tout au vert.

- [ ] **Step 6: Commit**

```bash
git add lib/transitions.js lib/transitions.test.js
git commit -m "feat: règles d'affectation et de statut des kits de calfeutrage"
```

---

## Task 4: Créer un nouveau modèle (Product)

**Files:**
- Modify: `app/admin/actions.js`
- Modify: `app/admin/produits/page.js`

**Interfaces:**
- Consumes: `slugify` (tâche 2).
- Produces: Server Action `createProduct(formData)`.

- [ ] **Step 1: Ajouter `createProduct` dans `app/admin/actions.js`**

Ajouter l'import en haut du fichier, avec les imports existants :

```js
import { slugify } from "../../lib/slug";
```

Ajouter à la fin du fichier :

```js
export async function createProduct(formData) {
  await requireAdmin();
  const name = String(formData.get("name") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const powerKw = Number(String(formData.get("powerKw") ?? "").replace(",", "."));
  const noiseDb = Number(String(formData.get("noiseDb") ?? ""));
  const maxAreaM2 = Number(String(formData.get("maxAreaM2") ?? ""));
  const priceEuros = Number(String(formData.get("dailyPriceEuros") ?? "").replace(",", "."));
  const depositEuros = Number(String(formData.get("depositAmountEuros") ?? "").replace(",", "."));
  const imageUrl = String(formData.get("imageUrl") ?? "").trim();
  const active = formData.get("active") === "oui";

  let error = null;
  if (name.length < 2 || name.length > 60) {
    error = "Le nom doit faire entre 2 et 60 caractères.";
  } else if (description.length < 10 || description.length > 500) {
    error = "La description doit faire entre 10 et 500 caractères.";
  } else if (!Number.isFinite(powerKw) || powerKw < 0.1 || powerKw > 20) {
    error = "La puissance doit être comprise entre 0,1 et 20 kW.";
  } else if (!Number.isInteger(noiseDb) || noiseDb < 20 || noiseDb > 90) {
    error = "Le bruit doit être un nombre entier entre 20 et 90 dB.";
  } else if (!Number.isInteger(maxAreaM2) || maxAreaM2 < 1 || maxAreaM2 > 300) {
    error = "La surface max doit être un nombre entier entre 1 et 300 m².";
  } else if (!Number.isFinite(priceEuros) || priceEuros < 1 || priceEuros > 500) {
    error = "Le prix par jour doit être compris entre 1 € et 500 €.";
  } else if (!Number.isFinite(depositEuros) || depositEuros < 0 || depositEuros > 2000) {
    error = "La caution doit être comprise entre 0 € et 2000 €.";
  } else if (imageUrl.length > 500) {
    error = "Le lien d'image est trop long.";
  }

  if (!error) {
    const base = slugify(name) || "modele";
    let slug = base;
    let n = 2;
    while (await prisma.product.findUnique({ where: { slug }, select: { id: true } })) {
      slug = `${base}-${n}`;
      n += 1;
    }

    await prisma.product.create({
      data: {
        slug,
        name,
        description,
        powerKw,
        noiseDb,
        maxAreaM2,
        dailyPrice: Math.round(priceEuros * 100),
        depositAmount: Math.round(depositEuros * 100),
        active,
        images: imageUrl
          ? { create: [{ url: imageUrl, alt: `Climatiseur ${name} vue de face`, position: 0 }] }
          : undefined,
      },
    });
  }

  revalidatePath("/admin/produits");
  revalidatePath("/catalogue");
  redirect(error ? `/admin/produits?erreur=${encodeURIComponent(error)}` : "/admin/produits?ok=1");
}
```

- [ ] **Step 2: Ajouter le formulaire dans `app/admin/produits/page.js`**

Mettre à jour l'import des actions :

```js
import { updateProduct, createProduct } from "../actions";
```

Ajouter ce formulaire juste avant `{products.map((p) => (` :

```jsx
      <form action={createProduct} className="card">
        <h2 className="step-title">Nouveau modèle</h2>
        <div className="form-grid">
          <div className="field">
            <label htmlFor="new-name">Nom</label>
            <input id="new-name" name="name" required minLength={2} maxLength={60} />
          </div>
          <div className="field full">
            <label htmlFor="new-desc">Description</label>
            <textarea id="new-desc" name="description" rows={3} required minLength={10} maxLength={500} />
          </div>
          <div className="field">
            <label htmlFor="new-power">Puissance (kW)</label>
            <input id="new-power" name="powerKw" inputMode="decimal" required />
          </div>
          <div className="field">
            <label htmlFor="new-noise">Bruit (dB)</label>
            <input id="new-noise" name="noiseDb" inputMode="numeric" required />
          </div>
          <div className="field">
            <label htmlFor="new-area">Surface max (m²)</label>
            <input id="new-area" name="maxAreaM2" inputMode="numeric" required />
          </div>
          <div className="field">
            <label htmlFor="new-price">Prix par jour (€)</label>
            <input id="new-price" name="dailyPriceEuros" inputMode="decimal" required />
          </div>
          <div className="field">
            <label htmlFor="new-deposit">Caution (€)</label>
            <input id="new-deposit" name="depositAmountEuros" inputMode="decimal" required />
          </div>
          <div className="field">
            <label htmlFor="new-active">Visible au catalogue</label>
            <select id="new-active" name="active" defaultValue="oui">
              <option value="oui">Oui</option>
              <option value="non">Non</option>
            </select>
          </div>
          <div className="field full">
            <label htmlFor="new-image">Lien d&apos;image (facultatif)</label>
            <input id="new-image" name="imageUrl" placeholder="/images/mon-modele-1.jpg" maxLength={500} />
          </div>
        </div>
        <button type="submit" className="btn btn-primary" style={{ marginTop: 14 }}>
          Créer le modèle
        </button>
      </form>
```

- [ ] **Step 3: Vérifier que rien n'est cassé**

Run: `npm test`
Expected: tout au vert.

Run: `npm run build`
Expected: le build réussit.

- [ ] **Step 4: Commit**

```bash
git add app/admin/actions.js app/admin/produits/page.js
git commit -m "feat: création d'un nouveau modèle depuis le back-office"
```

---

## Task 5: Ajouter une machine en stock (Unit)

**Files:**
- Modify: `app/admin/actions.js`
- Modify: `app/admin/page.js`

**Interfaces:**
- Produces: Server Action `createUnit(formData)`.

- [ ] **Step 1: Ajouter `createUnit` dans `app/admin/actions.js`**

Ajouter à la fin du fichier :

```js
export async function createUnit(formData) {
  await requireAdmin();
  const productId = String(formData.get("productId") ?? "");
  const serialNumber = String(formData.get("serialNumber") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim().slice(0, 500);

  let error = null;
  if (serialNumber.length < 3 || serialNumber.length > 40) {
    error = "Le numéro de série doit faire entre 3 et 40 caractères.";
  } else {
    const product = await prisma.product.findUnique({ where: { id: productId } });
    if (!product) {
      error = "Modèle introuvable.";
    } else {
      try {
        await prisma.unit.create({ data: { productId, serialNumber, notes: notes || null } });
      } catch (e) {
        if (e.code !== "P2002") throw e;
        error = "Ce numéro de série existe déjà.";
      }
    }
  }
  finish("/admin", error);
}
```

- [ ] **Step 2: Charger les modèles actifs et ajouter le formulaire dans `app/admin/page.js`**

Mettre à jour l'import des actions :

```js
import {
  confirmBooking,
  cancelBooking,
  assignUnit,
  markDelivery,
  saveUnit,
  createUnit,
  checkDepositsNow,
  releaseDeposit,
  captureDeposit,
} from "./actions";
```

Ajouter la requête des modèles actifs dans le `Promise.all` existant :

```js
  const [bookings, units, deliveries, customerCount, products] = await Promise.all([
    prisma.booking.findMany({
      include: { customer: true, product: true, unit: { include: { product: true } } },
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
    prisma.unit.findMany({
      include: {
        product: true,
        bookings: { select: { id: true, startDate: true, endDate: true, status: true } },
      },
      orderBy: { serialNumber: "asc" },
    }),
    prisma.delivery.findMany({
      where: { status: "SCHEDULED" },
      include: { booking: { include: { customer: true, address: true } } },
      orderBy: { date: "asc" },
      take: 10,
    }),
    prisma.customer.count(),
    prisma.product.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
  ]);
```

Dans la carte « Parc machines », ajouter le formulaire juste avant `<table>` :

```jsx
        <form action={createUnit} className="actions-cell" style={{ marginBottom: 14 }}>
          <select name="productId" required defaultValue="">
            <option value="" disabled>Modèle…</option>
            {products.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
          <input name="serialNumber" placeholder="N° de série" required minLength={3} maxLength={40} />
          <input name="notes" placeholder="Notes…" maxLength={500} />
          <button type="submit" className="btn-small">Nouvelle machine</button>
        </form>
```

- [ ] **Step 3: Vérifier que rien n'est cassé**

Run: `npm test`
Expected: tout au vert.

Run: `npm run build`
Expected: le build réussit.

- [ ] **Step 4: Commit**

```bash
git add app/admin/actions.js app/admin/page.js
git commit -m "feat: ajout d'une machine en stock depuis le back-office"
```

---

## Task 6: Kits de calfeutrage — back-office complet

**Files:**
- Modify: `app/admin/actions.js`
- Modify: `app/admin/page.js`

**Interfaces:**
- Consumes: `kitAssignmentError`, `kitStatusChangeError` (tâche 3).
- Produces: Server Actions `createKit`, `saveKit`, `assignKit` ; `markDelivery` étendu pour appliquer l'effet `kit`.

- [ ] **Step 1: Ajouter les trois actions et étendre `markDelivery` dans `app/admin/actions.js`**

Mettre à jour l'import de `lib/transitions` :

```js
import {
  confirmError,
  cancelError,
  deliveryDoneEffects,
  deliveryFailError,
  unitAssignmentError,
  unitStatusChangeError,
  depositReleaseError,
  depositCaptureError,
  kitAssignmentError,
  kitStatusChangeError,
} from "../../lib/transitions";
```

Modifier la fonction `markDelivery` existante — remplacer le bloc des mises à jour après `effects.error` par :

```js
      await tx.delivery.update({ where: { id }, data: { status: "DONE" } });
      await tx.booking.update({
        where: { id: delivery.bookingId },
        data: { status: effects.booking },
      });
      await tx.unit.update({
        where: { id: delivery.booking.unitId },
        data: { status: effects.unit },
      });
      if (effects.kit) {
        await tx.kit.update({ where: { id: delivery.booking.kitId }, data: { status: effects.kit } });
      }
```

Ajouter à la fin du fichier :

```js
export async function createKit(formData) {
  await requireAdmin();
  const serialNumber = String(formData.get("serialNumber") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim().slice(0, 500);

  let error = null;
  if (serialNumber.length < 1 || serialNumber.length > 40) {
    error = "Le numéro du kit doit faire entre 1 et 40 caractères.";
  } else {
    try {
      await prisma.kit.create({ data: { serialNumber, notes: notes || null } });
    } catch (e) {
      if (e.code !== "P2002") throw e;
      error = "Ce numéro de kit existe déjà.";
    }
  }
  finish("/admin", error);
}

export async function saveKit(formData) {
  await requireAdmin();
  const id = String(formData.get("id") ?? "");
  const statut = String(formData.get("statut") ?? "");
  const notes = String(formData.get("notes") ?? "").trim().slice(0, 500);
  let error = null;
  await prisma.$transaction(async (tx) => {
    const kit = await tx.kit.findUnique({ where: { id } });
    if (!kit) {
      error = "Kit introuvable.";
      return;
    }
    error = kitStatusChangeError(kit, statut);
    if (error) return;
    await tx.kit.update({ where: { id }, data: { status: statut, notes: notes || null } });
  });
  finish("/admin", error);
}

export async function assignKit(formData) {
  await requireAdmin();
  const bookingId = String(formData.get("bookingId") ?? "");
  const kitId = String(formData.get("kitId") ?? "");
  let error = null;
  await prisma.$transaction(
    async (tx) => {
      const booking = await tx.booking.findUnique({ where: { id: bookingId } });
      const kit = await tx.kit.findUnique({
        where: { id: kitId },
        include: {
          bookings: { select: { id: true, startDate: true, endDate: true, status: true } },
        },
      });
      if (!booking || !kit) {
        error = "Réservation ou kit introuvable.";
        return;
      }
      const b = {
        status: booking.status,
        startDay: toDay(booking.startDate),
        endDay: toDay(booking.endDate),
      };
      const others = kit.bookings
        .filter((x) => x.id !== booking.id)
        .map((x) => ({ startDay: toDay(x.startDate), endDay: toDay(x.endDate), status: x.status }));
      error = kitAssignmentError(b, kit, others);
      if (error) return;
      await tx.booking.update({ where: { id: bookingId }, data: { kitId } });
    },
    { isolationLevel: "Serializable" }
  );
  finish("/admin", error);
}
```

- [ ] **Step 2: Charger les kits et ajouter le tableau + le formulaire dans `app/admin/page.js`**

Mettre à jour l'import des constantes :

```js
import {
  euros,
  BOOKING_STATUS,
  UNIT_STATUS,
  KIT_STATUS,
  DELIVERY_STATUS,
  DEPOSIT_STATUS,
} from "../../lib/constants";
```

Mettre à jour l'import des transitions :

```js
import { unitAssignmentError, kitAssignmentError } from "../../lib/transitions";
```

Mettre à jour l'import des actions :

```js
import {
  confirmBooking,
  cancelBooking,
  assignUnit,
  assignKit,
  markDelivery,
  saveUnit,
  createUnit,
  createKit,
  saveKit,
  checkDepositsNow,
  releaseDeposit,
  captureDeposit,
} from "./actions";
```

Ajouter la fonction `eligibleKits`, juste après `eligibleUnits` :

```js
// Kits proposables pour une réservation : disponibles et libres sur les
// dates (pas de contrainte de modèle, un kit est universel).
function eligibleKits(booking, kits) {
  const b = {
    status: booking.status,
    startDay: toDay(booking.startDate),
    endDay: toDay(booking.endDate),
  };
  return kits.filter((k) => {
    const others = k.bookings
      .filter((x) => x.id !== booking.id)
      .map((x) => ({ startDay: toDay(x.startDate), endDay: toDay(x.endDate), status: x.status }));
    return kitAssignmentError(b, k, others) === null;
  });
}
```

Mettre à jour le `Promise.all` pour inclure `kit` dans les réservations et charger les kits :

```js
  const [bookings, units, kits, deliveries, customerCount, products] = await Promise.all([
    prisma.booking.findMany({
      include: {
        customer: true,
        product: true,
        unit: { include: { product: true } },
        kit: true,
      },
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
    prisma.unit.findMany({
      include: {
        product: true,
        bookings: { select: { id: true, startDate: true, endDate: true, status: true } },
      },
      orderBy: { serialNumber: "asc" },
    }),
    prisma.kit.findMany({
      include: {
        bookings: { select: { id: true, startDate: true, endDate: true, status: true } },
      },
      orderBy: { serialNumber: "asc" },
    }),
    prisma.delivery.findMany({
      where: { status: "SCHEDULED" },
      include: { booking: { include: { customer: true, address: true } } },
      orderBy: { date: "asc" },
      take: 10,
    }),
    prisma.customer.count(),
    prisma.product.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
  ]);
```

Dans la cellule Actions du tableau des réservations, ajouter — après le bloc d'affectation de machine (`{["PENDING", "CONFIRMED"].includes(b.status) && !b.unitId && (...)}`) et avant le formulaire d'annulation — l'affectation de kit :

```jsx
                    {["PENDING", "CONFIRMED"].includes(b.status) && (
                      b.kitId ? (
                        <span className="muted">Kit : {b.kit.serialNumber}</span>
                      ) : (
                        <form action={assignKit}>
                          <input type="hidden" name="bookingId" value={b.id} />
                          <select name="kitId" required defaultValue="">
                            <option value="" disabled>Kit…</option>
                            {eligibleKits(b, kits).map((k) => (
                              <option key={k.id} value={k.id}>{k.serialNumber}</option>
                            ))}
                          </select>
                          <button type="submit" className="btn-small">Affecter kit</button>
                        </form>
                      )
                    )}
```

Ajouter une nouvelle carte « Kits de calfeutrage », juste après la carte « Parc machines » :

```jsx
      <div className="card">
        <h2 style={{ marginBottom: 16 }}>Kits de calfeutrage</h2>
        <form action={createKit} className="actions-cell" style={{ marginBottom: 14 }}>
          <input name="serialNumber" placeholder="N° de kit" required maxLength={40} />
          <input name="notes" placeholder="Notes…" maxLength={500} />
          <button type="submit" className="btn-small">Nouveau kit</button>
        </form>
        <table>
          <thead>
            <tr><th>N° kit</th><th>Statut</th><th>Gestion</th></tr>
          </thead>
          <tbody>
            {kits.map((k) => (
              <tr key={k.id}>
                <td>{k.serialNumber}</td>
                <td><span className={`pill ${k.status}`}>{KIT_STATUS[k.status]}</span></td>
                <td>
                  {MANUAL_STATUSES.includes(k.status) ? (
                    <form action={saveKit} className="actions-cell">
                      <input type="hidden" name="id" value={k.id} />
                      <select name="statut" defaultValue={k.status}>
                        {MANUAL_STATUSES.map((s) => (
                          <option key={s} value={s}>{KIT_STATUS[s]}</option>
                        ))}
                      </select>
                      <input name="notes" defaultValue={k.notes ?? ""} placeholder="Notes…" maxLength={500} />
                      <button type="submit" className="btn-small">Enregistrer</button>
                    </form>
                  ) : (
                    <span className="muted">piloté par les livraisons (reprise à marquer)</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
```

(`MANUAL_STATUSES` est déjà défini en haut du fichier et vaut `["AVAILABLE", "MAINTENANCE", "RETIRED"]` — identique pour les machines et les kits, réutilisé tel quel.)

- [ ] **Step 3: Vérifier que rien n'est cassé**

Run: `npm test`
Expected: tout au vert.

Run: `npm run build`
Expected: le build réussit.

- [ ] **Step 4: Commit**

```bash
git add app/admin/actions.js app/admin/page.js
git commit -m "feat: gestion des kits de calfeutrage depuis le back-office"
```

---

## Task 7: Vérification manuelle de bout en bout

**Files:** aucun (vérification uniquement, pas de code).

- [ ] **Step 1: Créer un nouveau modèle**

1. Aller sur `/admin/produits`, remplir le formulaire « Nouveau modèle » (ex. nom
   « Climatiseur Bastille », description ≥ 10 caractères, puissance 2.5,
   bruit 45, surface 25, prix 15, caution 120, laisser l'image vide).
2. Vérifier qu'il apparaît dans la liste d'édition juste en dessous, et sur
   `/catalogue` (avec « Photo à venir » puisqu'aucune image n'a été fournie).
3. Recommencer avec un nom qui donnerait le même slug (ex. « Climatiseur
   Bastille » une deuxième fois) : vérifier que le second est créé avec un
   slug suffixé (`climatiseur-bastille-2`) plutôt que de planter.

- [ ] **Step 2: Ajouter une machine en stock**

1. Sur `/admin`, remplir le formulaire « Nouvelle machine » dans la carte
   « Parc machines » avec le modèle créé à l'étape 1 et un numéro de série.
2. Vérifier qu'elle apparaît dans le tableau, statut « Disponible ».
3. Réessayer avec le même numéro de série : vérifier le message d'erreur
   clair (pas d'erreur technique brute).

- [ ] **Step 3: Créer et affecter un kit**

1. Dans la carte « Kits de calfeutrage », créer un kit (ex. « KIT-001 »).
2. Vérifier qu'il apparaît, statut « Disponible ».
3. Créer une réservation de test payée (voir la vérification de l'étape 4
   pour le parcours complet, ou utiliser une réservation déjà confirmée
   existante), l'affecter au kit créé via la liste déroulante « Kit… » dans
   le tableau des réservations.
4. Vérifier que la ligne affiche maintenant « Kit : KIT-001 » au lieu de la
   liste déroulante.
5. Marquer la livraison de cette réservation « Effectuée » : vérifier que le
   kit passe en « En location » dans son tableau. Marquer la reprise
   « Effectuée » : vérifier que le kit repasse « Disponible ».
6. Sur une réservation SANS kit affecté, vérifier que la livraison peut tout
   de même être marquée « Effectuée » (le kit reste facultatif).

- [ ] **Step 4: Retirer un kit et une machine**

1. Sur un kit « Disponible », changer son statut en « Retiré » via le
   formulaire de gestion : vérifier qu'il disparaît des kits proposables à
   l'affectation (liste déroulante « Kit… » d'une nouvelle réservation).
2. Faire de même pour une machine (déjà possible avant cette étape, à
   revérifier avec le flux complet).

- [ ] **Step 5: Confirmer que la suite automatisée est toujours au vert**

Run: `npm test`
Expected: tout au vert.

Run: `npm run build`
Expected: le build réussit.

- [ ] **Step 6: Nettoyer les données de test**

Via Prisma Studio ou en les laissant en base si sans conséquence
(modèle/machine/kit de test clairement identifiables) — au choix, aucune
donnée client réelle n'est concernée.
