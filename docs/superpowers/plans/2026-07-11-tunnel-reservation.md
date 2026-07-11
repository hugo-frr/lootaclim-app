# Tunnel de réservation (Étape 2) — Plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permettre à un client de réserver un climatiseur en ligne : calendrier de disponibilité par dates, coordonnées, récapitulatif, demande créée en statut « En attente ».

**Architecture:** Next.js App Router — Server Components pour lire la base, une Server Action pour créer la réservation (validation + transaction anti-concurrence), un calendrier React maison. Toute la logique métier (dates, disponibilité, prix, validation) vit dans des fonctions pures sous `lib/`, testées avec `node --test`.

**Tech Stack:** Next.js 14 (App Router), Prisma 5 + SQLite, React 18, `node:test` (aucune dépendance ajoutée).

**Spec:** `docs/superpowers/specs/2026-07-11-tunnel-reservation-design.md`

---

## Structure des fichiers

| Fichier | Rôle |
|---|---|
| `lib/dates.js` *(créé)* | Manipulation de jours civils `"AAAA-MM-JJ"` : `addDays`, `addMonths`, `eachDay`, `daysBetweenInclusive`, `nowInParis`, `toDay` |
| `lib/pricing.js` *(créé)* | Devis : `discountRate`, `quote` (tout en centimes) |
| `lib/availability.js` *(créé)* | Disponibilité : `capacity`, `fullDays`, `rangeError`, `deliverySlotsFor`, `minStartDay`, `pickupSlotsFor` |
| `lib/validation.js` *(créé)* | `validateBookingForm` : validation serveur du formulaire |
| `lib/constants.js` *(modifié)* | + `TIME_SLOTS` (6 créneaux de 2 h), `DELIVERY_ZONES` |
| `lib/*.test.js` *(créés)* | Tests `node:test` des 4 modules ci-dessus |
| `prisma/schema.prisma` *(modifié)* | + relation obligatoire `Booking.productId → Product` |
| `prisma/seed.js` *(modifié)* | ESM, réservation de démo avec `productId`, créneaux 2 h, dates normalisées |
| `app/reserver/[slug]/page.js` *(créé)* | Server Component : charge produit + jours complets, rend le wizard |
| `app/reserver/[slug]/BookingWizard.js` *(créé)* | Client Component : 3 étapes (dates, coordonnées, récap + envoi) |
| `app/reserver/[slug]/Calendar.js` *(créé)* | Client Component : calendrier 2 mois, sélection début/fin |
| `app/reserver/[slug]/actions.js` *(créé)* | Server Action `createBooking` |
| `app/reserver/confirmation/[reference]/page.js` *(créé)* | Page de confirmation |
| `app/catalogue/page.js` *(modifié)* | + bouton « Réserver » par carte |
| `app/globals.css` *(modifié)* | + styles tunnel/calendrier/formulaire/récap |
| `package.json` *(modifié)* | `"type": "module"`, script `test` |
| `README.md` *(modifié)* | Feuille de route, nouvelles pages, commande de test |

**Conventions transverses (valables dans toutes les tâches) :**
- Un « jour » est toujours une chaîne `"AAAA-MM-JJ"` (comparable avec `<`/`>`). On ne manipule jamais d'heures dans la logique métier.
- En base, `startDate`/`endDate` sont stockées à minuit UTC : `new Date("AAAA-MM-JJ")`. Conversion inverse : `toDay()`.
- Tous les montants sont en **centimes**.
- Dans `lib/`, les imports relatifs portent l'extension `.js` (requis par Node en ESM pour les tests).

---

### Task 1 : Passage du projet en ESM + commande `npm test`

Les modules `lib/` utilisent la syntaxe `export`. Pour que `node --test` puisse les charger, le projet doit être déclaré ESM. Seul `prisma/seed.js` utilise `require` : on le convertit.

**Files:**
- Modify: `package.json`
- Modify: `prisma/seed.js:1-6`

- [ ] **Step 1 : Mettre à jour `package.json`**

Contenu complet du fichier :

```json
{
  "name": "lootaclim-app",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "test": "node --test lib/",
    "db:migrate": "prisma migrate dev",
    "db:seed": "node prisma/seed.js",
    "db:studio": "prisma studio"
  },
  "dependencies": {
    "@prisma/client": "^5.22.0",
    "next": "^14.2.0",
    "react": "^18.3.0",
    "react-dom": "^18.3.0"
  },
  "devDependencies": {
    "prisma": "^5.22.0"
  }
}
```

- [ ] **Step 2 : Convertir le seed en ESM**

Dans `prisma/seed.js`, remplacer les lignes 5-6 :

```js
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();
```

par :

```js
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
```

- [ ] **Step 3 : Vérifier que le seed fonctionne toujours**

Run: `npm run db:seed`
Expected: `✅ Base remplie : 3 modèles, 8 unités, 1 client, 1 réservation (LC-2026-0001)`

- [ ] **Step 4 : Vérifier que `npm test` tourne (aucun test pour l'instant)**

Run: `npm test`
Expected: sortie `node --test` sans échec (`tests 0` / `pass 0`, code de sortie 0).

- [ ] **Step 5 : Vérifier que le site démarre**

Run: `npm run dev` puis ouvrir http://localhost:3000/catalogue — la page s'affiche comme avant. Arrêter avec Ctrl-C.

- [ ] **Step 6 : Commit**

```bash
git add package.json prisma/seed.js
git commit -m "chore: passage du projet en ESM + commande npm test" -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2 : Constantes — créneaux de 2 h et zone de livraison

**Files:**
- Modify: `lib/constants.js`

- [ ] **Step 1 : Ajouter les constantes**

À la fin de `lib/constants.js`, ajouter :

```js
// Créneaux de livraison/reprise (2 h). startHour sert à la règle du jour même :
// un créneau déjà commencé n'est plus proposé.
export const TIME_SLOTS = [
  { id: "9h-11h", startHour: 9 },
  { id: "11h-13h", startHour: 11 },
  { id: "14h-16h", startHour: 14 },
  { id: "16h-18h", startHour: 16 },
  { id: "18h-20h", startHour: 18 },
  { id: "20h-22h", startHour: 20 },
];

// Zone de livraison : Paris + petite couronne (préfixes de code postal)
export const DELIVERY_ZONES = ["75", "92", "93", "94"];
```

- [ ] **Step 2 : Commit**

```bash
git add lib/constants.js
git commit -m "feat: créneaux de 2h (9h-22h) et zone de livraison 75/92/93/94" -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3 : `lib/dates.js` — jours civils (TDD)

**Files:**
- Create: `lib/dates.js`
- Test: `lib/dates.test.js`

- [ ] **Step 1 : Écrire les tests (qui échouent)**

Créer `lib/dates.test.js` :

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  addDays,
  addMonths,
  eachDay,
  daysBetweenInclusive,
  nowInParis,
  toDay,
} from "./dates.js";

test("addDays passe les fins de mois et d'année", () => {
  assert.equal(addDays("2026-07-30", 2), "2026-08-01");
  assert.equal(addDays("2026-12-31", 1), "2027-01-01");
  assert.equal(addDays("2026-07-15", 0), "2026-07-15");
});

test("addMonths ajoute des mois civils", () => {
  assert.equal(addMonths("2026-07-11", 3), "2026-10-11");
  assert.equal(addMonths("2026-11-15", 3), "2027-02-15");
});

test("addMonths se cale sur la fin du mois quand le jour n'existe pas", () => {
  assert.equal(addMonths("2026-01-31", 3), "2026-04-30");
  assert.equal(addMonths("2026-11-30", 3), "2027-02-28");
});

test("eachDay liste les jours inclusivement", () => {
  assert.deepEqual(eachDay("2026-07-30", "2026-08-01"), [
    "2026-07-30",
    "2026-07-31",
    "2026-08-01",
  ]);
  assert.deepEqual(eachDay("2026-07-30", "2026-07-29"), []);
});

