# Étape 4 — Paiement Stripe + caution par empreinte — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Le client paie la location au moment de sa demande via Stripe Checkout, et une caution par empreinte bancaire est posée automatiquement avant chaque livraison, gérable depuis le back-office.

**Architecture:** Un nouveau statut `AWAITING_PAYMENT` bloque le calendrier pendant le paiement ; un webhook Stripe (source de vérité) finalise la réservation en `PENDING` (payée) dès que le paiement réussit, avec un filet côté page de confirmation. La caution est posée par une fonction partagée déclenchée par une tâche planifiée quotidienne, un bouton manuel, ou immédiatement si la livraison est proche — jamais au moment du paiement (les blocages carte expirent trop vite pour des réservations prises à l'avance).

**Tech Stack:** Next.js 14 (App Router, Server Actions + Route Handlers), Prisma + SQLite, SDK Node `stripe`, `node --test` pour les tests unitaires des fonctions pures.

## Global Constraints

- Toutes les chaînes visibles par l'utilisateur sont en français, ton simple (cohérent avec le reste du site — Hugo n'est pas développeur).
- Les montants sont toujours en CENTIMES en base et dans les appels Stripe ; conversion euros↔centimes uniquement aux frontières (formulaires, affichage).
- Aucune logique métier ne doit dépendre d'un accès réseau pour être testée : toute règle de décision (transitions, disponibilité) reste une fonction pure testée par `node --test`, comme le reste du projet (voir `lib/*.test.js`).
- Les fonctions qui appellent Stripe et/ou Prisma ne sont pas unitairement testées (aucun précédent dans ce projet pour mocker Prisma) : elles sont vérifiées en bout en bout à la tâche 13, avec les cartes de test Stripe.
- `npm test` doit rester vert après chaque tâche.
- Commits fréquents, un par tâche minimum.

---

## Task 1: Schéma de données, seed, libellés

**Files:**
- Modify: `prisma/schema.prisma`
- Modify: `prisma/seed.js`
- Modify: `lib/constants.js`

**Interfaces:**
- Produces: colonnes Prisma `Product.depositAmount`, `Customer.stripeCustomerId`, `Booking.status` (nouveau défaut `"AWAITING_PAYMENT"`), `Booking.checkoutExpiresAt`, `Booking.depositAmount`, `Booking.depositStatus`, `Booking.capturedAmount`, `Booking.stripePaymentMethodId`. Constantes `BOOKING_STATUS.AWAITING_PAYMENT` et `DEPOSIT_STATUS` (objet complet) exportées de `lib/constants.js`, consommées par toutes les tâches suivantes.

- [ ] **Step 1: Modifier le schéma Prisma**

Dans `prisma/schema.prisma`, modifier le modèle `Product` en ajoutant `depositAmount` juste après `dailyPrice` :

```prisma
model Product {
  id          String         @id @default(cuid())
  slug        String         @unique
  name        String
  description String
  powerKw     Float
  noiseDb     Int
  maxAreaM2   Int
  dailyPrice  Int
  depositAmount Int          @default(0) // caution en CENTIMES, éditable en back-office
  active      Boolean        @default(true)
  images      ProductImage[]
  units       Unit[]
  bookings    Booking[]
  createdAt   DateTime       @default(now())
}
```

Modifier le modèle `Customer` en ajoutant `stripeCustomerId` :

```prisma
model Customer {
  id            String    @id @default(cuid())
  email         String    @unique
  firstName     String
  lastName      String
  phone         String
  internalNotes String?
  stripeCustomerId String? // id client Stripe, pour débiter la caution plus tard sans redemander la carte
  addresses     Address[]
  bookings      Booking[]
  createdAt     DateTime  @default(now())
}
```

Remplacer entièrement le modèle `Booking` par :

```prisma
model Booking {
  id          String     @id @default(cuid())
  reference   String     @unique
  customer    Customer   @relation(fields: [customerId], references: [id])
  customerId  String
  address     Address    @relation(fields: [addressId], references: [id])
  addressId   String
  product     Product    @relation(fields: [productId], references: [id])
  productId   String
  unit        Unit?      @relation(fields: [unitId], references: [id])
  unitId      String?
  startDate   DateTime
  endDate     DateTime
  status      String     @default("AWAITING_PAYMENT")
  // AWAITING_PAYMENT | PENDING | CONFIRMED | DELIVERED | RETURNED | CANCELLED
  checkoutExpiresAt DateTime? // fin de validité de la session Stripe Checkout, tant que status = AWAITING_PAYMENT
  subtotal    Int
  discount    Int        @default(0)
  deliveryFee Int        @default(2900)
  floorFee    Int        @default(0)
  total       Int
  depositAmount        Int    @default(0) // caution en centimes, figée au moment de la réservation
  depositStatus         String @default("NONE")
  // NONE | HELD | FAILED | RELEASED | CAPTURED
  capturedAmount        Int?   // montant réellement encaissé si CAPTURED
  depositId             String? // id du PaymentIntent Stripe de la caution
  paymentId             String? // id du PaymentIntent Stripe de la location
  stripePaymentMethodId String? // moyen de paiement enregistré au paiement, réutilisé pour la caution
  deliveries  Delivery[]
  createdAt   DateTime   @default(now())

  @@index([productId])
  @@index([unitId])
}
```

- [ ] **Step 2: Lancer la migration**

Run: `npx prisma migrate dev --name paiement-stripe-caution`
Expected: `Your database is now in sync with your schema.` et un nouveau dossier sous `prisma/migrations/`.

- [ ] **Step 3: Ajouter les montants de caution dans le seed**

Dans `prisma/seed.js`, ajouter `depositAmount` sur chacun des trois `prisma.product.create` :

```js
  const seine = await prisma.product.create({
    data: {
      slug: "seine",
      name: "SEINE",
      description:
        "Le compact silencieux. Idéal pour les studios et les chambres jusqu'à 20 m². À 42 dB, il murmure pendant que vous dormez.",
      powerKw: 2.0,
      noiseDb: 42,
      maxAreaM2: 20,
      dailyPrice: 1200,
      depositAmount: 10000, // 100 €
      images: {
        create: [{ url: "/images/seine-1.jpg", alt: "Climatiseur SEINE vue de face", position: 0 }],
      },
    },
  });
```

```js
  const rivoli = await prisma.product.create({
    data: {
      slug: "rivoli",
      name: "RIVOLI",
      description:
        "Le polyvalent. Salons et pièces de vie jusqu'à 35 m². 2,9 kW pour passer de 32 °C à 22 °C le temps d'un spritz.",
      powerKw: 2.9,
      noiseDb: 46,
      maxAreaM2: 35,
      dailyPrice: 1800,
      depositAmount: 15000, // 150 €
      images: {
        create: [{ url: "/images/rivoli-1.jpg", alt: "Climatiseur RIVOLI vue de face", position: 0 }],
      },
    },
  });
```

```js
  const trocadero = await prisma.product.create({
    data: {
      slug: "trocadero",
      name: "TROCADÉRO",
      description:
        "Le puissant. Grands espaces, bureaux et boutiques jusqu'à 55 m². 3,5 kW de fraîcheur, mode déshumidification inclus.",
      powerKw: 3.5,
      noiseDb: 50,
      maxAreaM2: 55,
      dailyPrice: 2600,
      depositAmount: 25000, // 250 €
      images: {
        create: [{ url: "/images/trocadero-1.jpg", alt: "Climatiseur TROCADÉRO vue de face", position: 0 }],
      },
    },
  });
```

- [ ] **Step 4: Ajouter les libellés dans `lib/constants.js`**

Remplacer l'export `BOOKING_STATUS` :

```js
export const BOOKING_STATUS = {
  AWAITING_PAYMENT: "Paiement en cours",
  PENDING: "En attente",
  CONFIRMED: "Confirmée",
  DELIVERED: "Livrée",
  RETURNED: "Terminée",
  CANCELLED: "Annulée",
};
```

Ajouter juste après :

```js
export const DEPOSIT_STATUS = {
  NONE: "Non due",
  HELD: "Posée",
  FAILED: "Échec",
  RELEASED: "Libérée",
  CAPTURED: "Encaissée",
};
```

- [ ] **Step 5: Rejouer le seed et vérifier**

Run: `npm run db:seed`
Expected: `✅ Base remplie : 3 modèles, 8 unités, 1 client, 1 réservation (LC-…-0001)`

Run: `npm test`
Expected: tous les tests existants passent toujours (aucune régression — le schéma n'affecte aucune fonction pure pour l'instant).

- [ ] **Step 6: Commit**

```bash
git add prisma/schema.prisma prisma/seed.js prisma/migrations lib/constants.js
git commit -m "feat: schéma paiement/caution (Product, Customer, Booking) + libellés"
```

---

## Task 2: Disponibilité — le paiement en cours bloque le calendrier

**Files:**
- Modify: `lib/availability.js`
- Test: `lib/availability.test.js`

**Interfaces:**
- Consumes: rien de nouveau.
- Produces: `fullDays()` traite désormais `"AWAITING_PAYMENT"` comme statut bloquant, consommé par la tâche 5 (tunnel) et la page `/reserver/[slug]`.

- [ ] **Step 1: Écrire le test qui échoue**

Ajouter à la fin de `lib/availability.test.js` :

```js
test("fullDays : une réservation « paiement en cours » bloque aussi le calendrier", () => {
  const bookings = [{ startDay: "2026-07-10", endDay: "2026-07-10", status: "AWAITING_PAYMENT" }];
  const full = fullDays(bookings, 1, "2026-07-01", "2026-07-31");
  assert.ok(full.has("2026-07-10"));
});
```

- [ ] **Step 2: Vérifier que le test échoue**

Run: `node --test lib/availability.test.js`
Expected: FAIL — `2026-07-10` absent de l'ensemble `full` (le statut n'est pas encore reconnu).

- [ ] **Step 3: Modifier `BLOCKING_STATUSES`**

Dans `lib/availability.js` :

```js
// Statuts de réservation qui bloquent le calendrier
const BLOCKING_STATUSES = ["AWAITING_PAYMENT", "PENDING", "CONFIRMED", "DELIVERED"];
```

- [ ] **Step 4: Vérifier que le test passe**

Run: `node --test lib/availability.test.js`
Expected: PASS, tous les tests du fichier au vert.

- [ ] **Step 5: Commit**

```bash
git add lib/availability.js lib/availability.test.js
git commit -m "feat: le statut paiement en cours bloque le calendrier"
```

---

## Task 3: Règles de caution (transitions.js)

**Files:**
- Modify: `lib/transitions.js`
- Test: `lib/transitions.test.js`

**Interfaces:**
- Produces:
  - `depositDue(deliveryDay, today)` → `boolean` — consommé par `placeDueDeposits` (tâche 8).
  - `deliveryDoneEffects(delivery, booking)` — `booking` doit maintenant inclure `depositAmount` et `depositStatus` ; renvoie une erreur si `depositAmount > 0 && depositStatus !== "HELD"` pour un `DROPOFF`.
  - `depositReleaseError(booking)` → `string | null` — `booking` : `{ status, depositStatus }`.
  - `depositCaptureError(booking, amountCents)` → `string | null`.
  - Toutes consommées par `app/admin/actions.js` (tâches 9 et 10).

- [ ] **Step 1: Écrire les tests qui échouent**

Dans `lib/transitions.test.js`, remplacer le test existant de livraison réussie (il doit maintenant fournir une caution posée) :

```js
test("deliveryDoneEffects : livraison effectuée → livrée + machine en location", () => {
  const r = deliveryDoneEffects(
    { type: "DROPOFF", status: "SCHEDULED" },
    { status: "CONFIRMED", unitId: "u1", depositAmount: 15000, depositStatus: "HELD" }
  );
  assert.deepEqual(r, { booking: "DELIVERED", unit: "RENTED" });
});
```

Ajouter un nouveau test juste après le test `"deliveryDoneEffects : la livraison exige confirmation et machine affectée"` :

```js
test("deliveryDoneEffects : la livraison exige la caution posée si elle est due", () => {
  assert.match(
    deliveryDoneEffects(
      { type: "DROPOFF", status: "SCHEDULED" },
      { status: "CONFIRMED", unitId: "u1", depositAmount: 15000, depositStatus: "FAILED" }
    ).error,
    /caution/
  );
  // Pas de caution requise pour ce modèle (montant à 0) : la livraison passe
  assert.deepEqual(
    deliveryDoneEffects(
      { type: "DROPOFF", status: "SCHEDULED" },
      { status: "CONFIRMED", unitId: "u1", depositAmount: 0, depositStatus: "NONE" }
    ),
    { booking: "DELIVERED", unit: "RENTED" }
  );
});
```

Ajouter à la fin du fichier :

```js
test("depositDue : due aujourd'hui ou demain, pas au-delà", () => {
  assert.equal(depositDue("2026-07-15", "2026-07-15"), true);
  assert.equal(depositDue("2026-07-16", "2026-07-15"), true);
  assert.equal(depositDue("2026-07-17", "2026-07-15"), false);
  assert.equal(depositDue("2026-07-14", "2026-07-15"), false);
});

test("depositReleaseError : uniquement sur une réservation terminée avec caution posée", () => {
  assert.equal(depositReleaseError({ status: "RETURNED", depositStatus: "HELD" }), null);
  assert.match(
    depositReleaseError({ status: "DELIVERED", depositStatus: "HELD" }).toString(),
    /terminée/
  );
  assert.match(
    depositReleaseError({ status: "RETURNED", depositStatus: "RELEASED" }).toString(),
    /Aucune caution/
  );
});

test("depositCaptureError : montant borné entre 0 exclu et la caution posée", () => {
  const booking = { status: "RETURNED", depositStatus: "HELD", depositAmount: 15000 };
  assert.equal(depositCaptureError(booking, 5000), null);
  assert.equal(depositCaptureError(booking, 15000), null);
  assert.match(depositCaptureError(booking, 0), /positif/);
  assert.match(depositCaptureError(booking, 15001), /dépasse/);
  assert.match(depositCaptureError({ ...booking, depositStatus: "RELEASED" }, 5000), /Aucune caution/);
});
```

- [ ] **Step 2: Vérifier que les tests échouent**

Run: `node --test lib/transitions.test.js`
Expected: FAIL — `depositDue`, `depositReleaseError`, `depositCaptureError` ne sont pas exportés ; le test de caution due échoue (livraison acceptée sans vérifier la caution).

- [ ] **Step 3: Implémenter dans `lib/transitions.js`**

Ajouter en haut du fichier, juste après l'import de `addDays` :

```js
// Une caution est due dès que la livraison a lieu aujourd'hui ou demain —
// au-delà, la tâche planifiée quotidienne la posera la veille.
export function depositDue(deliveryDay, today) {
  return deliveryDay === today || deliveryDay === addDays(today, 1);
}
```

Modifier la branche `DROPOFF` de `deliveryDoneEffects` :

```js
  if (delivery.type === "DROPOFF") {
    if (booking.status !== "CONFIRMED") {
      return { error: "Confirmez la réservation avant de marquer la livraison effectuée." };
    }
    if (!booking.unitId) {
      return { error: "Affectez d'abord une machine à cette réservation." };
    }
    if (booking.depositAmount > 0 && booking.depositStatus !== "HELD") {
      return {
        error: "La caution n'a pas encore été posée sur ce client — vérifiez la carte avant de livrer.",
      };
    }
    return { booking: "DELIVERED", unit: "RENTED" };
  }
```

Ajouter à la fin du fichier :

```js
// Libération/encaissement de la caution : uniquement après la reprise,
// et seulement si une caution est effectivement posée.
export function depositReleaseError(booking) {
  if (booking.status !== "RETURNED") {
    return "La réservation doit être terminée avant de statuer sur la caution.";
  }
  if (booking.depositStatus !== "HELD") return "Aucune caution posée à libérer.";
  return null;
}

export function depositCaptureError(booking, amountCents) {
  const statusError = depositReleaseError(booking);
  if (statusError) return statusError;
  if (!Number.isInteger(amountCents) || amountCents <= 0) {
    return "Le montant à encaisser doit être positif.";
  }
  if (amountCents > booking.depositAmount) {
    return "Le montant à encaisser dépasse la caution posée.";
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
git commit -m "feat: règles de caution (due, blocage livraison, libération/encaissement)"
```

---

## Task 4: `lib/stripe.js` — paiement de la location

**Files:**
- Create: `lib/stripe.js`
- Modify: `.env.example`
- Modify: `package.json` (dépendance `stripe`)