test("daysBetweenInclusive : du 1er au 3 = 3 jours", () => {
  assert.equal(daysBetweenInclusive("2026-07-01", "2026-07-03"), 3);
  assert.equal(daysBetweenInclusive("2026-07-01", "2026-07-01"), 1);
});

test("nowInParis convertit l'heure UTC en heure de Paris", () => {
  // 22h30 UTC le 14 juillet = 00h30 le 15 juillet à Paris (été, UTC+2)
  const now = nowInParis(new Date("2026-07-14T22:30:00Z"));
  assert.deepEqual(now, { day: "2026-07-15", hour: 0 });
});

test("toDay extrait le jour civil d'une date de la base", () => {
  assert.equal(toDay(new Date("2026-07-15T00:00:00Z")), "2026-07-15");
});
```

- [ ] **Step 2 : Vérifier que les tests échouent**

Run: `node --test lib/dates.test.js`
Expected: FAIL avec `Cannot find module` (`ERR_MODULE_NOT_FOUND`) sur `lib/dates.js`.

- [ ] **Step 3 : Implémenter `lib/dates.js`**

```js
// Manipulation de dates "civiles" au format "AAAA-MM-JJ" (heure de Paris).
// La logique métier ne manipule jamais d'heures/minutes : cela évite les
// pièges de fuseaux horaires et de changement d'heure. Les chaînes
// "AAAA-MM-JJ" se comparent directement avec < et >.