**Interfaces:**
- Produces:
  - `getStripe()` → client `Stripe` configuré, lève une erreur explicite si `STRIPE_SECRET_KEY` absente.
  - `ensureStripeCustomer(customer)` → `Promise<string>` (id client Stripe), `customer` : ligne Prisma `Customer`.
  - `createCheckoutSession(booking, product, stripeCustomerId, baseUrl)` → `Promise<Stripe.Checkout.Session>`, `booking` : ligne Prisma `Booking` (utilise `total`, `checkoutExpiresAt`, `id`, `reference`), `product` : ligne Prisma `Product` (`name`, `slug`).
  - `finalizeCheckoutSession(sessionId)` → `Promise<Booking | null>`, idempotente.
- Consumes (tâche 5) : ces quatre fonctions.

- [ ] **Step 1: Installer le SDK Stripe**

Run: `npm install stripe`
Expected: `stripe` ajouté dans `dependencies` de `package.json`, `package-lock.json` mis à jour.

- [ ] **Step 2: Ajouter les variables d'environnement**

Dans `.env.example`, ajouter à la fin :

```bash
# Paiement Stripe — voir la section "💳 Paiement Stripe" du README pour la
# marche à suivre complète (créer le compte, récupérer les clés de test).
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=

# Secret partagé pour protéger la tâche planifiée de pose de caution
# (/api/cron/deposits) — générer comme SESSION_SECRET :
#   node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
CRON_SECRET=
```

- [ ] **Step 3: Créer `lib/stripe.js`**

```js
// Intégration Stripe : paiement de la location + caution par empreinte.
// Ce fichier appelle l'API Stripe et la base : pas de tests unitaires ici
// (comme le reste des fichiers qui touchent Prisma) — vérifié en bout en
// bout à l'implémentation avec les cartes de test Stripe.

import Stripe from "stripe";
import { prisma } from "./prisma.js";

// Lève une erreur explicite si la clé n'est pas configurée, plutôt que de
// planter plus loin avec un message Stripe générique.
export function getStripe() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    throw new Error("STRIPE_SECRET_KEY manquante : voir la section Paiement Stripe du README.");
  }
  return new Stripe(key);
}

// Renvoie l'id client Stripe du client, en le créant si besoin — nécessaire
// pour attacher la carte à la session Checkout et pouvoir débiter la caution
// plus tard sans redemander le numéro de carte.
export async function ensureStripeCustomer(customer) {
  if (customer.stripeCustomerId) return customer.stripeCustomerId;
  const stripe = getStripe();
  const created = await stripe.customers.create({
    email: customer.email,
    name: `${customer.firstName} ${customer.lastName}`,
    phone: customer.phone,
  });
  await prisma.customer.update({
    where: { id: customer.id },
    data: { stripeCustomerId: created.id },
  });
  return created.id;
}

// Crée la session de paiement Stripe Checkout pour une réservation fraîchement
// créée (status AWAITING_PAYMENT). `setup_future_usage: "off_session"` permet
// de réutiliser la carte plus tard pour poser la caution sans redemander le
// client — voir `placeDueDeposits`.
export async function createCheckoutSession(booking, product, stripeCustomerId, baseUrl) {
  const stripe = getStripe();
  return stripe.checkout.sessions.create({
    mode: "payment",
    locale: "fr",
    customer: stripeCustomerId,
    payment_intent_data: { setup_future_usage: "off_session" },
    line_items: [
      {
        price_data: {
          currency: "eur",
          unit_amount: booking.total,
          product_data: { name: `Location ${product.name} — ${booking.reference}` },
        },
        quantity: 1,
      },
    ],
    metadata: { bookingId: booking.id },
    expires_at: Math.floor(new Date(booking.checkoutExpiresAt).getTime() / 1000),
    success_url: `${baseUrl}/reserver/confirmation/${booking.reference}?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${baseUrl}/reserver/${product.slug}?annule=1`,
  });
}

// Finalise une session de paiement réussie : passe la réservation à PENDING
// (payée, en attente de votre confirmation) et enregistre le moyen de
// paiement pour la caution. Idempotente : appelée à la fois par le webhook
// et par la page de confirmation en filet — sans effet si déjà finalisée.
export async function finalizeCheckoutSession(sessionId) {
  const stripe = getStripe();
  const session = await stripe.checkout.sessions.retrieve(sessionId, {
    expand: ["payment_intent"],
  });
  const bookingId = session.metadata?.bookingId;
  if (!bookingId || session.payment_status !== "paid") return null;

  const booking = await prisma.booking.findUnique({ where: { id: bookingId } });
  if (!booking || booking.status !== "AWAITING_PAYMENT") return booking;

  const paymentIntent = session.payment_intent;

  return prisma.booking.update({
    where: { id: bookingId },
    data: {
      status: "PENDING",
      checkoutExpiresAt: null,
      paymentId: paymentIntent.id,
      stripePaymentMethodId: paymentIntent.payment_method
        ? String(paymentIntent.payment_method)
        : null,
    },
  });
}
```

- [ ] **Step 4: Vérifier que rien n'est cassé**

Run: `npm test`
Expected: tout au vert (ce fichier n'est importé nulle part encore, aucune régression possible).

- [ ] **Step 5: Commit**

```bash
git add lib/stripe.js .env.example package.json package-lock.json
git commit -m "feat: intégration Stripe — session de paiement et finalisation"
```

---

## Task 5: Tunnel — paiement à la demande

**Files:**
- Modify: `app/reserver/[slug]/actions.js`
- Modify: `app/reserver/[slug]/BookingWizard.js`
- Modify: `app/reserver/[slug]/page.js`

**Interfaces:**
- Consumes: `ensureStripeCustomer`, `createCheckoutSession` (tâche 4) ; `BLOCKING_STATUSES` mis à jour (tâche 2).
- Produces: `createBooking(prevState, formData)` crée désormais une réservation `AWAITING_PAYMENT` et redirige vers Stripe au lieu de créer directement une réservation `PENDING`.

- [ ] **Step 1: Réécrire `createBooking`**

Remplacer entièrement le contenu de `app/reserver/[slug]/actions.js` par :

```js
"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { prisma } from "../../../lib/prisma";
import { validateBookingForm } from "../../../lib/validation";
import { capacity, fullDays, rangeError, minStartDay } from "../../../lib/availability";
import { quote } from "../../../lib/pricing";
import { nowInParis, addMonths, addDays, toDay } from "../../../lib/dates";
import { createCheckoutSession, ensureStripeCustomer } from "../../../lib/stripe";

// Nombre de tentatives en cas de conflit d'écriture strictement simultané
// (collision de référence P2002, conflit de sérialisation P2034).
const ATTEMPTS = 3;

// Durée de blocage des dates pendant le paiement Stripe — 32 min plutôt que
// 30 pour rester au-dessus du minimum imposé par Stripe (`expires_at` doit
// être à ≥ 30 min de l'instant de création de la session, qui a lieu
// quelques centaines de ms après la création de la réservation).
const CHECKOUT_WINDOW_MS = 32 * 60 * 1000;

// Erreur "métier" dont le message est affiché tel quel au client — par
// opposition aux erreurs techniques inattendues, qui doivent remonter.
class BookingError extends Error {
  constructor(message) {
    super(message);
    this.isUserError = true;
  }
}

// Crée une demande de réservation (statut AWAITING_PAYMENT, bloque déjà le
// calendrier) puis redirige vers le paiement Stripe. Appelée par le
// formulaire du tunnel via useFormState : (étatPrécédent, formData) → état.
export async function createBooking(prevState, formData) {
  const slug = String(formData.get("slug") ?? "");
  const now = nowInParis();

  const checked = validateBookingForm(Object.fromEntries(formData), now);
  if (checked.error) return { error: checked.error };
  const f = checked.data;

  const minDay = minStartDay(now);
  const maxDay = addMonths(now.day, 3);

  let created = null;
  for (let attempt = 0; attempt < ATTEMPTS && !created; attempt++) {
    try {
      created = await prisma.$transaction(
        async (tx) => {
          const product = await tx.product.findUnique({
            where: { slug },
            include: { units: true },
          });
          if (!product || !product.active) {
            throw new BookingError("Ce modèle n'est plus proposé à la location.");
          }

          // Re-vérification de la disponibilité DANS la transaction :
          // protège contre deux clients réservant la dernière machine en même temps.
          const cap = capacity(product.units);
          const bookings = (
            await tx.booking.findMany({
              where: {
                productId: product.id,
                // Défense en profondeur : une réservation "paiement en cours"
                // dont la session Stripe a expiré ne doit plus bloquer le
                // calendrier, même si le webhook d'expiration n'est pas
                // encore passé (ex. webhook mal configuré, panne réseau).
                NOT: { status: "AWAITING_PAYMENT", checkoutExpiresAt: { lt: new Date() } },
              },
              select: { startDate: true, endDate: true, status: true },
            })
          ).map((b) => ({
            startDay: toDay(b.startDate),
            endDay: toDay(b.endDate),
            status: b.status,
          }));
          const full = fullDays(bookings, cap, now.day, addDays(maxDay, 1));
          const unavailable =
            cap === 0
              ? "Ce modèle n'est plus réservable actuellement."
              : rangeError(f.startDay, f.endDay, full, minDay, maxDay);
          if (unavailable) throw new BookingError(unavailable);

          // Plafond anti-abus : pas plus de 3 demandes en attente OU en cours
          // de paiement par client.
          const pendingCount = await tx.booking.count({
            where: { customer: { email: f.email }, status: { in: ["PENDING", "AWAITING_PAYMENT"] } },
          });
          if (pendingCount >= 3) {
            throw new BookingError(
              "Vous avez déjà 3 demandes en attente. Attendez leur confirmation ou contactez-nous."
            );
          }

          // Les montants sont TOUJOURS recalculés côté serveur
          const q = quote(product.dailyPrice, f.startDay, f.endDay);

          const customer = await tx.customer.upsert({
            where: { email: f.email },
            update: { firstName: f.firstName, lastName: f.lastName, phone: f.phone },
            create: {
              email: f.email,
              firstName: f.firstName,
              lastName: f.lastName,
              phone: f.phone,
            },
          });
          const address = await tx.address.create({
            data: {
              line1: f.line1,
              zip: f.zip,
              city: f.city,
              floor: f.floor,
              accessCode: f.accessCode || null,
              customerId: customer.id,
            },
          });

          // Référence dérivée du max existant de l'année (un comptage se
          // désynchroniserait définitivement si une ligne était supprimée).
          const year = now.day.slice(0, 4);
          const last = await tx.booking.findFirst({
            where: { reference: { startsWith: `LC-${year}-` } },
            orderBy: { reference: "desc" },
            select: { reference: true },
          });
          const next = last ? Number(last.reference.split("-").pop()) + 1 : 1;
          const ref = `LC-${year}-${String(next).padStart(4, "0")}`;

          const booking = await tx.booking.create({
            data: {
              reference: ref,
              customerId: customer.id,
              addressId: address.id,
              productId: product.id,
              startDate: new Date(f.startDay),
              endDate: new Date(f.endDay),
              status: "AWAITING_PAYMENT",
              checkoutExpiresAt: new Date(Date.now() + CHECKOUT_WINDOW_MS),
              subtotal: q.subtotal,
              discount: q.discount,
              deliveryFee: q.deliveryFee,
              floorFee: q.floorFee,
              total: q.total,
              depositAmount: product.depositAmount,
              deliveries: {
                create: [
                  { type: "DROPOFF", date: new Date(f.startDay), timeSlot: f.deliverySlot },
                  { type: "PICKUP", date: new Date(f.endDay), timeSlot: f.pickupSlot },
                ],
              },
            },
          });
          return { booking, customer, product };
        },
        // Sans effet sur SQLite (déjà sérialisé via BEGIN IMMEDIATE), mais
        // indispensable le jour du passage à PostgreSQL.
        { isolationLevel: "Serializable" }
      );
    } catch (e) {
      if (e.isUserError) return { error: e.message };
      // P2002 : collision de référence ; P2034 : conflit de sérialisation.
      if ((e.code === "P2002" || e.code === "P2034") && attempt < ATTEMPTS - 1) continue;
      throw e;
    }
  }

  const { booking, customer, product } = created;

  let session;
  try {
    const host = headers().get("host");
    const protocol = host?.startsWith("localhost") ? "http" : "https";
    const baseUrl = `${protocol}://${host}`;
    const stripeCustomerId = await ensureStripeCustomer(customer);
    session = await createCheckoutSession(booking, product, stripeCustomerId, baseUrl);
  } catch {
    // Le paiement n'a pas pu démarrer : on libère les dates plutôt que de
    // laisser une réservation fantôme bloquer le calendrier.
    await prisma.booking.delete({ where: { id: booking.id } });
    return { error: "Le paiement n'a pas pu être initié. Réessayez dans un instant." };
  }

  redirect(session.url);
}
```

- [ ] **Step 2: Mettre à jour le texte du tunnel**

Dans `app/reserver/[slug]/BookingWizard.js`, remplacer le composant `SubmitButton` :

```jsx
function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      className="btn btn-primary"
      disabled={pending}
      style={{ width: "100%", marginTop: 14 }}
    >
      {pending ? "Redirection vers le paiement…" : "Payer et envoyer ma demande"}
    </button>
  );
}
```

Remplacer le paragraphe `"Aucun paiement en ligne pour l'instant : nous confirmons votre demande par téléphone ou par email."` par :

```jsx
            <p style={{ marginTop: 10, fontSize: 12.5, color: "#5c7d94" }}>
              Paiement sécurisé par Stripe. Vous allez être redirigé vers une
              page de paiement, puis vers votre confirmation.
            </p>
```

- [ ] **Step 3: Afficher un message si le client annule le paiement, et appliquer le même filet de sécurité au calendrier**

Dans `app/reserver/[slug]/page.js`, ajouter `searchParams` aux props et afficher un message d'annulation. Remplacer la signature :

```jsx
export default async function Reserver({ params, searchParams }) {
```

Remplacer la requête des réservations existantes pour exclure les réservations « paiement en cours » expirées (même filet de sécurité qu'à la tâche 5, étape 1 — une session Stripe expirée ne doit plus bloquer le calendrier même si le webhook d'expiration n'est pas encore passé) :

```jsx
  const bookings = (
    await prisma.booking.findMany({
      where: {
        productId: product.id,
        NOT: { status: "AWAITING_PAYMENT", checkoutExpiresAt: { lt: new Date() } },
      },
      select: { startDate: true, endDate: true, status: true },
    })
  ).map((b) => ({
    startDay: toDay(b.startDate),
    endDay: toDay(b.endDate),
    status: b.status,
  }));
```

Juste avant le rendu de `<BookingWizard ... />` (à l'intérieur du bloc `cap === 0 ? (...) : (...)`), ajouter le message au-dessus du composant :

```jsx
        <>
          {searchParams.annule && (
            <p className="form-error" role="alert">
              Paiement annulé : vos dates n&apos;ont pas été bloquées, vous pouvez recommencer.
            </p>
          )}
          <BookingWizard
            product={{
              slug: product.slug,
              name: product.name,
              dailyPrice: product.dailyPrice,
              maxAreaM2: product.maxAreaM2,
              powerKw: product.powerKw,
              noiseDb: product.noiseDb,
            }}
            fullDays={full}
            minDay={minDay}
            maxDay={maxDay}
          />
        </>
```

(Le `<BookingWizard>` doit être encapsulé dans ce fragment `<>...</>` à la place du composant seul.)

- [ ] **Step 4: Vérifier que rien n'est cassé côté tests unitaires**

Run: `npm test`
Expected: tout au vert (aucune fonction pure modifiée dans cette tâche).

- [ ] **Step 5: Commit**

```bash
git add app/reserver/[slug]/actions.js app/reserver/[slug]/BookingWizard.js app/reserver/[slug]/page.js
git commit -m "feat: le tunnel redirige vers le paiement Stripe avant de finaliser la demande"
```

(La vérification HTTP complète du tunnel — jusqu'au retour de Stripe — se fait à la tâche 13, une fois le webhook et la page de confirmation branchés.)

---

## Task 6: Webhook Stripe — finalisation du paiement

**Files:**
- Create: `app/api/stripe/webhook/route.js`

**Interfaces:**
- Consumes: `getStripe`, `finalizeCheckoutSession` (tâche 4).
- Produces: route `POST /api/stripe/webhook`, source de vérité pour le passage `AWAITING_PAYMENT → PENDING` et pour le nettoyage des sessions expirées.

- [ ] **Step 1: Créer la route**

```js
import { NextResponse } from "next/server";
import { prisma } from "../../../../lib/prisma";
import { getStripe, finalizeCheckoutSession } from "../../../../lib/stripe";

// Stripe appelle cette route en coulisses dès qu'un paiement réussit ou
// qu'une session expire — indépendamment du navigateur du client, donc même
// s'il ferme l'onglet avant de revenir sur le site.
export async function POST(request) {
  const signature = request.headers.get("stripe-signature");
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!signature || !secret) {
    return NextResponse.json({ error: "Webhook non configuré." }, { status: 400 });
  }

  const body = await request.text();
  let event;
  try {
    event = getStripe().webhooks.constructEvent(body, signature, secret);
  } catch {
    return NextResponse.json({ error: "Signature invalide." }, { status: 400 });
  }

  if (event.type === "checkout.session.completed") {
    await finalizeCheckoutSession(event.data.object.id);
  }

  if (event.type === "checkout.session.expired") {
    const bookingId = event.data.object.metadata?.bookingId;
    if (bookingId) {
      const booking = await prisma.booking.findUnique({ where: { id: bookingId } });
      if (booking?.status === "AWAITING_PAYMENT") {
        await prisma.booking.delete({ where: { id: bookingId } });
      }
    }
  }

  return NextResponse.json({ received: true });
}
```

- [ ] **Step 2: Vérifier que rien n'est cassé**

Run: `npm test`
Expected: tout au vert.

Run: `npm run build`
Expected: le build Next.js réussit ; `/api/stripe/webhook` apparaît dans le récapitulatif des routes affiché en fin de build.

- [ ] **Step 3: Commit**

```bash
git add app/api/stripe/webhook/route.js
git commit -m "feat: webhook Stripe — finalisation du paiement et nettoyage des sessions expirées"
```

(Testé en conditions réelles avec `stripe listen` à la tâche 13.)

---

## Task 7: Page de confirmation — filet de sécurité

**Files:**
- Modify: `app/reserver/confirmation/[reference]/page.js`

**Interfaces:**
- Consumes: `finalizeCheckoutSession` (tâche 4).

- [ ] **Step 1: Réécrire la page**

Remplacer entièrement le contenu de `app/reserver/confirmation/[reference]/page.js` par :

```jsx
import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "../../../../lib/prisma";
import { euros, FLOOR_LABELS } from "../../../../lib/constants";
import { finalizeCheckoutSession } from "../../../../lib/stripe";