// "2026-07-30" + 2 → "2026-08-01"
export function addDays(day, n) {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

// Ajoute des mois civils en se calant sur la fin du mois si le jour
// n'existe pas dans le mois cible : 31 janv. + 3 mois → 30 avril.
export function addMonths(day, n) {
  const [y, m, d] = day.split("-").map(Number);
  const lastDay = new Date(Date.UTC(y, m - 1 + n + 1, 0)).getUTCDate();
  return new Date(Date.UTC(y, m - 1 + n, Math.min(d, lastDay)))
    .toISOString()
    .slice(0, 10);
}

// Liste des jours de start à end inclus (vide si end < start)
export function eachDay(start, end) {
  const days = [];
  for (let d = start; d <= end; d = addDays(d, 1)) days.push(d);
  return days;
}

// Nombre de jours inclusif : du 1er au 3 = 3 jours
export function daysBetweenInclusive(start, end) {
  const utc = (day) => {
    const [y, m, d] = day.split("-").map(Number);
    return Date.UTC(y, m - 1, d);
  };
  return Math.round((utc(end) - utc(start)) / 86400000) + 1;
}

// Jour et heure actuels à Paris : { day: "AAAA-MM-JJ", hour: 0-23 }
export function nowInParis(date = new Date()) {
  const parts = new Intl.DateTimeFormat("fr-FR", {
    timeZone: "Europe/Paris",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const get = (type) => parts.find((p) => p.type === type).value;
  return {
    day: `${get("year")}-${get("month")}-${get("day")}`,
    hour: Number(get("hour")) % 24,
  };
}

// Convertit un DateTime de la base (stocké à minuit UTC) en jour civil
export function toDay(date) {
  return date.toISOString().slice(0, 10);
}
```

- [ ] **Step 4 : Vérifier que les tests passent**

Run: `node --test lib/dates.test.js`
Expected: `pass 7`, `fail 0`.

- [ ] **Step 5 : Commit**

```bash
git add lib/dates.js lib/dates.test.js
git commit -m "feat: helpers de dates civiles (jours AAAA-MM-JJ, heure de Paris)" -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4 : `lib/pricing.js` — devis (TDD)

**Files:**
- Create: `lib/pricing.js`
- Test: `lib/pricing.test.js`

- [ ] **Step 1 : Écrire les tests (qui échouent)**

Créer `lib/pricing.test.js` :

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { quote, discountRate } from "./pricing.js";

test("discountRate : seuils à 7 et 30 jours", () => {
  assert.equal(discountRate(1), 0);
  assert.equal(discountRate(6), 0);
  assert.equal(discountRate(7), 0.15);
  assert.equal(discountRate(29), 0.15);
  assert.equal(discountRate(30), 0.3);
});

test("quote : 1 jour de RIVOLI (18 €/j) = 18 € + 29 € de livraison", () => {
  const q = quote(1800, "2026-07-15", "2026-07-15");
  assert.deepEqual(q, {
    days: 1,
    subtotal: 1800,
    discountRate: 0,
    discount: 0,
    deliveryFee: 2900,
    floorFee: 0,
    total: 4700,
  });
});

test("quote : 7 jours déclenchent -15 %", () => {
  const q = quote(1800, "2026-07-01", "2026-07-07");
  assert.equal(q.days, 7);
  assert.equal(q.subtotal, 12600);
  assert.equal(q.discount, 1890);
  assert.equal(q.total, 12600 - 1890 + 2900);
});

test("quote : 30 jours déclenchent -30 %", () => {
  const q = quote(1200, "2026-07-01", "2026-07-30");
  assert.equal(q.days, 30);
  assert.equal(q.subtotal, 36000);
  assert.equal(q.discount, 10800);
  assert.equal(q.total, 36000 - 10800 + 2900);
});

test("quote arrondit la remise au centime", () => {
  const q = quote(1250, "2026-07-01", "2026-07-07"); // 8750 × 15 % = 1312,5
  assert.equal(q.discount, 1313);
});
```

- [ ] **Step 2 : Vérifier que les tests échouent**

Run: `node --test lib/pricing.test.js`
Expected: FAIL avec `ERR_MODULE_NOT_FOUND` sur `lib/pricing.js`.

- [ ] **Step 3 : Implémenter `lib/pricing.js`**

```js
// Calcul du devis de location. Tout est en CENTIMES.

import { daysBetweenInclusive } from "./dates.js";

export const DELIVERY_FEE = 2900; // livraison + reprise, zone 75/92/93/94

// Remise dégressive : -15 % dès 7 jours, -30 % dès 30 jours
export function discountRate(days) {
  if (days >= 30) return 0.3;
  if (days >= 7) return 0.15;
  return 0;
}

export function quote(dailyPrice, startDay, endDay) {
  const days = daysBetweenInclusive(startDay, endDay);
  const subtotal = dailyPrice * days;
  const rate = discountRate(days);
  const discount = Math.round(subtotal * rate);
  const floorFee = 0; // prévu en base, activé plus tard
  return {
    days,
    subtotal,
    discountRate: rate,
    discount,
    deliveryFee: DELIVERY_FEE,
    floorFee,
    total: subtotal - discount + DELIVERY_FEE + floorFee,
  };
}
```

- [ ] **Step 4 : Vérifier que les tests passent**

Run: `node --test lib/pricing.test.js`
Expected: `pass 5`, `fail 0`.

- [ ] **Step 5 : Commit**

```bash
git add lib/pricing.js lib/pricing.test.js
git commit -m "feat: calcul du devis (dégressif -15%/-30%, livraison 29€)" -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 5 : `lib/availability.js` — disponibilité (TDD)

**Files:**
- Create: `lib/availability.js`
- Test: `lib/availability.test.js`

- [ ] **Step 1 : Écrire les tests (qui échouent)**

Créer `lib/availability.test.js` :

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  capacity,
  fullDays,
  rangeError,
  deliverySlotsFor,
  minStartDay,
  pickupSlotsFor,
} from "./availability.js";

test("capacity ignore les machines retirées ou en maintenance", () => {
  const units = [
    { status: "AVAILABLE" },
    { status: "RENTED" },
    { status: "IN_TRANSIT" },
    { status: "MAINTENANCE" },
    { status: "RETIRED" },
  ];
  assert.equal(capacity(units), 3);
});

test("fullDays : une réservation occupe ses dates + 1 jour de battement", () => {
  const bookings = [
    { startDay: "2026-07-10", endDay: "2026-07-12", status: "CONFIRMED" },
  ];
  const full = fullDays(bookings, 1, "2026-07-01", "2026-07-31");
  assert.deepEqual(
    [...full].sort(),
    ["2026-07-10", "2026-07-11", "2026-07-12", "2026-07-13"]
  );
});

test("fullDays ignore les réservations annulées ou terminées", () => {
  const bookings = [
    { startDay: "2026-07-10", endDay: "2026-07-12", status: "CANCELLED" },
    { startDay: "2026-07-10", endDay: "2026-07-12", status: "RETURNED" },
  ];
  assert.equal(fullDays(bookings, 1, "2026-07-01", "2026-07-31").size, 0);
});

test("fullDays : un jour n'est complet que si toutes les machines sont prises", () => {
  const bookings = [
    { startDay: "2026-07-10", endDay: "2026-07-12", status: "CONFIRMED" },
    { startDay: "2026-07-12", endDay: "2026-07-14", status: "PENDING" },
  ];
  const full = fullDays(bookings, 2, "2026-07-01", "2026-07-31");
  // Seuls les jours couverts par LES DEUX réservations (battement compris)
  assert.deepEqual([...full].sort(), ["2026-07-12", "2026-07-13"]);
});

test("rangeError accepte une plage libre, refuse un jour complet sur la période", () => {
  const full = new Set(["2026-07-20"]);
  assert.equal(
    rangeError("2026-07-15", "2026-07-17", full, "2026-07-11", "2026-10-11"),
    null
  );
  assert.match(
    rangeError("2026-07-18", "2026-07-22", full, "2026-07-11", "2026-10-11"),
    /plus disponibles/
  );
  // Le battement compte : finir le 19 occupe aussi le 20, déjà complet
  assert.match(
    rangeError("2026-07-18", "2026-07-19", full, "2026-07-11", "2026-10-11"),
    /plus disponibles/
  );
});

test("rangeError respecte les bornes min et max", () => {
  const full = new Set();
  assert.match(
    rangeError("2026-07-10", "2026-07-12", full, "2026-07-11", "2026-10-11"),
    /plus réservable/
  );
  assert.match(
    rangeError("2026-10-10", "2026-10-12", full, "2026-07-11", "2026-10-11"),
    /3 mois/
  );
});

test("deliverySlotsFor : le jour même, un créneau commencé n'est plus proposé", () => {
  const now = { day: "2026-07-11", hour: 14 }; // il est entre 14h et 15h
  const ids = deliverySlotsFor("2026-07-11", now).map((s) => s.id);
  assert.deepEqual(ids, ["16h-18h", "18h-20h", "20h-22h"]);
  // Un autre jour : les 6 créneaux
  assert.equal(deliverySlotsFor("2026-07-12", now).length, 6);
});

test("deliverySlotsFor : avant 9h tout est ouvert, après 20h plus rien", () => {
  assert.equal(deliverySlotsFor("2026-07-11", { day: "2026-07-11", hour: 8 }).length, 6);
  assert.equal(deliverySlotsFor("2026-07-11", { day: "2026-07-11", hour: 20 }).length, 0);
});

test("minStartDay : aujourd'hui s'il reste un créneau, sinon demain", () => {
  assert.equal(minStartDay({ day: "2026-07-11", hour: 15 }), "2026-07-11");
  assert.equal(minStartDay({ day: "2026-07-11", hour: 21 }), "2026-07-12");
});

test("pickupSlotsFor : location d'un jour → reprise après la livraison", () => {
  const ids = pickupSlotsFor("2026-07-11", "2026-07-11", "14h-16h").map((s) => s.id);
  assert.deepEqual(ids, ["16h-18h", "18h-20h", "20h-22h"]);
  assert.equal(pickupSlotsFor("2026-07-11", "2026-07-13", "14h-16h").length, 6);
});
```

- [ ] **Step 2 : Vérifier que les tests échouent**

Run: `node --test lib/availability.test.js`
Expected: FAIL avec `ERR_MODULE_NOT_FOUND` sur `lib/availability.js`.

- [ ] **Step 3 : Implémenter `lib/availability.js`**

```js
// Disponibilité des machines par dates — fonctions pures, sans accès à la
// base : elles reçoivent les données en paramètres et sont donc testables.

import { addDays, eachDay } from "./dates.js";
import { TIME_SLOTS } from "./constants.js";

// Nombre de machines réellement louables d'un modèle. Les statuts
// AVAILABLE/RENTED/IN_TRANSIT décrivent l'instant présent, pas le futur :
// ce sont les réservations qui font foi pour le calendrier.
export function capacity(units) {
  return units.filter((u) => !["RETIRED", "MAINTENANCE"].includes(u.status)).length;
}

// Statuts de réservation qui bloquent le calendrier
const BLOCKING_STATUSES = ["PENDING", "CONFIRMED", "DELIVERED"];

// Jours "complets" (toutes les machines prises) sur [horizonStart, horizonEnd].
// Chaque réservation occupe ses dates + 1 jour de battement après la fin.
// bookings : [{ startDay, endDay, status }] — cap : capacité du modèle.
export function fullDays(bookings, cap, horizonStart, horizonEnd) {
  const counts = new Map();
  for (const b of bookings) {
    if (!BLOCKING_STATUSES.includes(b.status)) continue;
    const from = b.startDay < horizonStart ? horizonStart : b.startDay;
    const until = addDays(b.endDay, 1); // battement
    const to = until > horizonEnd ? horizonEnd : until;
    for (const day of eachDay(from, to)) {
      counts.set(day, (counts.get(day) ?? 0) + 1);
    }
  }
  const full = new Set();
  for (const [day, n] of counts) if (n >= cap) full.add(day);
  return full;
}

// Une plage [startDay, endDay] est-elle réservable ?
// Renvoie null si oui, sinon un message d'erreur en français.
// La plage + son jour de battement doivent être entièrement libres.
export function rangeError(startDay, endDay, full, minDay, maxDay) {
  if (!startDay || !endDay || endDay < startDay) return "Dates invalides.";
  if (startDay < minDay) return "Cette date de début n'est plus réservable.";
  if (endDay > maxDay) return "Réservation possible jusqu'à 3 mois à l'avance.";
  for (const day of eachDay(startDay, addDays(endDay, 1))) {
    if (full.has(day)) {
      return "Ces dates ne sont plus disponibles (toutes les machines sont réservées sur une partie de la période).";
    }
  }
  return null;
}

// Créneaux de livraison proposables pour un jour de début donné.
// Le jour même, un créneau déjà commencé n'est plus proposé.
export function deliverySlotsFor(startDay, now) {
  if (startDay > now.day) return TIME_SLOTS;
  return TIME_SLOTS.filter((s) => now.hour < s.startHour);
}

// Premier jour réservable : aujourd'hui s'il reste un créneau, sinon demain
export function minStartDay(now) {
  return deliverySlotsFor(now.day, now).length > 0 ? now.day : addDays(now.day, 1);
}

// Créneaux de reprise. Pour une location d'un seul jour, la reprise doit
// être strictement après la livraison.
export function pickupSlotsFor(startDay, endDay, deliverySlotId) {
  if (startDay !== endDay) return TIME_SLOTS;
  const delivery = TIME_SLOTS.find((s) => s.id === deliverySlotId);
  if (!delivery) return TIME_SLOTS;
  return TIME_SLOTS.filter((s) => s.startHour > delivery.startHour);
}
```

- [ ] **Step 4 : Vérifier que les tests passent**

Run: `node --test lib/availability.test.js`
Expected: `pass 10`, `fail 0`.

- [ ] **Step 5 : Commit**

```bash
git add lib/availability.js lib/availability.test.js
git commit -m "feat: logique de disponibilité (capacité, jours complets, battement, créneaux du jour même)" -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 6 : `lib/validation.js` — validation du formulaire (TDD)

**Files:**
- Create: `lib/validation.js`
- Test: `lib/validation.test.js`

- [ ] **Step 1 : Écrire les tests (qui échouent)**

Créer `lib/validation.test.js` :

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { validateBookingForm } from "./validation.js";

const NOW = { day: "2026-07-11", hour: 10 };
const VALID = {
  startDay: "2026-07-15",
  endDay: "2026-07-18",
  deliverySlot: "9h-11h",
  pickupSlot: "14h-16h",
  firstName: "Camille",
  lastName: "Dupont",
  email: "camille@example.com",
  phone: "06 12 34 56 78",
  line1: "12 rue de la Fraîcheur",
  zip: "75011",
  city: "Paris",
  floor: "asc",
  accessCode: "",
};

test("un formulaire complet passe et renvoie les champs nettoyés", () => {
  const r = validateBookingForm({ ...VALID, firstName: "  Camille  " }, NOW);
  assert.equal(r.error, undefined);
  assert.equal(r.data.firstName, "Camille");
});

test("champ obligatoire manquant", () => {
  assert.match(validateBookingForm({ ...VALID, email: "  " }, NOW).error, /email/);
});

test("email invalide", () => {
  assert.match(validateBookingForm({ ...VALID, email: "pas-un-email" }, NOW).error, /email/);
});

test("téléphone invalide", () => {
  assert.match(validateBookingForm({ ...VALID, phone: "12" }, NOW).error, /téléphone/);
});

test("code postal hors zone refusé", () => {
  assert.match(validateBookingForm({ ...VALID, zip: "77100" }, NOW).error, /petite couronne/);
});

test("créneau inconnu refusé", () => {
  assert.match(
    validateBookingForm({ ...VALID, deliverySlot: "9h-12h" }, NOW).error,
    /créneaux/
  );
});

test("le jour même, créneau déjà commencé refusé", () => {
  const r = validateBookingForm(
    { ...VALID, startDay: "2026-07-11", deliverySlot: "9h-11h" },
    { day: "2026-07-11", hour: 9 }
  );
  assert.match(r.error, /déjà commencé/);
});

test("location d'un jour : reprise avant la livraison refusée", () => {
  const r = validateBookingForm(
    {
      ...VALID,
      startDay: "2026-07-15",
      endDay: "2026-07-15",
      deliverySlot: "14h-16h",
      pickupSlot: "9h-11h",
    },
    NOW
  );
  assert.match(r.error, /après la livraison/);
});
```

- [ ] **Step 2 : Vérifier que les tests échouent**

Run: `node --test lib/validation.test.js`
Expected: FAIL avec `ERR_MODULE_NOT_FOUND` sur `lib/validation.js`.

- [ ] **Step 3 : Implémenter `lib/validation.js`**

```js
// Validation serveur du formulaire de réservation. Les contrôles côté
// navigateur (required, pattern…) ne sont qu'un confort : c'est ici que
// tout est réellement vérifié.

import { TIME_SLOTS, DELIVERY_ZONES, FLOOR_LABELS } from "./constants.js";

const FIELDS = [
  "startDay",
  "endDay",
  "deliverySlot",
  "pickupSlot",
  "firstName",
  "lastName",
  "email",
  "phone",
  "line1",
  "zip",
  "city",
  "floor",
  "accessCode",
];

// Renvoie { error: "message en français" } ou { data: champs nettoyés }.
// now : { day, hour } (heure de Paris), pour la règle du créneau commencé.
export function validateBookingForm(fields, now) {
  const clean = {};
  for (const key of FIELDS) clean[key] = String(fields[key] ?? "").trim();

  const required = {
    firstName: "le prénom",
    lastName: "le nom",
    email: "l'email",
    phone: "le téléphone",
    line1: "l'adresse",
    zip: "le code postal",
    city: "la ville",
  };
  for (const [key, label] of Object.entries(required)) {
    if (!clean[key]) return { error: `Merci de renseigner ${label}.` };
  }

  const isDay = (v) => /^\d{4}-\d{2}-\d{2}$/.test(v);
  if (!isDay(clean.startDay) || !isDay(clean.endDay) || clean.endDay < clean.startDay) {
    return { error: "Merci de choisir vos dates sur le calendrier." };
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean.email)) {
    return { error: "Cet email ne semble pas valide." };
  }
  const phoneDigits = clean.phone.replace(/[\s.\-+()]/g, "");
  if (!/^\d{9,14}$/.test(phoneDigits)) {
    return { error: "Ce numéro de téléphone ne semble pas valide." };
  }
  if (!/^\d{5}$/.test(clean.zip) || !DELIVERY_ZONES.some((z) => clean.zip.startsWith(z))) {
    return {
      error: "Nous livrons Paris et la petite couronne (codes postaux 75, 92, 93, 94).",
    };
  }
  if (!(clean.floor in FLOOR_LABELS)) return { error: "Merci de choisir un étage." };

  const delivery = TIME_SLOTS.find((s) => s.id === clean.deliverySlot);
  const pickup = TIME_SLOTS.find((s) => s.id === clean.pickupSlot);
  if (!delivery || !pickup) {
    return { error: "Merci de choisir vos créneaux de livraison et de reprise." };
  }
  if (clean.startDay === now.day && now.hour >= delivery.startHour) {
    return {
      error: "Ce créneau de livraison est déjà commencé : choisissez un créneau plus tard.",
    };
  }
  if (clean.startDay === clean.endDay && pickup.startHour <= delivery.startHour) {
    return { error: "Pour une location d'un jour, la reprise doit être après la livraison." };
  }

  return { data: clean };
}
```

- [ ] **Step 4 : Vérifier que les tests passent**

Run: `npm test`
Expected: tous les tests des 4 fichiers passent (`pass 30`, `fail 0`).

- [ ] **Step 5 : Commit**

```bash
git add lib/validation.js lib/validation.test.js
git commit -m "feat: validation serveur du formulaire de réservation" -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 7 : Migration — lien Booking → Product + seed à jour

**Files:**
- Modify: `prisma/schema.prisma`
- Modify: `prisma/seed.js`

- [ ] **Step 1 : Ajouter la relation dans `prisma/schema.prisma`**

Dans le modèle `Product`, après la ligne `units       Unit[]`, ajouter :

```prisma
  bookings    Booking[]
```

Dans le modèle `Booking`, après les lignes de la relation `address`/`addressId`, ajouter :

```prisma
  // Le MODÈLE réservé. La machine physique (unit) est affectée plus tard en
  // back-office ; c'est ce lien qui permet de bloquer le bon calendrier.
  product     Product    @relation(fields: [productId], references: [id])
  productId   String
```

- [ ] **Step 2 : Remplacer entièrement `prisma/seed.js`**

```js
// Remplit la base avec des données de départ : vos 3 modèles, un stock
// d'exemple, un client et une réservation de démonstration.
// Lancer avec : npm run db:seed

import { PrismaClient } from "@prisma/client";
import { addDays, nowInParis } from "../lib/dates.js";

const prisma = new PrismaClient();

async function main() {
  // Nettoyage (ordre important à cause des relations)
  await prisma.delivery.deleteMany();
  await prisma.booking.deleteMany();
  await prisma.address.deleteMany();
  await prisma.customer.deleteMany();
  await prisma.unit.deleteMany();
  await prisma.productImage.deleteMany();
  await prisma.product.deleteMany();

  // ---- Les 3 modèles ----
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
      images: {
        create: [{ url: "/images/seine-1.jpg", alt: "Climatiseur SEINE vue de face", position: 0 }],
      },
    },
  });

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
      images: {
        create: [{ url: "/images/rivoli-1.jpg", alt: "Climatiseur RIVOLI vue de face", position: 0 }],
      },
    },
  });

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
      images: {
        create: [{ url: "/images/trocadero-1.jpg", alt: "Climatiseur TROCADÉRO vue de face", position: 0 }],
      },
    },
  });

  // ---- Le stock : chaque machine physique = une unité ----
  const units = [];
  const mk = (productId, prefix, n) =>
    Array.from({ length: n }, (_, i) => ({
      serialNumber: `${prefix}-${String(i + 1).padStart(3, "0")}`,
      productId,
    }));
  units.push(...mk(seine.id, "SEI", 3)); // 3 SEINE
  units.push(...mk(rivoli.id, "RIV", 3)); // 3 RIVOLI
  units.push(...mk(trocadero.id, "TRO", 2)); // 2 TROCADÉRO
  await prisma.unit.createMany({ data: units });

  // ---- Client + réservation de démonstration ----
  const client = await prisma.customer.create({
    data: {
      email: "camille.demo@example.com",
      firstName: "Camille",
      lastName: "Dupont",
      phone: "06 12 34 56 78",
      internalNotes: "Cliente de démonstration — code immeuble 4823A",
      addresses: {
        create: {
          line1: "12 rue de la Fraîcheur",
          zip: "75011",
          city: "Paris",
          floor: "asc",
        },
      },
    },
    include: { addresses: true },
  });

  const firstUnit = await prisma.unit.findFirst({ where: { productId: rivoli.id } });
  const today = nowInParis().day;
  const startDay = addDays(today, 2);
  const endDay = addDays(startDay, 6); // 7 jours inclusifs

  const subtotal = 1800 * 7;
  const discount = Math.round(subtotal * 0.15); // -15 % dès 7 jours

  await prisma.booking.create({
    data: {
      reference: `LC-${today.slice(0, 4)}-0001`,
      customerId: client.id,
      addressId: client.addresses[0].id,
      productId: rivoli.id,
      unitId: firstUnit.id,
      startDate: new Date(startDay),
      endDate: new Date(endDay),
      status: "CONFIRMED",
      subtotal,
      discount,
      deliveryFee: 2900,
      floorFee: 0,
      total: subtotal - discount + 2900,
      deliveries: {
        create: [
          { type: "DROPOFF", date: new Date(startDay), timeSlot: "9h-11h" },
          { type: "PICKUP", date: new Date(endDay), timeSlot: "14h-16h" },
        ],
      },
    },
  });

  console.log("✅ Base remplie : 3 modèles, 8 unités, 1 client, 1 réservation (LC-…-0001)");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
```

- [ ] **Step 3 : Réinitialiser la base et créer la migration**

La base ne contient que des données de démo : on la vide, on rejoue les
migrations existantes, puis on crée la nouvelle migration sur une base vide
(sinon Prisma refuse d'ajouter une colonne obligatoire sur des lignes existantes).

Run:
```bash
npx prisma migrate reset --force
npx prisma migrate dev --name booking-product
npm run db:seed
```
Expected: la migration `*_booking_product` est créée dans `prisma/migrations/`, puis `✅ Base remplie…`.

- [ ] **Step 4 : Vérifier que le site fonctionne toujours**

Run: `npm run dev` puis vérifier http://localhost:3000/catalogue (3 produits) et http://localhost:3000/admin (la réservation LC-…-0001 apparaît). Arrêter avec Ctrl-C.

- [ ] **Step 5 : Commit**

```bash
git add prisma/schema.prisma prisma/seed.js prisma/migrations
git commit -m "feat: une réservation référence son modèle (Booking.productId) + seed créneaux 2h" -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 8 : Server Action `createBooking`

**Files:**
- Create: `app/reserver/[slug]/actions.js`

- [ ] **Step 1 : Créer `app/reserver/[slug]/actions.js`**

```js
"use server";

import { redirect } from "next/navigation";
import { prisma } from "../../../lib/prisma";
import { validateBookingForm } from "../../../lib/validation";
import { capacity, fullDays, rangeError, minStartDay } from "../../../lib/availability";
import { quote } from "../../../lib/pricing";
import { nowInParis, addMonths, addDays, toDay } from "../../../lib/dates";

// Crée une demande de réservation (statut PENDING). Appelée par le
// formulaire du tunnel via useFormState : (étatPrécédent, formData) → état.
export async function createBooking(prevState, formData) {
  const slug = String(formData.get("slug") ?? "");
  const now = nowInParis();

  const checked = validateBookingForm(Object.fromEntries(formData), now);
  if (checked.error) return { error: checked.error };
  const f = checked.data;

  const minDay = minStartDay(now);
  const maxDay = addMonths(now.day, 3);

  let reference = null;
  // 3 tentatives : en cas de collision de référence entre deux demandes
  // strictement simultanées (contrainte d'unicité), on réessaie.
  for (let attempt = 0; attempt < 3 && !reference; attempt++) {
    try {
      reference = await prisma.$transaction(async (tx) => {
        const product = await tx.product.findUnique({
          where: { slug },
          include: { units: true },
        });
        if (!product || !product.active) throw new Error("UNAVAILABLE");

        // Re-vérification de la disponibilité DANS la transaction :
        // protège contre deux clients réservant la dernière machine en même temps.
        const cap = capacity(product.units);
        const bookings = (
          await tx.booking.findMany({
            where: { productId: product.id },
            select: { startDate: true, endDate: true, status: true },
          })
        ).map((b) => ({
          startDay: toDay(b.startDate),
          endDay: toDay(b.endDate),
          status: b.status,
        }));
        const full = fullDays(bookings, cap, now.day, addDays(maxDay, 1));
        if (cap === 0 || rangeError(f.startDay, f.endDay, full, minDay, maxDay)) {
          throw new Error("UNAVAILABLE");
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

        const year = now.day.slice(0, 4);
        const countThisYear = await tx.booking.count({
          where: { reference: { startsWith: `LC-${year}-` } },
        });
        const ref = `LC-${year}-${String(countThisYear + 1).padStart(4, "0")}`;

        await tx.booking.create({
          data: {
            reference: ref,
            customerId: customer.id,
            addressId: address.id,
            productId: product.id,
            startDate: new Date(f.startDay),
            endDate: new Date(f.endDay),
            status: "PENDING",
            subtotal: q.subtotal,
            discount: q.discount,
            deliveryFee: q.deliveryFee,
            floorFee: q.floorFee,
            total: q.total,
            deliveries: {
              create: [
                { type: "DROPOFF", date: new Date(f.startDay), timeSlot: f.deliverySlot },
                { type: "PICKUP", date: new Date(f.endDay), timeSlot: f.pickupSlot },
              ],
            },
          },
        });
        return ref;
      });
    } catch (e) {
      if (e.message === "UNAVAILABLE") {
        return {
          error:
            "Ces dates viennent d'être réservées par un autre client. Merci de choisir d'autres dates.",
        };
      }
      if (e.code === "P2002" && attempt < 2) continue; // référence prise → nouvel essai
      throw e;
    }
  }

  redirect(`/reserver/confirmation/${reference}`);
}
```

Note : `redirect()` est appelé **hors** du `try/catch` — il fonctionne en levant une exception interne à Next.js qu'il ne faut pas intercepter.

- [ ] **Step 2 : Vérifier que le projet compile**

Run: `npx next build`
Expected: `✓ Compiled successfully` (les pages dynamiques sont marquées `ƒ`). La vérification fonctionnelle complète aura lieu à la Task 11.

- [ ] **Step 3 : Commit**

```bash
git add "app/reserver/[slug]/actions.js"
git commit -m "feat: server action de création de réservation (transaction anti-concurrence, référence LC-ANNÉE-NNNN)" -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 9 : Page de confirmation + styles CSS du tunnel

**Files:**
- Create: `app/reserver/confirmation/[reference]/page.js`
- Modify: `app/globals.css` (ajout en fin de fichier)

- [ ] **Step 1 : Créer `app/reserver/confirmation/[reference]/page.js`**

```js
import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "../../../../lib/prisma";
import { euros, FLOOR_LABELS } from "../../../../lib/constants";

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

export default async function Confirmation({ params }) {
  const booking = await prisma.booking.findUnique({
    where: { reference: params.reference },
    include: { product: true, customer: true, address: true, deliveries: true },
  });
  if (!booking) notFound();

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
          Votre demande de réservation est enregistrée et les dates sont bloquées
          pour vous. Nous la confirmons rapidement par téléphone ou par email.
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
          <span>Total</span>
          <span>{euros(booking.total)}</span>
        </div>
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

- [ ] **Step 2 : Ajouter les styles à la fin de `app/globals.css`**

```css
/* ---- Tunnel de réservation (étape 2) ---- */
.wizard { display: grid; grid-template-columns: 1fr 340px; gap: 18px; align-items: start; }
.wizard-steps { display: flex; flex-direction: column; gap: 18px; }
.step-title { font-size: 19px; margin-bottom: 14px; }
.step-num { display: inline-flex; width: 26px; height: 26px; border-radius: 50%; background: var(--cool); color: #fff; align-items: center; justify-content: center; font-size: 14px; margin-right: 10px; }

/* Calendrier */
.cal-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; }
.cal-nav { border: none; background: var(--ice); border-radius: 8px; width: 32px; height: 32px; cursor: pointer; font-size: 16px; color: var(--deep); }
.cal-nav:disabled { opacity: 0.35; cursor: default; }
.cal-months { display: grid; grid-template-columns: 1fr 1fr; gap: 22px; }
.cal-month-name { text-align: center; font-weight: 600; font-size: 14px; margin-bottom: 8px; text-transform: capitalize; }
.cal-grid { display: grid; grid-template-columns: repeat(7, 1fr); gap: 3px; }
.cal-weekday { text-align: center; font-size: 11px; color: #7b98ab; padding: 4px 0; }
.cal-day { aspect-ratio: 1; border: none; border-radius: 8px; background: #fff; font-size: 13px; cursor: pointer; color: var(--navy); }
.cal-day:hover:not(:disabled) { background: var(--frost); }
.cal-day:disabled { color: #c5d6e0; background: transparent; cursor: default; text-decoration: line-through; }
.cal-day.in-range { background: var(--frost); }
.cal-day.edge { background: var(--navy); color: #fff; font-weight: 600; }
.cal-hint { margin-top: 10px; font-size: 13px; color: #c76b2e; }

/* Formulaire */
.form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.form-grid .full { grid-column: 1 / -1; }
.field label { display: block; font-size: 12.5px; font-weight: 600; color: #5c7d94; margin-bottom: 5px; }
.field input, .field select { width: 100%; padding: 10px 12px; border: 1px solid rgba(63, 182, 224, 0.35); border-radius: 10px; font-size: 14px; font-family: inherit; background: #fff; color: var(--navy); }
.field input:focus, .field select:focus { outline: 2px solid var(--cool); border-color: transparent; }

/* Récapitulatif */
.recap { position: sticky; top: 90px; }
.recap-line { display: flex; justify-content: space-between; gap: 14px; font-size: 14px; padding: 7px 0; border-bottom: 1px solid rgba(63, 182, 224, 0.12); }
.recap-line.total { font-family: "Space Grotesk"; font-weight: 700; font-size: 18px; border-bottom: none; padding-top: 12px; }
.recap-line .neg, .neg { color: #1a8c5b; }
.form-error { margin-top: 12px; padding: 12px 14px; border-radius: 10px; background: #ffe1dc; color: #c0392b; font-size: 13.5px; }
.confirm-ref { font-family: "Space Grotesk"; font-size: 28px; font-weight: 700; color: var(--deep); letter-spacing: 0.04em; }

@media (max-width: 820px) {
  .wizard { grid-template-columns: 1fr; }
  .cal-months { grid-template-columns: 1fr; }
  .recap { position: static; }
  .form-grid { grid-template-columns: 1fr; }
}
```

- [ ] **Step 3 : Vérifier dans le navigateur**

Run: `npm run dev` puis ouvrir http://localhost:3000/reserver/confirmation/LC-2026-0001
(remplacer 2026 par l'année en cours si besoin — c'est la réservation de démo du seed).
Expected: carte « Merci Camille ! » avec la référence, livraison/reprise avec créneaux `9h-11h` / `14h-16h`, total 136,10 € (12 600 − 1 890 + 2 900 centimes). Une référence inconnue (ex. `/reserver/confirmation/LC-0000-9999`) affiche la page 404. Arrêter avec Ctrl-C.

- [ ] **Step 4 : Commit**

```bash
git add "app/reserver/confirmation/[reference]/page.js" app/globals.css
git commit -m "feat: page de confirmation de demande + styles du tunnel" -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 10 : Composant `Calendar`

**Files:**
- Create: `app/reserver/[slug]/Calendar.js`

- [ ] **Step 1 : Créer `app/reserver/[slug]/Calendar.js`**

```js
"use client";

import { useMemo, useState } from "react";
import { rangeError } from "../../../lib/availability";

const WEEKDAYS = ["lu", "ma", "me", "je", "ve", "sa", "di"];

// Grille d'un mois : cases "AAAA-MM-JJ", complétées par null pour aligner
// le 1er du mois sur son jour de semaine (semaine commençant lundi).
function monthGrid(year, month) {
  const first = new Date(Date.UTC(year, month, 1));
  const lead = (first.getUTCDay() + 6) % 7; // lundi = 0
  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const cells = Array(lead).fill(null);
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push(
      `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`
    );
  }
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

function monthName(year, month) {
  return new Date(Date.UTC(year, month, 1)).toLocaleDateString("fr-FR", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

// Calendrier de sélection d'une plage : premier clic = début, deuxième = fin
// (re-clic pour recommencer). Les jours complets ou hors bornes sont grisés.
export default function Calendar({
  minDay,
  maxDay,
  fullDays,
  startDay,
  endDay,
  onSelect,
  onHint,
}) {
  const full = useMemo(() => new Set(fullDays), [fullDays]);
  const [offset, setOffset] = useState(0); // 1er des 2 mois affichés

  const [minY, minM] = minDay.split("-").map(Number);
  const [maxY, maxM] = maxDay.split("-").map(Number);
  const totalMonths = (maxY - minY) * 12 + (maxM - minM) + 1;
  const maxOffset = Math.max(0, totalMonths - 2);

  const months = [0, 1].map((i) => {
    const d = new Date(Date.UTC(minY, minM - 1 + offset + i, 1));
    return { year: d.getUTCFullYear(), month: d.getUTCMonth() };
  });

  function clickDay(day) {
    onHint(null);
    if (!startDay || (startDay && endDay)) return onSelect(day, null);
    if (day < startDay) return onSelect(day, null);
    const err = rangeError(startDay, day, full, minDay, maxDay);
    if (err) return onHint(err);
    onSelect(startDay, day);
  }

  const inRange = (day) => startDay && endDay && day >= startDay && day <= endDay;
  const isEdge = (day) => day === startDay || day === endDay;

  return (
    <div>
      <div className="cal-header">
        <button
          type="button"
          className="cal-nav"
          onClick={() => setOffset(offset - 1)}
          disabled={offset === 0}
          aria-label="Mois précédents"
        >
          ‹
        </button>
        <button
          type="button"
          className="cal-nav"
          onClick={() => setOffset(offset + 1)}
          disabled={offset >= maxOffset}
          aria-label="Mois suivants"
        >
          ›
        </button>
      </div>
      <div className="cal-months">
        {months.map(({ year, month }) => (
          <div key={`${year}-${month}`}>
            <div className="cal-month-name">{monthName(year, month)}</div>
            <div className="cal-grid">
              {WEEKDAYS.map((w, i) => (
                <div key={`w${i}`} className="cal-weekday">
                  {w}
                </div>
              ))}
              {monthGrid(year, month).map((day, i) =>
                day === null ? (
                  <div key={i} />
                ) : (
                  <button
                    type="button"
                    key={i}
                    className={`cal-day${inRange(day) ? " in-range" : ""}${isEdge(day) ? " edge" : ""}`}
                    disabled={day < minDay || day > maxDay || full.has(day)}
                    onClick={() => clickDay(day)}
                  >
                    {Number(day.slice(8))}
                  </button>
                )
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2 : Vérifier que le projet compile**

Run: `npx next build`
Expected: `✓ Compiled successfully`. Vérification visuelle à la Task 11 (le composant n'est encore utilisé nulle part).

- [ ] **Step 3 : Commit**

```bash
git add "app/reserver/[slug]/Calendar.js"
git commit -m "feat: calendrier de sélection de plage (2 mois, jours complets grisés)" -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 11 : `BookingWizard` + page `/reserver/[slug]`

**Files:**
- Create: `app/reserver/[slug]/BookingWizard.js`
- Create: `app/reserver/[slug]/page.js`

- [ ] **Step 1 : Créer `app/reserver/[slug]/BookingWizard.js`**

```js
"use client";

import { useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import Calendar from "./Calendar";
import { createBooking } from "./actions";
import { quote } from "../../../lib/pricing";
import { deliverySlotsFor, pickupSlotsFor } from "../../../lib/availability";
import { nowInParis } from "../../../lib/dates";
import { euros, FLOOR_LABELS } from "../../../lib/constants";

// "2026-07-15" → "mer. 15 juil." (midi local : pas de glissement de jour)
const dateFr = (day) =>
  new Date(`${day}T12:00:00`).toLocaleDateString("fr-FR", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      className="btn btn-primary"
      disabled={pending}
      style={{ width: "100%", marginTop: 14 }}
    >
      {pending ? "Envoi en cours…" : "Confirmer ma demande"}
    </button>
  );
}

export default function BookingWizard({ product, fullDays, minDay, maxDay }) {
  const [state, formAction] = useFormState(createBooking, {});
  const [startDay, setStartDay] = useState(null);
  const [endDay, setEndDay] = useState(null);
  const [hint, setHint] = useState(null);
  const [deliverySlot, setDeliverySlot] = useState("");
  const [pickupSlot, setPickupSlot] = useState("");

  const now = nowInParis();
  const datesChosen = Boolean(startDay && endDay);
  const q = datesChosen ? quote(product.dailyPrice, startDay, endDay) : null;
  const deliveryOptions = startDay ? deliverySlotsFor(startDay, now) : [];
  const pickupOptions = datesChosen ? pickupSlotsFor(startDay, endDay, deliverySlot) : [];

  function selectDates(s, e) {
    setStartDay(s);
    setEndDay(e);
    setHint(null);
    setDeliverySlot("");
    setPickupSlot("");
  }

  return (
    <form action={formAction} className="wizard">
      <input type="hidden" name="slug" value={product.slug} />
      <input type="hidden" name="startDay" value={startDay ?? ""} />
      <input type="hidden" name="endDay" value={endDay ?? ""} />

      <div className="wizard-steps">
        <div className="card">
          <h2 className="step-title">
            <span className="step-num">1</span>Vos dates
          </h2>
          <Calendar
            minDay={minDay}
            maxDay={maxDay}
            fullDays={fullDays}
            startDay={startDay}
            endDay={endDay}
            onSelect={selectDates}
            onHint={setHint}
          />
          {hint && <p className="cal-hint">{hint}</p>}
          {!datesChosen && (
            <p className="cal-hint" style={{ color: "#5c7d94" }}>
              {startDay
                ? "Choisissez maintenant votre jour de fin (le même jour est possible : re-cliquez dessus)."
                : "Choisissez votre jour de début."}
            </p>
          )}
        </div>

        {datesChosen && (
          <div className="card">
            <h2 className="step-title">
              <span className="step-num">2</span>Vos coordonnées
            </h2>
            <div className="form-grid">
              <div className="field">
                <label htmlFor="firstName">Prénom</label>
                <input id="firstName" name="firstName" required />
              </div>
              <div className="field">
                <label htmlFor="lastName">Nom</label>
                <input id="lastName" name="lastName" required />
              </div>
              <div className="field">
                <label htmlFor="email">Email</label>
                <input id="email" name="email" type="email" required />
              </div>
              <div className="field">
                <label htmlFor="phone">Téléphone</label>
                <input id="phone" name="phone" type="tel" required />
              </div>
              <div className="field full">
                <label htmlFor="line1">Adresse</label>
                <input id="line1" name="line1" required />
              </div>
              <div className="field">
                <label htmlFor="zip">Code postal</label>
                <input
                  id="zip"
                  name="zip"
                  inputMode="numeric"
                  pattern="(75|92|93|94)[0-9]{3}"
                  title="Nous livrons Paris et la petite couronne : 75, 92, 93 ou 94"
                  required
                />
              </div>
              <div className="field">
                <label htmlFor="city">Ville</label>
                <input id="city" name="city" required />
              </div>
              <div className="field">
                <label htmlFor="floor">Étage</label>
                <select id="floor" name="floor" defaultValue="rdc">
                  {Object.entries(FLOOR_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label htmlFor="accessCode">Code d'accès (facultatif)</label>
                <input id="accessCode" name="accessCode" />
              </div>
              <div className="field">
                <label htmlFor="deliverySlot">Livraison le {dateFr(startDay)}</label>
                <select
                  id="deliverySlot"
                  name="deliverySlot"
                  value={deliverySlot}
                  onChange={(e) => {
                    setDeliverySlot(e.target.value);
                    setPickupSlot("");
                  }}
                  required
                >
                  <option value="" disabled>
                    Choisir un créneau…
                  </option>
                  {deliveryOptions.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.id}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label htmlFor="pickupSlot">Reprise le {dateFr(endDay)}</label>
                <select
                  id="pickupSlot"
                  name="pickupSlot"
                  value={pickupSlot}
                  onChange={(e) => setPickupSlot(e.target.value)}
                  required
                >
                  <option value="" disabled>
                    Choisir un créneau…
                  </option>
                  {pickupOptions.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.id}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="card recap">
        <h2 className="step-title">
          <span className="step-num">3</span>Récapitulatif
        </h2>
        <div className="recap-line">
          <span>Modèle</span>
          <strong>{product.name}</strong>
        </div>
        <div className="recap-line">
          <span>Capacité</span>
          <span>
            {product.maxAreaM2} m² · {product.noiseDb} dB
          </span>
        </div>
        {datesChosen ? (
          <>
            <div className="recap-line">
              <span>Du</span>
              <span>
                {dateFr(startDay)}
                {deliverySlot ? ` · ${deliverySlot}` : ""}
              </span>
            </div>
            <div className="recap-line">
              <span>Au</span>
              <span>
                {dateFr(endDay)}
                {pickupSlot ? ` · ${pickupSlot}` : ""}
              </span>
            </div>
            <div className="recap-line">
              <span>
                {euros(product.dailyPrice)} × {q.days} jour{q.days > 1 ? "s" : ""}
              </span>
              <span>{euros(q.subtotal)}</span>
            </div>
            {q.discount > 0 && (
              <div className="recap-line">
                <span>Remise longue durée (−{Math.round(q.discountRate * 100)} %)</span>
                <span className="neg">−{euros(q.discount)}</span>
              </div>
            )}
            <div className="recap-line">
              <span>Livraison & reprise</span>
              <span>{euros(q.deliveryFee)}</span>
            </div>
            <div className="recap-line total">
              <span>Total</span>
              <span>{euros(q.total)}</span>
            </div>
            <SubmitButton />
            <p style={{ marginTop: 10, fontSize: 12.5, color: "#5c7d94" }}>
              Aucun paiement en ligne pour l'instant : nous confirmons votre
              demande par téléphone ou par email.
            </p>
          </>
        ) : (
          <p style={{ marginTop: 12, fontSize: 13.5, color: "#5c7d94" }}>
            Choisissez vos dates pour voir le prix.
          </p>
        )}
        {state.error && <p className="form-error">{state.error}</p>}
      </div>
    </form>
  );
}
```

- [ ] **Step 2 : Créer `app/reserver/[slug]/page.js`**

```js
import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "../../../lib/prisma";
import { capacity, fullDays, minStartDay } from "../../../lib/availability";
import { nowInParis, addMonths, addDays, toDay } from "../../../lib/dates";
import BookingWizard from "./BookingWizard";

export const dynamic = "force-dynamic";

export default async function Reserver({ params }) {
  const product = await prisma.product.findUnique({
    where: { slug: params.slug },
    include: { units: true },
  });
  if (!product || !product.active) notFound();

  const cap = capacity(product.units);
  const now = nowInParis();
  const minDay = minStartDay(now);
  const maxDay = addMonths(now.day, 3);

  const bookings = (
    await prisma.booking.findMany({
      where: { productId: product.id },
      select: { startDate: true, endDate: true, status: true },
    })
  ).map((b) => ({
    startDay: toDay(b.startDate),
    endDay: toDay(b.endDate),
    status: b.status,
  }));

  // +1 jour : le battement de la dernière plage peut dépasser maxDay
  const full = [...fullDays(bookings, cap, now.day, addDays(maxDay, 1))];

  return (
    <div>
      <span className="eyebrow">Réservation</span>
      <h1 className="section-title">Réserver un {product.name}</h1>
      {cap === 0 ? (
        <div className="card">
          <p>
            Ce modèle n&apos;est pas réservable pour le moment.{" "}
            <Link href="/catalogue">Voir les autres modèles</Link>.
          </p>
        </div>
      ) : (
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
      )}
    </div>
  );
}
```

- [ ] **Step 3 : Vérification fonctionnelle complète dans le navigateur**

Run: `npm run dev` puis ouvrir http://localhost:3000/reserver/rivoli et dérouler cette liste :

1. Le calendrier affiche 2 mois ; les jours passés sont grisés ; la navigation `›` s'arrête à J+3 mois.
2. Cliquer un début puis une fin → la plage se colore, le récap affiche le détail du prix. Choisir ≥ 7 jours → la ligne « Remise longue durée (−15 %) » apparaît.
3. Cliquer aujourd'hui comme début → le créneau en cours et les créneaux passés n'apparaissent pas dans « Livraison ».
4. Choisir début = fin (même jour) → les créneaux de reprise proposés sont tous postérieurs au créneau de livraison choisi.
5. Remplir le formulaire avec un code postal `77100` → le navigateur bloque (pattern) ; forcer via un code valide `75011`.
6. Envoyer la demande complète → redirection vers `/reserver/confirmation/LC-…-0002` avec le bon récapitulatif.
7. Ouvrir http://localhost:3000/admin → la nouvelle réservation apparaît en « En attente », machine « — à affecter — », et les deux livraisons planifiées sont listées.
8. Vérifier le blocage du calendrier : le modèle RIVOLI a 3 machines et la réservation de démo du seed en occupe déjà 1 (de J+2 à J+8). Créer 2 réservations supplémentaires qui chevauchent cette période (emails différents), puis recharger `/reserver/rivoli` : les jours couverts par les 3 réservations à la fois (battement compris) sont désormais **grisés**.
9. `/reserver/inconnu` → page 404.

Arrêter avec Ctrl-C.

- [ ] **Step 4 : Lancer les tests et le build**

Run: `npm test && npx next build`
Expected: tous les tests passent, build OK.

- [ ] **Step 5 : Commit**

```bash
git add "app/reserver/[slug]/BookingWizard.js" "app/reserver/[slug]/page.js"
git commit -m "feat: tunnel de réservation /reserver/[slug] (calendrier, coordonnées, récapitulatif)" -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 12 : Bouton « Réserver » au catalogue

**Files:**
- Modify: `app/catalogue/page.js`

- [ ] **Step 1 : Ajouter le lien**

Dans `app/catalogue/page.js` :

1. Ajouter en haut du fichier (après les imports existants) :

```js
import Link from "next/link";
```

2. Remplacer le bloc :

```jsx
              <p style={{ marginTop: 10 }}>
                {dispo > 0 ? (
                  <span className="stock-ok">✓ {dispo} disponible{dispo > 1 ? "s" : ""}</span>
                ) : (
                  <span className="stock-ko">Indisponible actuellement</span>
                )}
              </p>
```

par :

```jsx
              <p style={{ marginTop: 10 }}>
                {dispo > 0 ? (
                  <span className="stock-ok">✓ {dispo} disponible{dispo > 1 ? "s" : ""}</span>
                ) : (
                  <span className="stock-ko">Indisponible actuellement</span>
                )}
              </p>
              {p.units.some((u) => !["RETIRED", "MAINTENANCE"].includes(u.status)) && (
                <Link
                  href={`/reserver/${p.slug}`}
                  className="btn btn-primary"
                  style={{ marginTop: 14, display: "block", textAlign: "center" }}
                >
                  Réserver
                </Link>
              )}
```

3. Remplacer le paragraphe de bas de page :

```jsx
      <p style={{ marginTop: 30, fontSize: 13.5, color: "#7b98ab" }}>
        La disponibilité affichée vient en direct de votre stock en base de
        données. Prochaine étape : le calendrier de réservation par dates.
      </p>
```

par :

```jsx
      <p style={{ marginTop: 30, fontSize: 13.5, color: "#7b98ab" }}>
        La disponibilité affichée vient en direct de votre stock en base de
        données. Le bouton « Réserver » ouvre le calendrier de disponibilité
        du modèle.
      </p>
```

- [ ] **Step 2 : Vérifier dans le navigateur**

Run: `npm run dev` puis http://localhost:3000/catalogue — chaque carte a un bouton « Réserver » qui mène à `/reserver/<slug>`. Arrêter avec Ctrl-C.

- [ ] **Step 3 : Commit**

```bash
git add app/catalogue/page.js
git commit -m "feat: bouton Réserver sur les cartes du catalogue" -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 13 : README + vérification finale

**Files:**
- Modify: `README.md`

- [ ] **Step 1 : Mettre à jour le README**

1. Dans le tableau « 📄 Les pages », remplacer :

```markdown
| `/catalogue` | Catalogue avec disponibilité en temps réel depuis la base |
```

par :

```markdown
| `/catalogue` | Catalogue avec disponibilité en temps réel depuis la base |
| `/reserver/<modèle>` | Tunnel de réservation : calendrier de disponibilité, coordonnées, récapitulatif |
| `/reserver/confirmation/<réf>` | Confirmation d'une demande de réservation |
```

2. Dans la feuille de route, remplacer :

```markdown
- [ ] Étape 2 : tunnel de réservation avec calendrier de disponibilité par dates
```

par :

```markdown
- [x] Étape 2 : tunnel de réservation avec calendrier de disponibilité par dates
```

3. Après la section « 🗄️ Voir et modifier la base de données », ajouter :

```markdown
## 🧪 Tests

```bash
npm test
```

Vérifie la logique métier (disponibilité, battement d'un jour entre deux
locations, prix dégressif, validation du formulaire) sans toucher à la base.
Les demandes de réservation arrivent dans `/admin` en statut « En attente » —
la validation manuelle (boutons de confirmation) arrive à l'étape 3.
```

- [ ] **Step 2 : Vérification finale complète**

```bash
npm test
npx next build
```

Expected: tous les tests passent, build OK. Puis `npm run dev` et re-dérouler rapidement le parcours : catalogue → Réserver → dates → formulaire → confirmation → admin.

- [ ] **Step 3 : Commit**

```bash
git add README.md
git commit -m "docs: étape 2 terminée (tunnel de réservation) — pages et tests documentés" -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```