export const dynamic = "force-dynamic";

// Les dates sont stockées à minuit UTC : on formate en UTC pour ne pas
// glisser d'un jour.
const dateFr = (d) =>
  new Date(d).toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  });

export default async function Confirmation({ params, searchParams }) {
  let booking = await prisma.booking.findUnique({
    where: { reference: params.reference },
    include: { product: true, customer: true, address: true, deliveries: true },
  });
  if (!booking) notFound();

  // Filet de sécurité : dans l'immense majorité des cas le webhook Stripe a
  // déjà finalisé le paiement avant que le client n'atterrisse ici. S'il n'a
  // pas encore eu le temps, on vérifie directement auprès de Stripe (appel
  // idempotent, sans effet si déjà finalisé par le webhook).
  if (booking.status === "AWAITING_PAYMENT" && searchParams.session_id) {
    const updated = await finalizeCheckoutSession(String(searchParams.session_id));
    if (updated) booking = { ...booking, ...updated };
  }

  if (booking.status === "AWAITING_PAYMENT") {
    return (
      <div className="card" style={{ maxWidth: 640, margin: "0 auto", textAlign: "center" }}>
        <span className="eyebrow">Paiement en cours de confirmation…</span>
        <p style={{ marginTop: 12, fontSize: 14.5, lineHeight: 1.7, color: "#5c7d94" }}>
          Nous finalisons votre paiement. Si cette page ne se met pas à jour,
          rechargez-la dans quelques secondes.
        </p>
      </div>
    );
  }

  const dropoff = booking.deliveries.find((d) => d.type === "DROPOFF");
  const pickup = booking.deliveries.find((d) => d.type === "PICKUP");

  return (
    <div style={{ maxWidth: 640, margin: "0 auto" }}>
      <div className="card" style={{ textAlign: "center" }}>
        <span className="eyebrow">Demande enregistrée ✓</span>
        <h1 className="section-title" style={{ fontSize: 28 }}>
          Merci {booking.customer.firstName} !
        </h1>
        <p className="confirm-ref">{booking.reference}</p>
        <p style={{ margin: "16px 0 4px", fontSize: 14.5, lineHeight: 1.7, color: "#5c7d94" }}>
          Votre paiement est confirmé et les dates sont bloquées pour vous.
          Nous confirmons votre demande rapidement par téléphone ou par email.
        </p>
      </div>

      <div className="card" style={{ marginTop: 18 }}>
        <div className="recap-line">
          <span>Modèle</span>
          <strong>{booking.product.name}</strong>
        </div>
        <div className="recap-line">
          <span>Livraison</span>
          <span>{dateFr(booking.startDate)} · {dropoff?.timeSlot}</span>
        </div>
        <div className="recap-line">
          <span>Reprise</span>
          <span>{dateFr(booking.endDate)} · {pickup?.timeSlot}</span>
        </div>
        <div className="recap-line">
          <span>Adresse</span>
          <span>
            {booking.address.line1}, {booking.address.zip} {booking.address.city}{" "}
            ({FLOOR_LABELS[booking.address.floor]})
          </span>
        </div>
        <div className="recap-line">
          <span>Location</span>
          <span>{euros(booking.subtotal)}</span>
        </div>
        {booking.discount > 0 && (
          <div className="recap-line">
            <span>Remise longue durée</span>
            <span className="neg">−{euros(booking.discount)}</span>
          </div>
        )}
        <div className="recap-line">
          <span>Livraison & reprise</span>
          <span>{euros(booking.deliveryFee)}</span>
        </div>
        <div className="recap-line total">
          <span>Total payé</span>
          <span>{euros(booking.total)}</span>
        </div>
        {booking.depositAmount > 0 && (
          <p style={{ marginTop: 10, fontSize: 12.5, color: "#5c7d94" }}>
            Une caution de {euros(booking.depositAmount)} sera bloquée sur votre
            carte juste avant la livraison (non débitée sauf dégât constaté).
          </p>
        )}
      </div>

      <p style={{ textAlign: "center", marginTop: 22 }}>
        <Link href="/catalogue" className="btn btn-primary">
          Retour au catalogue
        </Link>
      </p>
    </div>
  );
}
```

- [ ] **Step 2: Vérifier que rien n'est cassé**

Run: `npm test`
Expected: tout au vert.

Run: `npm run build`
Expected: le build réussit.

- [ ] **Step 3: Commit**

```bash
git add app/reserver/confirmation/[reference]/page.js
git commit -m "feat: page de confirmation — filet de sécurité et récap avec caution"
```

---

## Task 8: Pose automatique de la caution

**Files:**
- Modify: `lib/stripe.js`
- Create: `app/api/cron/deposits/route.js`
- Create: `vercel.json`
- Modify: `app/admin/actions.js`
- Modify: `app/admin/page.js`

**Interfaces:**
- Consumes: `depositDue` (tâche 3) ; `confirmBooking` existant (`app/admin/actions.js`, étendu dans cette tâche).
- Produces: `placeDepositIfDue(bookingId)` → `Promise<"HELD" | "FAILED" | null>` et `placeDueDeposits()` → `Promise<{ held: number, failed: number }>`, exportées de `lib/stripe.js`. La première est consommée directement par `confirmBooking` (tentative immédiate si la livraison est imminente — une caution exige une réservation `CONFIRMED`, donc ce déclenchement ne peut pas se faire plus tôt, au moment du paiement) ; la seconde par la route cron et le bouton manuel back-office.

- [ ] **Step 1: Ajouter `placeDepositIfDue` et `placeDueDeposits` à `lib/stripe.js`**

Ajouter à la fin de `lib/stripe.js` :

```js
import { depositDue } from "./transitions.js";
import { nowInParis, toDay } from "./dates.js";
```

(Ajouter ces deux imports en haut du fichier, avec les imports existants.)

```js
// Tente de poser la caution d'UNE réservation si elle est due (livraison
// aujourd'hui ou demain), confirmée, et pas déjà traitée. Sans effet sinon
// (rien à faire) — renvoie "HELD", "FAILED", ou null. Fonction de base
// partagée par placeDueDeposits (balayage quotidien/manuel) et par
// confirmBooking (tentative immédiate à la confirmation, seul moment où une
// réservation devient éligible à la caution).
export async function placeDepositIfDue(bookingId) {
  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: { customer: true, deliveries: { where: { type: "DROPOFF" } } },
  });
  if (!booking || booking.status !== "CONFIRMED") return null;
  if (booking.depositAmount <= 0 || booking.depositStatus !== "NONE") return null;

  const dropoff = booking.deliveries[0];
  const today = nowInParis().day;
  if (!dropoff || !depositDue(toDay(dropoff.date), today)) return null;

  if (!booking.customer.stripeCustomerId || !booking.stripePaymentMethodId) {
    await prisma.booking.update({ where: { id: booking.id }, data: { depositStatus: "FAILED" } });
    return "FAILED";
  }

  const stripe = getStripe();
  try {
    const intent = await stripe.paymentIntents.create({
      amount: booking.depositAmount,
      currency: "eur",
      customer: booking.customer.stripeCustomerId,
      payment_method: booking.stripePaymentMethodId,
      capture_method: "manual",
      off_session: true,
      confirm: true,
      description: `Caution ${booking.reference}`,
    });
    await prisma.booking.update({
      where: { id: booking.id },
      data: { depositStatus: "HELD", depositId: intent.id },
    });
    return "HELD";
  } catch {
    await prisma.booking.update({ where: { id: booking.id }, data: { depositStatus: "FAILED" } });
    return "FAILED";
  }
}

// Balaie toutes les réservations confirmées en attente de caution et tente
// celles qui sont dues — utilisée par la tâche planifiée et le bouton manuel.
export async function placeDueDeposits() {
  const candidates = await prisma.booking.findMany({
    where: { status: "CONFIRMED", depositStatus: "NONE", depositAmount: { gt: 0 } },
    select: { id: true },
  });

  let held = 0;
  let failed = 0;
  for (const { id } of candidates) {
    const result = await placeDepositIfDue(id);
    if (result === "HELD") held += 1;
    if (result === "FAILED") failed += 1;
  }
  return { held, failed };
}
```

- [ ] **Step 2: Créer la route cron**

```js
import { NextResponse } from "next/server";
import { placeDueDeposits } from "../../../../lib/stripe";

// Appelée une fois par jour par Vercel Cron (voir vercel.json). Protégée par
// CRON_SECRET : Vercel ajoute automatiquement l'en-tête Authorization quand
// cette variable est configurée sur le projet.
export async function GET(request) {
  const auth = request.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Non autorisé." }, { status: 401 });
  }
  const result = await placeDueDeposits();
  return NextResponse.json(result);
}
```

- [ ] **Step 3: Créer `vercel.json`**

```json
{
  "crons": [{ "path": "/api/cron/deposits", "schedule": "0 5 * * *" }]
}
```

- [ ] **Step 4: Tenter la pose immédiate à la confirmation, et ajouter le bouton manuel**

Dans `app/admin/actions.js`, ajouter l'import :

```js
import { placeDepositIfDue, placeDueDeposits } from "../../lib/stripe";
```

Modifier la fonction `confirmBooking` existante pour tenter la pose de caution
juste après confirmation (sans effet si la livraison n'est pas encore
imminente — `placeDepositIfDue` gère elle-même ce cas, voir tâche 3/8) :

```js
export async function confirmBooking(formData) {
  await requireAdmin();
  const id = String(formData.get("id") ?? "");
  let error = null;
  await prisma.$transaction(async (tx) => {
    const booking = await tx.booking.findUnique({ where: { id } });
    error = booking ? confirmError(booking) : "Réservation introuvable.";
    if (error) return;
    await tx.booking.update({ where: { id }, data: { status: "CONFIRMED" } });
  });
  if (!error) await placeDepositIfDue(id);
  finish("/admin", error);
}
```

Ajouter à la fin du fichier :

```js
export async function checkDepositsNow() {
  await requireAdmin();
  const { failed } = await placeDueDeposits();
  finish("/admin", failed > 0 ? `${failed} caution(s) n'ont pas pu être posées — vérifiez le tableau.` : null);
}
```

Dans `app/admin/page.js`, ajouter `checkDepositsNow` à l'import existant depuis `./actions` :

```js
import {
  confirmBooking,
  cancelBooking,
  assignUnit,
  markDelivery,
  saveUnit,
  checkDepositsNow,
} from "./actions";
```

Ajouter le bouton juste avant `<table>` dans la carte « Réservations récentes » (après `<h2 style={{ marginBottom: 16 }}>Réservations récentes</h2>`) :

```jsx
        <form action={checkDepositsNow} style={{ marginBottom: 14 }}>
          <button type="submit" className="btn-small">
            Vérifier les cautions à poser aujourd&apos;hui
          </button>
        </form>
```

- [ ] **Step 5: Vérifier que rien n'est cassé**

Run: `npm test`
Expected: tout au vert.

Run: `npm run build`
Expected: le build réussit ; `/api/cron/deposits` apparaît dans le récapitulatif des routes affiché en fin de build.

- [ ] **Step 6: Commit**

```bash
git add lib/stripe.js app/api/cron/deposits/route.js vercel.json app/admin/actions.js app/admin/page.js
git commit -m "feat: pose automatique de la caution (tâche planifiée + bouton manuel)"
```

---

## Task 9: Libération / encaissement de la caution + indicateurs back-office

**Files:**
- Modify: `lib/stripe.js`
- Modify: `app/admin/actions.js`
- Modify: `app/admin/page.js`
- Modify: `app/globals.css`

**Interfaces:**
- Consumes: `depositReleaseError`, `depositCaptureError` (tâche 3).
- Produces: `releaseDepositStripe(booking)`, `captureDepositStripe(booking, amountCents)` dans `lib/stripe.js` ; actions `releaseDeposit`, `captureDeposit` dans `app/admin/actions.js`.

- [ ] **Step 1: Ajouter les fonctions Stripe**

Ajouter à la fin de `lib/stripe.js` :

```js
// Annule le blocage : le montant n'est jamais débité.
export async function releaseDepositStripe(booking) {
  const stripe = getStripe();
  await stripe.paymentIntents.cancel(booking.depositId);
}

// Débite le montant précis indiqué (dégât constaté), au maximum le montant
// bloqué.
export async function captureDepositStripe(booking, amountCents) {
  const stripe = getStripe();
  return stripe.paymentIntents.capture(booking.depositId, { amount_to_capture: amountCents });
}
```

- [ ] **Step 2: Ajouter les actions admin**

Dans `app/admin/actions.js`, mettre à jour les imports :

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
} from "../../lib/transitions";
import {
  placeDepositIfDue,
  placeDueDeposits,
  releaseDepositStripe,
  captureDepositStripe,
} from "../../lib/stripe";
```

Ajouter à la fin du fichier (après `checkDepositsNow`) :

```js
export async function releaseDeposit(formData) {
  await requireAdmin();
  const id = String(formData.get("id") ?? "");
  const booking = await prisma.booking.findUnique({ where: { id } });
  let error = booking ? depositReleaseError(booking) : "Réservation introuvable.";
  if (!error) {
    try {
      await releaseDepositStripe(booking);
    } catch {
      error = "La libération Stripe a échoué : réessayez dans un instant.";
    }
  }
  if (!error) {
    await prisma.booking.update({ where: { id }, data: { depositStatus: "RELEASED" } });
  }
  finish("/admin", error);
}

export async function captureDeposit(formData) {
  await requireAdmin();
  const id = String(formData.get("id") ?? "");
  const amountEuros = Number(String(formData.get("montantEuros") ?? "").replace(",", "."));
  const amountCents = Math.round(amountEuros * 100);
  const booking = await prisma.booking.findUnique({ where: { id } });
  let error = booking ? depositCaptureError(booking, amountCents) : "Réservation introuvable.";
  if (!error) {
    try {
      await captureDepositStripe(booking, amountCents);
    } catch {
      error = "L'encaissement Stripe a échoué : réessayez dans un instant.";
    }
  }
  if (!error) {
    await prisma.booking.update({
      where: { id },
      data: { depositStatus: "CAPTURED", capturedAmount: amountCents },
    });
  }
  finish("/admin", error);
}
```

- [ ] **Step 3: Ajouter la colonne Caution et les boutons dans le tableau de bord**

Dans `app/admin/page.js`, mettre à jour l'import des constantes :

```js
import {
  euros,
  BOOKING_STATUS,
  UNIT_STATUS,
  DELIVERY_STATUS,
  DEPOSIT_STATUS,
} from "../../lib/constants";
```

Mettre à jour l'import des actions :

```js
import {
  confirmBooking,
  cancelBooking,
  assignUnit,
  markDelivery,
  saveUnit,
  checkDepositsNow,
  releaseDeposit,
  captureDeposit,
} from "./actions";
```

Dans l'en-tête du tableau des réservations, ajouter la colonne :

```jsx
            <tr>
              <th>Réf.</th><th>Client</th><th>Machine</th><th>Du</th><th>Au</th><th>Total</th><th>Statut</th><th>Caution</th><th>Actions</th>
            </tr>
```

Ajouter la cellule Caution juste avant la cellule Actions, dans la boucle `bookings.map` :

```jsx
                <td>
                  {b.depositAmount > 0 ? (
                    <span className={`pill deposit-${b.depositStatus}`}>
                      {DEPOSIT_STATUS[b.depositStatus]}
                    </span>
                  ) : (
                    <span className="muted">—</span>
                  )}
                </td>
```

Dans la cellule Actions, ajouter après le formulaire d'annulation existant (à l'intérieur de `<div className="actions-cell">`) :

```jsx
                    {b.status === "RETURNED" && b.depositStatus === "HELD" && (
                      <>
                        <form action={releaseDeposit}>
                          <input type="hidden" name="id" value={b.id} />
                          <button type="submit" className="btn-small">Libérer caution</button>
                        </form>
                        <form action={captureDeposit} className="actions-cell">
                          <input type="hidden" name="id" value={b.id} />
                          <input
                            name="montantEuros"
                            placeholder="Montant €"
                            inputMode="decimal"
                            style={{ width: 90 }}
                            required
                          />
                          <ConfirmSubmit
                            className="btn-small btn-danger"
                            message={`Encaisser la caution de ${b.reference} ?`}
                          >
                            Encaisser
                          </ConfirmSubmit>
                        </form>
                      </>
                    )}
```

- [ ] **Step 4: Ajouter les couleurs des pastilles dans `app/globals.css`**

Modifier la ligne existante (ajouter `AWAITING_PAYMENT` aux statuts orange) :

```css
.pill.IN_TRANSIT, .pill.SCHEDULED, .pill.PENDING, .pill.AWAITING_PAYMENT { background: #fff0e0; color: #c76b2e; }
```

Ajouter juste après le bloc `.pill.*` existant :

```css
.pill.deposit-HELD { background: #d9f3e6; color: #1a8c5b; }
.pill.deposit-CAPTURED { background: #dcefff; color: var(--deep); }
.pill.deposit-FAILED { background: #ffe1dc; color: #c0392b; }
.pill.deposit-RELEASED, .pill.deposit-NONE { background: #e8edf1; color: #5c7d94; }
```

- [ ] **Step 5: Vérifier que rien n'est cassé**

Run: `npm test`
Expected: tout au vert.

Run: `npm run build`
Expected: le build réussit.

- [ ] **Step 6: Commit**

```bash
git add lib/stripe.js app/admin/actions.js app/admin/page.js app/globals.css
git commit -m "feat: libération/encaissement de la caution + indicateurs back-office"
```

---

## Task 10: Annulation avec remboursement automatique

**Files:**
- Modify: `lib/stripe.js`
- Modify: `app/admin/actions.js`

**Interfaces:**
- Consumes: `cancelError` (existant, tâche 3 n'y touche pas).
- Produces: `refundBookingStripe(booking)` dans `lib/stripe.js` ; `cancelBooking` étendu.

- [ ] **Step 1: Ajouter la fonction de remboursement**

Ajouter à la fin de `lib/stripe.js` :

```js
// Remboursement intégral de la location payée.
export async function refundBookingStripe(booking) {
  const stripe = getStripe();
  await stripe.refunds.create({ payment_intent: booking.paymentId });
}
```

- [ ] **Step 2: Étendre `cancelBooking`**

Dans `app/admin/actions.js`, mettre à jour l'import de `lib/stripe` :

```js
import {
  placeDepositIfDue,
  placeDueDeposits,
  releaseDepositStripe,
  captureDepositStripe,
  refundBookingStripe,
} from "../../lib/stripe";
```

Remplacer la fonction `cancelBooking` existante par :

```js
export async function cancelBooking(formData) {
  await requireAdmin();
  const id = String(formData.get("id") ?? "");
  const booking = await prisma.booking.findUnique({ where: { id } });
  let error = booking ? cancelError(booking) : "Réservation introuvable.";

  // Les appels Stripe se font AVANT l'écriture en base, hors transaction
  // (un appel réseau ne doit jamais rester dans une transaction ouverte).
  // S'ils échouent, l'annulation est bloquée plutôt que de désynchroniser
  // l'argent et le statut.
  if (!error) {
    try {
      if (booking.paymentId) await refundBookingStripe(booking);
      if (booking.depositStatus === "HELD") await releaseDepositStripe(booking);
    } catch {
      error = "Le remboursement Stripe a échoué : réessayez dans un instant.";
    }
  }

  if (!error) {
    await prisma.$transaction(async (tx) => {
      const fresh = await tx.booking.findUnique({ where: { id } });
      error = fresh ? cancelError(fresh) : "Réservation introuvable.";
      if (error) return;
      await tx.booking.update({
        where: { id },
        data: {
          status: "CANCELLED",
          depositStatus: booking.depositStatus === "HELD" ? "RELEASED" : fresh.depositStatus,
        },
      });
    });
  }
  finish("/admin", error);
}
```

- [ ] **Step 3: Vérifier que rien n'est cassé**

Run: `npm test`
Expected: tout au vert.

Run: `npm run build`
Expected: le build réussit.

- [ ] **Step 4: Commit**

```bash
git add lib/stripe.js app/admin/actions.js
git commit -m "feat: annulation d'une réservation payée — remboursement automatique"
```

---

## Task 11: Caution éditable par modèle

**Files:**
- Modify: `app/admin/actions.js`
- Modify: `app/admin/produits/page.js`

**Interfaces:**
- Produces: `updateProduct` accepte et enregistre `depositAmountEuros`.

- [ ] **Step 1: Étendre `updateProduct`**

Dans `app/admin/actions.js`, remplacer la fonction `updateProduct` par :

```js
export async function updateProduct(formData) {
  await requireAdmin();
  const id = String(formData.get("id") ?? "");
  const description = String(formData.get("description") ?? "").trim();
  const priceEuros = Number(String(formData.get("dailyPriceEuros") ?? "").replace(",", "."));
  const depositEuros = Number(String(formData.get("depositAmountEuros") ?? "").replace(",", "."));
  const active = formData.get("active") === "oui";

  let error = null;
  if (description.length < 10 || description.length > 500) {
    error = "La description doit faire entre 10 et 500 caractères.";
  } else if (!Number.isFinite(priceEuros) || priceEuros < 1 || priceEuros > 500) {
    error = "Le prix par jour doit être compris entre 1 € et 500 €.";
  } else if (!Number.isFinite(depositEuros) || depositEuros < 0 || depositEuros > 2000) {
    error = "La caution doit être comprise entre 0 € et 2000 €.";
  } else {
    const exists = await prisma.product.findUnique({ where: { id } });
    if (!exists) {
      error = "Modèle introuvable.";
    } else {
      await prisma.product.update({
        where: { id },
        data: {
          description,
          dailyPrice: Math.round(priceEuros * 100),
          depositAmount: Math.round(depositEuros * 100),
          active,
        },
      });
    }
  }
  revalidatePath("/admin/produits");
  revalidatePath("/catalogue");
  redirect(error ? `/admin/produits?erreur=${encodeURIComponent(error)}` : "/admin/produits?ok=1");
}
```

- [ ] **Step 2: Ajouter le champ dans le formulaire**

Dans `app/admin/produits/page.js`, ajouter un champ juste après le champ « Prix par jour (€) » dans `.form-grid` :

```jsx
            <div className="field">
              <label htmlFor={`caution-${p.id}`}>Caution (€)</label>
              <input
                id={`caution-${p.id}`}
                name="depositAmountEuros"
                defaultValue={(p.depositAmount / 100).toLocaleString("fr-FR")}
                inputMode="decimal"
                required
              />
            </div>
```

- [ ] **Step 3: Vérifier que rien n'est cassé**

Run: `npm test`
Expected: tout au vert.

Run: `npm run build`
Expected: le build réussit.

- [ ] **Step 4: Commit**

```bash
git add app/admin/actions.js app/admin/produits/page.js
git commit -m "feat: montant de caution éditable par modèle"
```

---

## Task 12: Configuration et documentation

**Files:**
- Modify: `README.md`
- Modify: `lootaclim-guide-lancement-express.md`

**Interfaces:** aucune (documentation uniquement).

- [ ] **Step 1: Ajouter la section Paiement Stripe au README**

Dans `README.md`, ajouter une nouvelle section juste après « 🔐 Connexion au back-office » :

```markdown
## 💳 Paiement Stripe

Le paiement de la location et la caution (empreinte bancaire) passent par
Stripe. À la première installation :

1. Créez un compte gratuit sur [stripe.com](https://stripe.com) (le SIRET
   n'est nécessaire que pour passer en mode réel, pas en mode test).
2. Dans votre tableau de bord Stripe, activez le **mode test** (bouton en
   haut à droite) et récupérez la clé secrète (`Développeurs` →
   `Clés API` → `Clé secrète`, commence par `sk_test_...`).
3. Collez-la dans `.env` après `STRIPE_SECRET_KEY=`.
4. Générez `CRON_SECRET` avec la même commande que `SESSION_SECRET` :

```bash
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

5. Pour tester en local, installez la [Stripe CLI](https://stripe.com/docs/stripe-cli)
   puis, dans un second terminal (à côté de `npm run dev`), lancez :

```bash
stripe login
stripe listen --forward-to localhost:3000/api/stripe/webhook
```

   Cette commande affiche une valeur `whsec_...` à coller dans `.env` après
   `STRIPE_WEBHOOK_SECRET=`. Gardez ce terminal ouvert pendant vos tests : il
   relaie les notifications de paiement à votre site.
6. Pour tester un paiement, utilisez la carte de test Stripe
   `4242 4242 4242 4242`, une date d'expiration future et n'importe quel
   code au dos.
7. Le jour du vrai lancement : repassez `STRIPE_SECRET_KEY` et
   `STRIPE_WEBHOOK_SECRET` en mode réel (clés `sk_live_...` et le secret du
   webhook configuré sur votre domaine en ligne dans le tableau de bord
   Stripe), et configurez `CRON_SECRET` sur votre projet Vercel pour que la
   pose automatique de la caution s'exécute chaque jour.

Tant que `STRIPE_SECRET_KEY` n'est pas configurée, le reste du site continue
de fonctionner (catalogue, back-office), mais une demande de réservation ne
peut pas aboutir.
```

- [ ] **Step 2: Mettre à jour la feuille de route et les notes importantes**

Dans `README.md`, remplacer la ligne de la feuille de route :

```markdown
- [x] Étape 4 : paiement Stripe + caution par empreinte
```

Remplacer le paragraphe « ⚠️ Notes importantes » qui mentionne le paiement manquant par :

```markdown
- **Avant toute mise en ligne** : le back-office est protégé, le tunnel plafonné
  à 3 demandes en attente par client, et le paiement + la caution passent par
  Stripe. Il manque encore la vérification d'email des clients et des
  références de réservation non devinables (étapes suivantes).
```

Mettre à jour le tableau des pages pour refléter le nouveau statut affiché après paiement (remplacer la ligne de la page de confirmation) :

```markdown
| `/reserver/confirmation/<réf>` | Confirmation d'une demande de réservation, une fois le paiement Stripe validé |
```

Ajouter `/api/stripe/webhook` et `/api/cron/deposits` en note technique à la fin de la section structure du projet (pas dans le tableau des pages publiques, ce ne sont pas des pages) :

```markdown
- `/api/stripe/webhook` et `/api/cron/deposits` sont des routes techniques
  (pas des pages) : la première reçoit les notifications de paiement Stripe,
  la seconde pose automatiquement les cautions chaque jour.
```

- [ ] **Step 3: Noter la disponibilité du paiement dans le guide de lancement express**

Dans `lootaclim-guide-lancement-express.md`, ajouter une note à la fin de la section « Phase 2 » :

```markdown

**Mise à jour du 15 juillet 2026** : le site sur-mesure (Phase 2) intègre
désormais nativement le paiement Stripe et la caution par empreinte
bancaire — ce n'est donc plus un point bloquant pour la bascule Phase 1 →
Phase 2 à l'automne.
```

- [ ] **Step 4: Commit**

```bash
git add README.md lootaclim-guide-lancement-express.md
git commit -m "docs: étape 4 documentée — section paiement Stripe, feuille de route à jour"
```

---

## Task 13: Vérification manuelle de bout en bout

**Files:** aucun (vérification uniquement, pas de code).

- [ ] **Step 1: Préparer l'environnement Stripe de test**

Suivre la section « 💳 Paiement Stripe » du README (tâche 12) : créer le
compte Stripe, remplir `.env` avec `STRIPE_SECRET_KEY` (mode test),
`CRON_SECRET`, lancer `stripe listen --forward-to localhost:3000/api/stripe/webhook`
dans un terminal dédié et copier le `whsec_...` affiché dans
`STRIPE_WEBHOOK_SECRET`.

Redémarrer `npm run dev` pour charger les nouvelles variables.

- [ ] **Step 2: Parcours complet client**

1. Aller sur `/catalogue`, choisir un modèle, cliquer « Réserver ».
2. Choisir des dates, remplir le formulaire, cliquer « Payer et envoyer ma
   demande ».
3. Sur la page Stripe : payer avec la carte de test `4242 4242 4242 4242`.
4. Vérifier la redirection vers `/reserver/confirmation/<réf>` avec le
   récapitulatif et la mention de la caution.
5. Vérifier dans le terminal `stripe listen` qu'un événement
   `checkout.session.completed` a été relayé avec un `200`.
6. Vérifier dans `/admin` que la réservation apparaît statut « En attente »,
   caution « Non due ».

- [ ] **Step 3: Cas d'abandon du paiement**

1. Recommencer une demande, arriver sur la page Stripe, revenir en arrière
   sans payer (bouton retour du navigateur, ou lien « ← » de Stripe).
2. Vérifier le message « Paiement annulé » sur `/reserver/<modèle>`.
3. Vérifier dans Prisma Studio (`npm run db:studio`) qu'aucune réservation
   fantôme ne bloque ces dates (ou qu'elle disparaît après expiration —
   inutile d'attendre 32 minutes : vérifier simplement qu'une nouvelle
   demande sur les mêmes dates fonctionne).

- [ ] **Step 4: Cycle caution complet**

1. Créer une nouvelle demande payée (comme à l'étape 2), l'affecter à une
   machine SANS encore confirmer.
2. Modifier temporairement, dans Prisma Studio, la date de livraison
   (`startDate` de la réservation et `date` de la livraison `DROPOFF`) pour
   qu'elle tombe aujourd'hui ou demain — cela évite d'attendre le vrai
   calendrier pour tester.
3. Dans `/admin`, cliquer « Confirmer » sur cette réservation : vérifier que
   la pastille Caution passe directement à « Posée » (ou « Échec » selon la
   carte de test — voir ci-dessous), sans avoir besoin du bouton manuel —
   c'est le déclenchement immédiat à la confirmation (tâche 8).
4. Répéter avec une deuxième réservation confirmée AVANT de reculer sa date
   de livraison dans Prisma Studio : cliquer ensuite « Vérifier les cautions
   à poser aujourd'hui » et vérifier que la pastille passe à « Posée » (ou
   « Échec » si la carte de test choisie le simule — voir la liste des
   cartes de test Stripe pour un refus volontaire, ex.
   `4000 0000 0000 0002`).
5. Essayer de marquer la livraison « Effectuée » avant la pose de caution
   (dans une réservation où elle n'est pas encore posée) : vérifier le
   message de blocage. Puis, une fois la caution posée, vérifier que
   « Effectuée » fonctionne.
6. Marquer la reprise « Effectuée ».
7. Sur la réservation `RETURNED`, tester « Libérer caution » sur une, puis
   sur une autre réservation similaire tester « Encaisser » avec un montant.
   Vérifier les pastilles finales (« Libérée » / « Encaissée »).

- [ ] **Step 5: Annulation avec remboursement**

1. Créer une nouvelle demande payée (comme à l'étape 2).
2. Dans `/admin`, cliquer « Annuler » sur cette réservation « En attente ».
3. Vérifier dans le tableau de bord Stripe (mode test → Paiements) que le
   paiement correspondant affiche un remboursement.
4. Vérifier que la réservation passe au statut « Annulée ».

- [ ] **Step 6: Confirmer que la suite automatisée est toujours au vert**

Run: `npm test`
Expected: tout au vert.

Run: `npm run build`
Expected: le build réussit sans avertissement bloquant.

- [ ] **Step 7: Nettoyer les données de test**

Via Prisma Studio ou `npm run db:seed` (qui réinitialise tout), supprimer les
réservations de test créées pendant cette vérification pour repartir sur une
base propre.

- [ ] **Step 8: Commit final si des ajustements ont été faits pendant la vérification**

```bash
git add -A
git commit -m "fix: ajustements suite à la vérification de bout en bout de l'étape 4"
```

(Ne committer que s'il y a effectivement eu des changements de code pendant
cette tâche — sinon rien à committer.)
