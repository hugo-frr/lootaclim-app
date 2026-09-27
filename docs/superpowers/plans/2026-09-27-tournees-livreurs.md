# Tournées des livreurs — plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Répartir automatiquement les livraisons et reprises du jour entre les livreurs, et montrer à chacun sa tournée sur une carte, avec guidage Google Maps ou Waze.

**Architecture:** Un solveur VRPTW en JavaScript pur (insertion avec regret, ruine et reconstruction, recherche locale) travaille sur une matrice de temps de trajet. Autour de lui, de petits modules purs et testés convertissent les interventions en arrêts, lisent les réponses du géocodage (IGN) et d'OpenRouteService, et fabriquent les liens de navigation. Une couche serveur (`lib/tournees/planification.js`) relie tout ça à la base, et une page `/admin/tournees` présente une vue admin (planifier) et une vue livreur (dérouler).

**Tech Stack:** Next.js 14 (App Router, Server Actions), Prisma 5 + PostgreSQL, `node --test`, MapLibre GL 5 + OpenFreeMap, Géoplateforme IGN, OpenRouteService (facultatif).

**Spec:** `docs/superpowers/specs/2026-09-27-tournees-livreurs-design.md`

## Global Constraints

- Une seule dépendance ajoutée : `maplibre-gl`.
- Entrepôt provisoire : `12 Rue de Rivoli, 75004 Paris` (48.855602, 2.35995), marqué à remplacer.
- Temps sur place 15 min, +10 min si étage sans ascenseur (`floor === "esc"`).
- Capacité d'un véhicule : 6 machines. Journée : 8 h 30 → 22 h 30. Départ et retour à l'entrepôt.
- Sans `ORS_API_KEY` : temps estimés à vol d'oiseau × 1,4 à 18 km/h, tracé en pointillés.
- Aucun appel réseau à l'intérieur d'une transaction Prisma.
- Un livreur ne voit et ne marque que les arrêts de sa propre tournée ; une tournée `STARTED` n'est jamais recalculée par l'admin.
- Tous les textes affichés sont en français.
- Heures stockées en **minutes depuis minuit, heure de Paris** (`Delivery.heurePrevue`), jamais en `DateTime`, pour éviter les pièges de fuseau.

## Review Focus

1. Un livreur en retard qui clique « Commencer » : aucun de ses arrêts ne doit disparaître de sa tournée, même si le solveur ne peut plus tenir tous les créneaux (test dans la tâche 3 : `ordreConserveSiIncomplet`).
2. Une location d'un seul jour (livraison et reprise le même jour) : la reprise doit suivre la livraison, dans la même tournée (test de précédence, tâche 3).
3. Une adresse introuvable par le géocodage : jamais placée au hasard, affichée dans « Non placées » (test tâche 4, score faible ou code postal différent rejetés).
4. Des coordonnées GPS absurdes envoyées par le téléphone (0,0 ou hors Île-de-France) : ignorées, départ depuis l'entrepôt (test tâche 5 : `departValide`).
5. Plus de 10 arrêts restants : le lien Google Maps est découpé en tronçons, jamais tronqué (test tâche 5).

---

### Task 1: Réglages, distances et heure de Paris

**Files:**
- Create: `lib/tournees/config.js`, `lib/tournees/distances.js`, `lib/tournees/distances.test.js`
- Modify: `lib/dates.js` (ajout `minuteInParis`), `lib/dates.test.js`, `package.json` (script de test récursif)

**Interfaces:**
- Produces: `ENTREPOT {nom, adresse, lat, lng}`, `TEMPS_SUR_PLACE_MIN`, `SUPPLEMENT_SANS_ASCENSEUR_MIN`, `CAPACITE_VEHICULE`, `DEBUT_JOURNEE_MIN`, `FIN_JOURNEE_MIN`, `VITESSE_MOYENNE_KMH`, `FACTEUR_DETOUR`, `COULEURS_TOURNEES: string[]` ; `distanceKm(a, b)`, `tempsEstimeMin(a, b)`, `matriceEstimee(points): number[][]` ; `minuteInParis(date?): number`.

- [ ] **Step 1: tests**

```js title="lib/tournees/distances.test.js"
import { test } from "node:test";
import assert from "node:assert/strict";
import { distanceKm, tempsEstimeMin, matriceEstimee } from "./distances.js";

const rivoli = { lat: 48.855602, lng: 2.35995 };
const montmartre = { lat: 48.8867, lng: 2.3431 }; // Sacré-Cœur

test("distance à vol d'oiseau entre deux points de Paris", () => {
  const d = distanceKm(rivoli, montmartre);
  assert.ok(d > 3.4 && d < 3.8, `obtenu ${d}`);
  assert.equal(distanceKm(rivoli, rivoli), 0);
});

test("temps estimé : détours et vitesse moyenne en ville", () => {
  // 3,6 km × 1,4 / 18 km/h ≈ 16,8 min
  const t = tempsEstimeMin(rivoli, montmartre);
  assert.ok(t > 15 && t < 18.5, `obtenu ${t}`);
});

test("la matrice estimée est carrée, nulle sur la diagonale et symétrique", () => {
  const m = matriceEstimee([rivoli, montmartre, { lat: 48.84, lng: 2.3 }]);
  assert.equal(m.length, 3);
  for (let i = 0; i < 3; i++) {
    assert.equal(m[i].length, 3);
    assert.equal(m[i][i], 0);
    for (let j = 0; j < 3; j++) assert.equal(m[i][j], m[j][i]);
  }
});
```

Et dans `lib/dates.test.js`, ajouter `minuteInParis` à l'import et :

```js
test("minuteInParis donne la minute du jour à Paris, été comme hiver", () => {
  assert.equal(minuteInParis(new Date("2026-07-15T10:30:00Z")), 12 * 60 + 30);
  assert.equal(minuteInParis(new Date("2026-01-15T10:30:00Z")), 11 * 60 + 30);
  assert.equal(minuteInParis(new Date("2026-07-14T22:05:00Z")), 5);
});
```

- [ ] **Step 2: vérifier l'échec** — `node --test lib/tournees/ lib/dates.test.js` → FAIL (modules absents).

- [ ] **Step 3: implémentation**

```js title="lib/tournees/config.js"
// Réglages des tournées. Tout ce qu'on pourrait vouloir ajuster après
// quelques semaines de terrain est ici, et nulle part ailleurs.

// ⚠️ ADRESSE PROVISOIRE, choisie au hasard dans le centre de Paris en
// attendant le vrai entrepôt. À remplacer, coordonnées comprises (les
// obtenir sur https://adresse.data.gouv.fr).
export const ENTREPOT = {
  nom: "Entrepôt (adresse provisoire)",
  adresse: "12 Rue de Rivoli, 75004 Paris",
  lat: 48.855602,
  lng: 2.35995,
};

// Installer ou démonter un climatiseur mobile, sur place.
export const TEMPS_SUR_PLACE_MIN = 15;
// Porter la machine dans l'escalier.
export const SUPPLEMENT_SANS_ASCENSEUR_MIN = 10;

// Machines transportables en même temps dans un véhicule. Une seule
// tournée par jour et par livreur : pas de retour recharger à mi-journée.
export const CAPACITE_VEHICULE = 6;

// Journée du livreur, en minutes depuis minuit. Couvre les créneaux
// clients de 9 h à 22 h, avec le temps de rejoindre le premier et de
// rentrer du dernier.
export const DEBUT_JOURNEE_MIN = 8 * 60 + 30;
export const FIN_JOURNEE_MIN = 22 * 60 + 30;

// Estimation sans service de calcul d'itinéraire : les rues ne vont pas en
// ligne droite (facteur de détour) et Paris roule lentement.
export const VITESSE_MOYENNE_KMH = 18;
export const FACTEUR_DETOUR = 1.4;

// Une couleur par livreur sur la carte, lisibles sur fond clair.
export const COULEURS_TOURNEES = ["#2e5fa8", "#e4572e", "#17a34a", "#9333ea", "#d97706", "#0891b2", "#db2777"];
```

```js title="lib/tournees/distances.js"
// Distances et temps de trajet estimés, quand aucun service de calcul
// d'itinéraire n'est configuré.

import { FACTEUR_DETOUR, VITESSE_MOYENNE_KMH } from "./config.js";

const RAYON_TERRE_KM = 6371;
const rad = (deg) => (deg * Math.PI) / 180;

/** Distance à vol d'oiseau (formule de haversine), en kilomètres. */
export function distanceKm(a, b) {
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * RAYON_TERRE_KM * Math.asin(Math.sqrt(h));
}

/** Temps de conduite estimé, en minutes. */
export function tempsEstimeMin(a, b) {
  return ((distanceKm(a, b) * FACTEUR_DETOUR) / VITESSE_MOYENNE_KMH) * 60;
}

/** Matrice des temps estimés entre tous les points, en minutes. */
export function matriceEstimee(points) {
  return points.map((a) => points.map((b) => tempsEstimeMin(a, b)));
}
```

Dans `lib/dates.js`, ajouter après `nowInParis` :

```js
// Minute du jour à Paris (0 à 1439) : 12 h 30 → 750.
export function minuteInParis(date = new Date()) {
  const parts = new Intl.DateTimeFormat("fr-FR", {
    timeZone: "Europe/Paris",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const get = (type) => Number(parts.find((p) => p.type === type).value);
  return (get("hour") % 24) * 60 + get("minute");
}
```

Dans `package.json`, le script de test devient `"test": "node --test lib/ lib/tournees/"`.

- [ ] **Step 4: vérifier** — `npm test` → tout PASS.
- [ ] **Step 5: commit** — `feat(tournees): reglages, distances estimees et minute de Paris`

---

### Task 2: Des interventions aux arrêts

**Files:**
- Create: `lib/tournees/arrets.js`, `lib/tournees/arrets.test.js`

**Interfaces:**
- Consumes: `TEMPS_SUR_PLACE_MIN`, `SUPPLEMENT_SANS_ASCENSEUR_MIN`, `DEBUT_JOURNEE_MIN`, `FIN_JOURNEE_MIN` (tâche 1).
- Produces:
  - `fenetreDuCreneau(creneau: string): [number, number]` — `"9h-11h"` → `[540, 660]` ; créneau illisible → journée entière.
  - `tempsSurPlace(etage: string): number`
  - `interventionPlanifiable(delivery {type,status}, statutReservation: string): boolean`
  - `versArrets(items: {id, type, bookingId, timeSlot, floor, lieu}[]): Arret[]` où `Arret = {id, type, lieu, fenetre:[a,b], service, apres: string|null}` ; `apres` = id de la livraison de la même réservation si elle est dans la liste (location d'un jour).
  - `heureTexte(minutes: number): string` — `750` → `"12h30"`, `540` → `"9h00"`.

- [ ] **Step 1: tests**

```js title="lib/tournees/arrets.test.js"
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  fenetreDuCreneau,
  tempsSurPlace,
  interventionPlanifiable,
  versArrets,
  heureTexte,
} from "./arrets.js";
import { TIME_SLOTS } from "../constants.js";

test("un créneau devient une fenêtre en minutes", () => {
  assert.deepEqual(fenetreDuCreneau("9h-11h"), [540, 660]);
  assert.deepEqual(fenetreDuCreneau("20h-22h"), [1200, 1320]);
});

test("tous les créneaux proposés aux clients sont lisibles", () => {
  for (const s of TIME_SLOTS) {
    const [a, b] = fenetreDuCreneau(s.id);
    assert.equal(a, s.startHour * 60);
    assert.equal(b - a, 120);
  }
});

test("un créneau illisible laisse toute la journée plutôt que de bloquer", () => {
  assert.deepEqual(fenetreDuCreneau("n'importe quoi"), [8 * 60 + 30, 22 * 60 + 30]);
});

test("temps sur place : plus long sans ascenseur", () => {
  assert.equal(tempsSurPlace("rdc"), 15);
  assert.equal(tempsSurPlace("asc"), 15);
  assert.equal(tempsSurPlace("esc"), 25);
});

test("seules les interventions actionnables entrent dans une tournée", () => {
  const liv = { type: "DROPOFF", status: "SCHEDULED" };
  const rep = { type: "PICKUP", status: "SCHEDULED" };
  assert.equal(interventionPlanifiable(liv, "CONFIRMED"), true);
  assert.equal(interventionPlanifiable(liv, "PENDING"), false);
  assert.equal(interventionPlanifiable(liv, "AWAITING_PAYMENT"), false);
  assert.equal(interventionPlanifiable(rep, "DELIVERED"), true);
  assert.equal(interventionPlanifiable(rep, "CONFIRMED"), true); // location d'un jour
  assert.equal(interventionPlanifiable(rep, "CANCELLED"), false);
  assert.equal(interventionPlanifiable({ ...liv, status: "DONE" }, "CONFIRMED"), false);
});

test("versArrets : fenêtre, temps sur place, et reprise après la livraison du même jour", () => {
  const arrets = versArrets([
    { id: "d1", type: "DROPOFF", bookingId: "b1", timeSlot: "9h-11h", floor: "esc", lieu: 1 },
    { id: "p1", type: "PICKUP", bookingId: "b1", timeSlot: "18h-20h", floor: "esc", lieu: 1 },
    { id: "p2", type: "PICKUP", bookingId: "b2", timeSlot: "14h-16h", floor: "rdc", lieu: 2 },
  ]);
  assert.deepEqual(arrets[0], { id: "d1", type: "DROPOFF", lieu: 1, fenetre: [540, 660], service: 25, apres: null });
  assert.equal(arrets[1].apres, "d1");
  assert.equal(arrets[2].apres, null);
});

test("heureTexte", () => {
  assert.equal(heureTexte(750), "12h30");
  assert.equal(heureTexte(540), "9h00");
  assert.equal(heureTexte(1325.6), "22h06");
});
```

- [ ] **Step 2: vérifier l'échec** — `node --test lib/tournees/arrets.test.js` → FAIL.

- [ ] **Step 3: implémentation**

```js title="lib/tournees/arrets.js"
// Transforme les interventions de la base (livraisons, reprises) en arrêts
// que le solveur sait manipuler : un lieu, une fenêtre horaire, un temps sur
// place, un effet sur le chargement du véhicule.

import {
  TEMPS_SUR_PLACE_MIN,
  SUPPLEMENT_SANS_ASCENSEUR_MIN,
  DEBUT_JOURNEE_MIN,
  FIN_JOURNEE_MIN,
} from "./config.js";

/** "9h-11h" → [540, 660], en minutes depuis minuit. */
export function fenetreDuCreneau(creneau) {
  const m = /^(\d{1,2})h-(\d{1,2})h$/.exec(String(creneau ?? ""));
  // Un créneau illisible ne doit pas rendre l'arrêt impossible : on laisse
  // toute la journée, l'admin verra l'heure prévue.
  if (!m) return [DEBUT_JOURNEE_MIN, FIN_JOURNEE_MIN];
  return [Number(m[1]) * 60, Number(m[2]) * 60];
}

export function tempsSurPlace(etage) {
  return TEMPS_SUR_PLACE_MIN + (etage === "esc" ? SUPPLEMENT_SANS_ASCENSEUR_MIN : 0);
}

/**
 * L'intervention doit-elle figurer dans une tournée ? Seulement si on peut
 * réellement la faire : une livraison de réservation confirmée, une reprise
 * de machine livrée (ou livrée le jour même, pour une location d'un jour).
 */
export function interventionPlanifiable(delivery, statutReservation) {
  if (delivery.status !== "SCHEDULED") return false;
  if (delivery.type === "DROPOFF") return statutReservation === "CONFIRMED";
  if (delivery.type === "PICKUP") return ["CONFIRMED", "DELIVERED"].includes(statutReservation);
  return false;
}

export function versArrets(items) {
  const livraisonDe = new Map(
    items.filter((i) => i.type === "DROPOFF").map((i) => [i.bookingId, i.id])
  );
  return items.map((i) => ({
    id: i.id,
    type: i.type,
    lieu: i.lieu,
    fenetre: fenetreDuCreneau(i.timeSlot),
    service: tempsSurPlace(i.floor),
    // Location d'un seul jour : on ne reprend pas une machine pas encore livrée.
    apres: i.type === "PICKUP" ? livraisonDe.get(i.bookingId) ?? null : null,
  }));
}

/** 750 → "12h30" */
export function heureTexte(minutes) {
  const m = Math.round(minutes);
  return `${Math.floor(m / 60)}h${String(m % 60).padStart(2, "0")}`;
}
```

- [ ] **Step 4: vérifier** — `npm test` → PASS.
- [ ] **Step 5: commit** — `feat(tournees): conversion des interventions en arrets`

---

### Task 3: Le solveur

**Files:**
- Create: `lib/tournees/solveur.js`, `lib/tournees/solveur.test.js`

**Interfaces:**
- Consumes: le type `Arret` de la tâche 2.
- Produces:
  - `resoudre({ arrets: Arret[], vehicules: Vehicule[], temps: number[][], iterations?: number = 400, graine?: number = 1, dureeMaxMs?: number = 2500 }): { tournees: {vehicule, arrets: {id, arrivee, debut}[], conduite, fin}[], nonCases: {id, raison}[] }` — `Vehicule = {id, depart: number, arrivee: number, debut: number, fin: number, capacite: number}` (lieux = indices dans `temps`, heures en minutes). `tournees[i]` correspond à `vehicules[i]`.
  - `evaluerTournee(ids: string[], vehicule, arretsParId: Map, temps): {conduite, travail, fin, passages} | null`
  - `aleatoire(graine): () => number`
  - `ordreConserveSiIncomplet(resultat, idsActuels: string[]): string[]` — ordre retenu pour une seule tournée : celui du solveur s'il place tout, sinon l'ordre actuel.

- [ ] **Step 1: tests**

```js title="lib/tournees/solveur.test.js"
import { test } from "node:test";
import assert from "node:assert/strict";
import { resoudre, evaluerTournee, aleatoire, ordreConserveSiIncomplet } from "./solveur.js";

// Plan en kilomètres : 1 km = 3 minutes de trajet. Lieu 0 = entrepôt.
function monde(coords) {
  const temps = coords.map(([x1, y1]) => coords.map(([x2, y2]) => Math.hypot(x1 - x2, y1 - y2) * 3));
  return temps;
}
const JOURNEE = [8 * 60 + 30, 22 * 60 + 30];
const vehicule = (id, extra = {}) => ({ id, depart: 0, arrivee: 0, debut: JOURNEE[0], fin: JOURNEE[1], capacite: 6, ...extra });
const arret = (id, lieu, extra = {}) => ({ id, type: "DROPOFF", lieu, fenetre: JOURNEE, service: 15, apres: null, ...extra });

// Vérifie les règles du métier sur une solution : chaque arrêt une seule
// fois, créneaux tenus, capacité jamais dépassée, retour avant la fin.
function verifier(res, arrets, vehicules, temps) {
  const parId = new Map(arrets.map((a) => [a.id, a]));
  const vus = [];
  res.tournees.forEach((t, i) => {
    const ids = t.arrets.map((a) => a.id);
    assert.ok(evaluerTournee(ids, vehicules[i], parId, temps), `tournée ${i} infaisable`);
    for (const a of t.arrets) {
      const [debut, fin] = parId.get(a.id).fenetre;
      assert.ok(a.debut >= debut - 1e-6 && a.debut <= fin + 1e-6, `${a.id} hors créneau`);
    }
    vus.push(...ids);
  });
  vus.push(...res.nonCases.map((n) => n.id));
  assert.deepEqual([...vus].sort(), arrets.map((a) => a.id).sort());
}

test("un seul livreur : les arrêts alignés sont visités dans l'ordre", () => {
  const temps = monde([[0, 0], [10, 0], [20, 0], [30, 0]]);
  const arrets = [arret("c", 3), arret("a", 1), arret("b", 2)];
  const res = resoudre({ arrets, vehicules: [vehicule("v1")], temps });
  const ordre = res.tournees[0].arrets.map((a) => a.id);
  assert.ok(ordre.join() === "a,b,c" || ordre.join() === "c,b,a", ordre.join());
  assert.equal(res.nonCases.length, 0);
});

test("les créneaux imposent l'ordre, même contre la géographie", () => {
  const temps = monde([[0, 0], [2, 0], [20, 0]]);
  const arrets = [
    arret("proche", 1, { fenetre: [14 * 60, 16 * 60] }),
    arret("loin", 2, { fenetre: [9 * 60, 11 * 60] }),
  ];
  const vehicules = [vehicule("v1")];
  const res = resoudre({ arrets, vehicules, temps });
  assert.deepEqual(res.tournees[0].arrets.map((a) => a.id), ["loin", "proche"]);
  verifier(res, arrets, vehicules, temps);
});

test("la capacité du véhicule n'est jamais dépassée", () => {
  const temps = monde([[0, 0], [1, 0], [2, 0], [3, 0], [4, 0], [5, 0]]);
  const arrets = [1, 2, 3, 4, 5].map((l) => arret(`d${l}`, l));
  const vehicules = [vehicule("v1", { capacite: 3 }), vehicule("v2", { capacite: 3 })];
  const res = resoudre({ arrets, vehicules, temps });
  verifier(res, arrets, vehicules, temps);
  assert.equal(res.nonCases.length, 0);
  for (const t of res.tournees) assert.ok(t.arrets.length <= 3);
});

test("une reprise libère de la place : livrer 6 puis reprendre 1 tient dans 6", () => {
  const temps = monde([[0, 0], [1, 0], [2, 0], [3, 0], [4, 0], [5, 0], [6, 0], [7, 0]]);
  const arrets = [1, 2, 3, 4, 5, 6].map((l) => arret(`d${l}`, l));
  arrets.push(arret("p7", 7, { type: "PICKUP" }));
  const vehicules = [vehicule("v1")];
  const res = resoudre({ arrets, vehicules, temps });
  verifier(res, arrets, vehicules, temps);
  assert.equal(res.nonCases.length, 0);
});

test("un créneau intenable est signalé, jamais forcé", () => {
  const temps = monde([[0, 0], [5, 0]]);
  const arrets = [arret("trop-tot", 1, { fenetre: [6 * 60, 7 * 60] })];
  const res = resoudre({ arrets, vehicules: [vehicule("v1")], temps });
  assert.equal(res.tournees[0].arrets.length, 0);
  assert.equal(res.nonCases.length, 1);
  assert.match(res.nonCases[0].raison, /créneau/);
});

test("trop d'arrêts pour les véhicules : signalé comme manque de place", () => {
  const temps = monde([[0, 0], [1, 0], [2, 0]]);
  const arrets = [arret("a", 1), arret("b", 2)];
  const res = resoudre({ arrets, vehicules: [vehicule("v1", { capacite: 1 })], temps });
  assert.equal(res.nonCases.length, 1);
  assert.match(res.nonCases[0].raison, /place/);
});

test("location d'un jour : la reprise suit la livraison, dans la même tournée", () => {
  const temps = monde([[0, 0], [5, 5], [-5, -5]]);
  const arrets = [
    arret("rep", 1, { type: "PICKUP", apres: "liv", fenetre: [9 * 60, 22 * 60] }),
    arret("liv", 1, { fenetre: [9 * 60, 22 * 60] }),
    arret("autre", 2),
  ];
  const vehicules = [vehicule("v1"), vehicule("v2")];
  const res = resoudre({ arrets, vehicules, temps });
  verifier(res, arrets, vehicules, temps);
  const t = res.tournees.find((x) => x.arrets.some((a) => a.id === "liv"));
  const ids = t.arrets.map((a) => a.id);
  assert.ok(ids.indexOf("rep") > ids.indexOf("liv"));
});

test("deux quartiers, deux livreurs : chacun prend un quartier", () => {
  const coords = [[0, 0], [-10, 0], [-10, 1], [-11, 0], [-11, 1], [10, 0], [10, 1], [11, 0], [11, 1]];
  const temps = monde(coords);
  const arrets = coords.slice(1).map((_, i) => arret(i < 4 ? `ouest${i}` : `est${i}`, i + 1));
  const vehicules = [vehicule("v1"), vehicule("v2")];
  const res = resoudre({ arrets, vehicules, temps });
  verifier(res, arrets, vehicules, temps);
  for (const t of res.tournees) {
    const quartiers = new Set(t.arrets.map((a) => a.id.replace(/\d+$/, "")));
    assert.equal(quartiers.size, 1, `tournée mélangée : ${t.arrets.map((a) => a.id)}`);
  }
});

function grosseInstance(n, v) {
  const rng = aleatoire(42);
  const coords = [[0, 0]];
  for (let i = 0; i < n; i++) coords.push([rng() * 16 - 8, rng() * 12 - 6]);
  const creneaux = [9, 11, 14, 16, 18, 20];
  const arrets = coords.slice(1).map((_, i) => {
    const h = creneaux[Math.floor(rng() * creneaux.length)];
    return arret(`s${i}`, i + 1, { type: rng() < 0.6 ? "DROPOFF" : "PICKUP", fenetre: [h * 60, h * 60 + 120] });
  });
  const vehicules = Array.from({ length: v }, (_, i) => vehicule(`v${i}`));
  return { temps: monde(coords), arrets, vehicules };
}

test("instance réaliste : toutes les règles tenues, résultat reproductible", () => {
  const { temps, arrets, vehicules } = grosseInstance(40, 4);
  const a = resoudre({ arrets, vehicules, temps, iterations: 150 });
  verifier(a, arrets, vehicules, temps);
  const b = resoudre({ arrets, vehicules, temps, iterations: 150 });
  assert.deepEqual(a, b);
});

test("60 arrêts et 5 livreurs en moins de 3 secondes", () => {
  const { temps, arrets, vehicules } = grosseInstance(60, 5);
  const t0 = Date.now();
  const res = resoudre({ arrets, vehicules, temps });
  assert.ok(Date.now() - t0 < 3000, `${Date.now() - t0} ms`);
  verifier(res, arrets, vehicules, temps);
});

test("sans livreur, tout est signalé non casé", () => {
  const temps = monde([[0, 0], [1, 1]]);
  const res = resoudre({ arrets: [arret("a", 1)], vehicules: [], temps });
  assert.deepEqual(res.tournees, []);
  assert.equal(res.nonCases.length, 1);
});

test("recalcul d'une tournée : si un arrêt ne tient plus, on garde l'ordre actuel", () => {
  const complet = { tournees: [{ arrets: [{ id: "b" }, { id: "a" }] }], nonCases: [] };
  assert.deepEqual(ordreConserveSiIncomplet(complet, ["a", "b"]), ["b", "a"]);
  const incomplet = { tournees: [{ arrets: [{ id: "b" }] }], nonCases: [{ id: "a" }] };
  assert.deepEqual(ordreConserveSiIncomplet(incomplet, ["a", "b"]), ["a", "b"]);
});
```

- [ ] **Step 2: vérifier l'échec** — `node --test lib/tournees/solveur.test.js` → FAIL.

- [ ] **Step 3: implémentation**

```js title="lib/tournees/solveur.js"
// Calcul des tournées : répartir des arrêts entre plusieurs livreurs et les
// ordonner, en respectant les créneaux promis aux clients et la place dans
// les véhicules. C'est le problème classique du VRPTW (tournées de véhicules
// avec fenêtres horaires), ici avec livraisons et reprises mélangées.
//
// Aucune méthode ne garantit la meilleure solution en temps raisonnable. On
// suit celle des solveurs professionnels :
//   1. construction par insertion avec regret : on place d'abord les arrêts
//      qui n'ont qu'une bonne place possible ;
//   2. ruine et reconstruction (LNS) : on retire un groupe d'arrêts voisins
//      et on les réinsère, en boucle, pour sortir des solutions « bonnes
//      mais pas meilleures » ;
//   3. recherche locale finale : déplacer, échanger, inverser un morceau
//      (2-opt), échanger les fins de deux tournées (2-opt*).
//
// Module pur : ni base, ni réseau. Toutes les heures sont en minutes depuis
// minuit, tous les lieux sont des indices dans la matrice des temps.

// Coût d'un arrêt laissé de côté : bien plus cher que n'importe quel détour.
const PENALITE_NON_CASE = 100000;
// Équilibre entre livreurs : minutes de pénalité par heure² de travail. Une
// journée de 8 h contre 0 h coûte 320 min de plus que deux journées de 4 h.
const POIDS_EQUILIBRE = 10;
const EPSILON = 1e-9;

/** Générateur pseudo-aléatoire à graine (mulberry32) : résultats reproductibles. */
export function aleatoire(graine) {
  let a = graine >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Parcourt une tournée. Renvoie null dès qu'une règle est violée, sinon
 * { conduite, travail, fin, passages: [{ arrivee, debut }] }.
 */
export function evaluerTournee(ids, vehicule, arrets, temps) {
  // Les machines à livrer sont toutes chargées au départ.
  let charge = 0;
  for (const id of ids) if (arrets.get(id).type === "DROPOFF") charge++;
  if (charge > vehicule.capacite) return null;

  let t = vehicule.debut;
  let lieu = vehicule.depart;
  let conduite = 0;
  let travail = 0;
  const vus = new Set();
  const passages = [];
  for (const id of ids) {
    const a = arrets.get(id);
    if (a.apres && !vus.has(a.apres)) return null;
    const trajet = temps[lieu][a.lieu];
    const arrivee = t + trajet;
    // En avance : on attend l'ouverture du créneau.
    const debut = Math.max(arrivee, a.fenetre[0]);
    if (debut > a.fenetre[1] + EPSILON) return null;
    conduite += trajet;
    travail += trajet + a.service;
    t = debut + a.service;
    charge += a.type === "DROPOFF" ? -1 : 1;
    if (charge > vehicule.capacite) return null;
    vus.add(id);
    passages.push({ arrivee, debut });
    lieu = a.lieu;
  }
  const retour = temps[lieu][vehicule.arrivee];
  conduite += retour;
  travail += retour;
  const fin = t + retour;
  if (fin > vehicule.fin + EPSILON) return null;
  return { conduite, travail, fin, passages };
}

const coutDe = (ev) => ev.conduite + POIDS_EQUILIBRE * (ev.travail / 60) ** 2;

function coutRoute(ids, v, ctx) {
  const ev = evaluerTournee(ids, ctx.vehicules[v], ctx.arrets, ctx.temps);
  return ev ? coutDe(ev) : null;
}

const coutTotal = (sol) =>
  sol.couts.reduce((s, c) => s + c, 0) + PENALITE_NON_CASE * sol.nonCases.length;

const copier = (sol) => ({
  routes: sol.routes.map((r) => r.slice()),
  couts: sol.couts.slice(),
  nonCases: sol.nonCases.slice(),
});

// Insère les arrêts donnés, le plus « regrettable » d'abord. Les meilleures
// places sont gardées en cache et recalculées seulement pour la tournée qui
// vient de changer.
function inserer(sol, ids, ctx) {
  const V = ctx.vehicules.length;
  const aPlacer = new Set(ids);
  const meilleurePlace = (id, v) => {
    const r = sol.routes[v];
    let best = null;
    for (let p = 0; p <= r.length; p++) {
      const c = coutRoute([...r.slice(0, p), id, ...r.slice(p)], v, ctx);
      if (c !== null && (best === null || c - sol.couts[v] < best.delta - EPSILON)) {
        best = { delta: c - sol.couts[v], pos: p, cout: c };
      }
    }
    return best;
  };
  const cache = new Map();
  for (const id of aPlacer) cache.set(id, Array.from({ length: V }, (_, v) => meilleurePlace(id, v)));

  while (aPlacer.size) {
    let choix = null;
    for (const id of aPlacer) {
      const options = cache
        .get(id)
        .map((o, v) => o && { ...o, v })
        .filter(Boolean)
        .sort((x, y) => x.delta - y.delta || x.v - y.v);
      if (!options.length) continue;
      const regret = options.length > 1 ? options[1].delta - options[0].delta : Infinity;
      const delta = options[0].delta;
      // Le plus grand regret d'abord ; à égalité, l'insertion la moins chère ;
      // puis l'identifiant, pour un résultat reproductible.
      let mieux = !choix;
      if (!mieux) {
        if (regret !== choix.regret && Math.abs(regret - choix.regret) > EPSILON) mieux = regret > choix.regret;
        else if (Math.abs(delta - choix.delta) > EPSILON) mieux = delta < choix.delta;
        else mieux = id < choix.id;
      }
      if (mieux) choix = { id, regret, ...options[0] };
    }
    if (!choix) break;
    const r = sol.routes[choix.v];
    sol.routes[choix.v] = [...r.slice(0, choix.pos), choix.id, ...r.slice(choix.pos)];
    sol.couts[choix.v] = choix.cout;
    aPlacer.delete(choix.id);
    for (const id of aPlacer) cache.get(id)[choix.v] = meilleurePlace(id, choix.v);
  }
  sol.nonCases = [...aPlacer];
}

// Retire un groupe d'arrêts proches les uns des autres : les réinsérer
// ensemble permet de réorganiser tout un quartier d'un coup.
function retirer(sol, ctx, rng) {
  const places = sol.routes.flat();
  if (!places.length) return [];
  const maxQ = Math.min(10, Math.max(2, Math.ceil(places.length * 0.3)));
  const q = Math.min(places.length, 2 + Math.floor(rng() * (maxQ - 1)));
  const graine = ctx.arrets.get(places[Math.floor(rng() * places.length)]);
  const proximite = (id) => {
    const a = ctx.arrets.get(id);
    return ctx.temps[graine.lieu][a.lieu] + ctx.temps[a.lieu][graine.lieu];
  };
  const retires = new Set(
    [...places].sort((x, y) => proximite(x) - proximite(y) || (x < y ? -1 : 1)).slice(0, q)
  );
  // Une livraison et sa reprise du même jour partent ensemble.
  for (const id of places) {
    const a = ctx.arrets.get(id);
    if (a.apres && (retires.has(id) || retires.has(a.apres))) {
      retires.add(id);
      retires.add(a.apres);
    }
  }
  sol.routes.forEach((r, v) => {
    const reste = r.filter((id) => !retires.has(id));
    let c = coutRoute(reste, v, ctx);
    // Temps de trajet réels non « triangulaires » : retirer un arrêt peut,
    // rarement, rendre la suite infaisable. On vide alors la tournée.
    if (c === null) {
      reste.forEach((id) => retires.add(id));
      sol.routes[v] = [];
      c = coutRoute([], v, ctx);
    } else {
      sol.routes[v] = reste;
    }
    sol.couts[v] = c ?? 0;
  });
  return [...retires];
}

// Applique les nouvelles tournées si elles sont faisables et moins chères.
function tenter(sol, ctx, changements) {
  let delta = 0;
  const nouveaux = [];
  for (const [v, r] of changements) {
    const c = coutRoute(r, v, ctx);
    if (c === null) return false;
    delta += c - sol.couts[v];
    nouveaux.push([v, r, c]);
  }
  if (delta >= -1e-6) return false;
  for (const [v, r, c] of nouveaux) {
    sol.routes[v] = r;
    sol.couts[v] = c;
  }
  return true;
}

// Cherche une amélioration et l'applique. Renvoie false si aucune.
function unPas(sol, ctx) {
  const R = sol.routes;
  const V = R.length;
  // 2-opt : inverser un morceau d'une tournée.
  for (let v = 0; v < V; v++) {
    const r = R[v];
    for (let i = 0; i < r.length - 1; i++) {
      for (let j = i + 1; j < r.length; j++) {
        const n = [...r.slice(0, i), ...r.slice(i, j + 1).reverse(), ...r.slice(j + 1)];
        if (tenter(sol, ctx, [[v, n]])) return true;
      }
    }
  }
  // Déplacer un arrêt, dans sa tournée ou vers une autre.
  for (let a = 0; a < V; a++) {
    for (let i = 0; i < R[a].length; i++) {
      const x = R[a][i];
      const sans = R[a].filter((_, k) => k !== i);
      for (let b = 0; b < V; b++) {
        const base = b === a ? sans : R[b];
        for (let j = 0; j <= base.length; j++) {
          if (b === a && j === i) continue;
          const n = [...base.slice(0, j), x, ...base.slice(j)];
          const ok = b === a ? tenter(sol, ctx, [[a, n]]) : tenter(sol, ctx, [[a, sans], [b, n]]);
          if (ok) return true;
        }
      }
    }
  }
  for (let a = 0; a < V; a++) {
    for (let b = a + 1; b < V; b++) {
      // Échanger deux arrêts entre deux tournées.
      for (let i = 0; i < R[a].length; i++) {
        for (let j = 0; j < R[b].length; j++) {
          const na = R[a].slice();
          const nb = R[b].slice();
          [na[i], nb[j]] = [nb[j], na[i]];
          if (tenter(sol, ctx, [[a, na], [b, nb]])) return true;
        }
      }
      // 2-opt* : échanger les fins de deux tournées.
      for (let i = 0; i <= R[a].length; i++) {
        for (let j = 0; j <= R[b].length; j++) {
          const na = [...R[a].slice(0, i), ...R[b].slice(j)];
          const nb = [...R[b].slice(0, j), ...R[a].slice(i)];
          if (tenter(sol, ctx, [[a, na], [b, nb]])) return true;
        }
      }
    }
  }
  return false;
}

function ameliorer(sol, ctx, limite) {
  for (let k = 0; k < 2000 && Date.now() < limite; k++) {
    if (!unPas(sol, ctx)) return;
  }
}

function raison(id, sol, ctx) {
  const a = ctx.arrets.get(id);
  if (a.apres && sol.nonCases.includes(a.apres)) {
    return "Dépend de la livraison du même jour, elle-même non placée.";
  }
  const seul = a.apres ? [a.apres, id] : [id];
  const faisableSeul = ctx.vehicules.some(
    (v) => evaluerTournee(seul, v, ctx.arrets, ctx.temps) !== null
  );
  if (!ctx.vehicules.length) return "Aucun livreur sélectionné.";
  return faisableSeul
    ? "Plus de place dans les tournées : trop d'arrêts sur ce créneau ou véhicules pleins."
    : "Créneau impossible à tenir depuis l'entrepôt dans la journée.";
}

export function resoudre({ arrets, vehicules, temps, iterations = 400, graine = 1, dureeMaxMs = 2500 }) {
  const ctx = { arrets: new Map(arrets.map((a) => [a.id, a])), vehicules, temps };
  const limite = Date.now() + dureeMaxMs;
  const rng = aleatoire(graine);

  const courantInit = {
    routes: vehicules.map(() => []),
    couts: vehicules.map((_, v) => coutRoute([], v, ctx) ?? 0),
    nonCases: [],
  };
  inserer(courantInit, arrets.map((a) => a.id).sort(), ctx);
  let courant = courantInit;
  let meilleure = copier(courant);

  for (let k = 0; k < iterations && Date.now() < limite && vehicules.length; k++) {
    const essai = copier(courant);
    const retires = retirer(essai, ctx, rng);
    inserer(essai, [...retires, ...essai.nonCases], ctx);
    // Acceptation « record à record » : on tolère une solution un peu moins
    // bonne en début de recherche, de moins en moins ensuite.
    const tolerance = 0.01 * coutTotal(meilleure) * (1 - k / iterations);
    if (coutTotal(essai) < coutTotal(courant) + tolerance) courant = essai;
    if (coutTotal(courant) < coutTotal(meilleure) - 1e-6) meilleure = copier(courant);
  }
  ameliorer(meilleure, ctx, Math.max(limite, Date.now() + 300));

  return {
    tournees: vehicules.map((v, i) => {
      const ids = meilleure.routes[i];
      const ev = evaluerTournee(ids, v, ctx.arrets, temps);
      return {
        vehicule: v.id,
        arrets: ids.map((id, k) => ({
          id,
          arrivee: Math.round(ev.passages[k].arrivee),
          debut: Math.round(ev.passages[k].debut),
        })),
        conduite: Math.round(ev.conduite),
        fin: Math.round(ev.fin),
      };
    }),
    nonCases: meilleure.nonCases.sort().map((id) => ({ id, raison: raison(id, meilleure, ctx) })),
  };
}

/**
 * Pour recalculer UNE tournée déjà attribuée : un arrêt ne doit jamais en
 * disparaître. Si le solveur n'arrive plus à tout placer (livreur déjà en
 * retard), on garde l'ordre actuel.
 */
export function ordreConserveSiIncomplet(resultat, idsActuels) {
  if (resultat.nonCases.length) return idsActuels.slice();
  return resultat.tournees[0].arrets.map((a) => a.id);
}
```

- [ ] **Step 4: vérifier** — `npm test` → PASS (le test de 60 arrêts < 3 s). Si le test « deux quartiers » échoue, c'est le poids d'équilibre ou le regret qu'il faut revoir, pas le test.
- [ ] **Step 5: commit** — `feat(tournees): solveur VRPTW (regret, LNS, recherche locale)`

---

### Task 4: Géocodage et temps de trajet

**Files:**
- Create: `lib/geocodage.js`, `lib/geocodage.test.js`, `lib/itineraires.js`, `lib/itineraires.test.js`
- Modify: `.env.example` (ajout `ORS_API_KEY`)

**Interfaces:**
- Produces:
  - `lireReponseGeocodage(json, codePostal): {lat, lng, label} | null`
  - `geocoder({line1, zip, city}, fetchImpl = fetch): Promise<{lat, lng, label} | null>` — ne lève jamais.
  - `lireMatriceOrs(json, points): number[][]` — minutes ; cellule nulle → estimation.
  - `matriceTemps(points): Promise<{minutes: number[][], source: "ors" | "estimation"}>`
  - `traceTournee(points): Promise<[number, number][] | null>` — `[lng, lat]`, null sans clé ou en erreur.

- [ ] **Step 1: tests**

```js title="lib/geocodage.test.js"
import { test } from "node:test";
import assert from "node:assert/strict";
import { lireReponseGeocodage, geocoder } from "./geocodage.js";

// Réponse réelle de la Géoplateforme, raccourcie.
const reponse = (score, postcode = "75004") => ({
  type: "FeatureCollection",
  features: [
    {
      type: "Feature",
      geometry: { type: "Point", coordinates: [2.35995, 48.855602] },
      properties: { label: "12 Rue de Rivoli 75004 Paris", score, postcode, type: "housenumber" },
    },
  ],
});

test("une adresse bien reconnue donne ses coordonnées", () => {
  assert.deepEqual(lireReponseGeocodage(reponse(0.97), "75004"), {
    lat: 48.855602,
    lng: 2.35995,
    label: "12 Rue de Rivoli 75004 Paris",
  });
});

test("un score trop faible est refusé : mieux vaut signaler que placer au hasard", () => {
  assert.equal(lireReponseGeocodage(reponse(0.3), "75004"), null);
});

test("un code postal différent est refusé", () => {
  assert.equal(lireReponseGeocodage(reponse(0.97, "75011"), "75004"), null);
});

test("aucun résultat ou réponse vide", () => {
  assert.equal(lireReponseGeocodage({ features: [] }, "75004"), null);
  assert.equal(lireReponseGeocodage(null, "75004"), null);
});

test("geocoder ne lève jamais, même si le service tombe", async () => {
  const enPanne = async () => { throw new Error("réseau"); };
  assert.equal(await geocoder({ line1: "12 rue de Rivoli", zip: "75004", city: "Paris" }, enPanne), null);
  const erreur500 = async () => ({ ok: false, json: async () => ({}) });
  assert.equal(await geocoder({ line1: "x", zip: "75004", city: "Paris" }, erreur500), null);
});

test("geocoder interroge le service avec l'adresse complète", async () => {
  let url = "";
  const faux = async (u) => { url = String(u); return { ok: true, json: async () => reponse(0.97) }; };
  const r = await geocoder({ line1: "12 rue de Rivoli", zip: "75004", city: "Paris" }, faux);
  assert.equal(r.lat, 48.855602);
  assert.match(url, /data\.geopf\.fr\/geocodage\/search/);
  assert.match(url, /12\+rue\+de\+Rivoli|12%20rue%20de%20Rivoli/);
});
```

```js title="lib/itineraires.test.js"
import { test } from "node:test";
import assert from "node:assert/strict";
import { lireMatriceOrs, matriceTemps, traceTournee } from "./itineraires.js";

const points = [
  { lat: 48.855602, lng: 2.35995 },
  { lat: 48.8867, lng: 2.3431 },
];

test("la matrice OpenRouteService passe des secondes aux minutes", () => {
  const m = lireMatriceOrs({ durations: [[0, 600], [540, 0]] }, points);
  assert.deepEqual(m, [[0, 10], [9, 0]]);
});

test("une cellule sans itinéraire est remplacée par l'estimation", () => {
  const m = lireMatriceOrs({ durations: [[0, null], [540, 0]] }, points);
  assert.ok(m[0][1] > 15 && m[0][1] < 18.5);
});

test("sans clé, on estime et on ne trace pas", async () => {
  const cle = process.env.ORS_API_KEY;
  delete process.env.ORS_API_KEY;
  const { minutes, source } = await matriceTemps(points);
  assert.equal(source, "estimation");
  assert.equal(minutes.length, 2);
  assert.equal(await traceTournee(points), null);
  if (cle) process.env.ORS_API_KEY = cle;
});
```

- [ ] **Step 2: vérifier l'échec** — `node --test lib/geocodage.test.js lib/itineraires.test.js` → FAIL.

- [ ] **Step 3: implémentation**

```js title="lib/geocodage.js"
// Adresse → coordonnées GPS, via la Géoplateforme de l'IGN (Base Adresse
// Nationale) : la référence officielle française, gratuite, sans clé.

const URL_SERVICE = "https://data.geopf.fr/geocodage/search";
// En dessous, la correspondance est trop incertaine pour y envoyer un livreur.
const SCORE_MIN = 0.5;

export function lireReponseGeocodage(json, codePostal) {
  const f = json?.features?.[0];
  if (!f) return null;
  const { score, postcode, label } = f.properties ?? {};
  if (!(score >= SCORE_MIN)) return null;
  if (codePostal && postcode && postcode !== codePostal) return null;
  const [lng, lat] = f.geometry?.coordinates ?? [];
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng, label };
}

/** Ne lève jamais : une adresse introuvable renvoie null. */
export async function geocoder({ line1, zip, city }, fetchImpl = fetch) {
  try {
    const params = new URLSearchParams({ q: `${line1} ${zip} ${city}`, limit: "1", index: "address" });
    const res = await fetchImpl(`${URL_SERVICE}?${params}`, { signal: AbortSignal.timeout(6000) });
    if (!res.ok) return null;
    return lireReponseGeocodage(await res.json(), zip);
  } catch {
    return null;
  }
}
```

```js title="lib/itineraires.js"
// Temps de trajet réels et tracés, via OpenRouteService (clé gratuite dans
// ORS_API_KEY). Sans clé ou en cas de panne, on retombe sur l'estimation à
// vol d'oiseau : les tournées restent calculables, juste moins précises.

import { matriceEstimee, tempsEstimeMin } from "./tournees/distances.js";

const ORS = "https://api.openrouteservice.org/v2";
// Offre gratuite : 3 500 cellules par matrice, 50 étapes par tracé.
const MAX_POINTS_MATRICE = 59;
const MAX_POINTS_TRACE = 50;

export function lireMatriceOrs(json, points) {
  return json.durations.map((ligne, i) =>
    ligne.map((s, j) => (Number.isFinite(s) ? s / 60 : tempsEstimeMin(points[i], points[j])))
  );
}

async function appelOrs(chemin, corps) {
  const res = await fetch(`${ORS}${chemin}`, {
    method: "POST",
    headers: { Authorization: process.env.ORS_API_KEY, "Content-Type": "application/json" },
    body: JSON.stringify(corps),
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) throw new Error(`OpenRouteService ${res.status}`);
  return res.json();
}

export async function matriceTemps(points) {
  if (process.env.ORS_API_KEY && points.length > 1 && points.length <= MAX_POINTS_MATRICE) {
    try {
      const json = await appelOrs("/matrix/driving-car", {
        locations: points.map((p) => [p.lng, p.lat]),
        metrics: ["duration"],
      });
      return { minutes: lireMatriceOrs(json, points), source: "ors" };
    } catch (e) {
      console.error("Matrice OpenRouteService indisponible, estimation utilisée :", e.message);
    }
  }
  return { minutes: matriceEstimee(points), source: "estimation" };
}

/** Tracé routier [lng, lat][], ou null (la carte reliera alors les arrêts en pointillés). */
export async function traceTournee(points) {
  if (!process.env.ORS_API_KEY || points.length < 2 || points.length > MAX_POINTS_TRACE) return null;
  try {
    const json = await appelOrs("/directions/driving-car/geojson", {
      coordinates: points.map((p) => [p.lng, p.lat]),
    });
    return json.features?.[0]?.geometry?.coordinates ?? null;
  } catch (e) {
    console.error("Tracé OpenRouteService indisponible :", e.message);
    return null;
  }
}
```

Dans `.env.example`, à la fin :

```
# Temps de trajet réels pour les tournées des livreurs (facultatif).
# Clé gratuite sur https://openrouteservice.org/dev/#/signup — sans elle, les
# temps sont estimés à vol d'oiseau et la carte relie les arrêts en pointillés.
ORS_API_KEY=
```

- [ ] **Step 4: vérifier** — `npm test` → PASS.
- [ ] **Step 5: commit** — `feat(tournees): geocodage IGN et temps de trajet OpenRouteService`

---

### Task 5: Liens de navigation et coordonnées du téléphone

**Files:**
- Create: `lib/tournees/navigation.js`, `lib/tournees/navigation.test.js`

**Interfaces:**
- Produces:
  - `lienGuidage(appli: "google" | "waze", {lat, lng}): string`
  - `liensTournee(points: {lat, lng}[]): {de: number, a: number, url: string}[]` — tronçons Google Maps de 10 arrêts max (numéros 1-based).
  - `departValide(lat, lng): {lat, lng} | null` — rejette ce qui n'est pas en Île-de-France.

- [ ] **Step 1: tests**

```js title="lib/tournees/navigation.test.js"
import { test } from "node:test";
import assert from "node:assert/strict";
import { lienGuidage, liensTournee, departValide } from "./navigation.js";

const p = (i) => ({ lat: 48.8 + i / 1000, lng: 2.3 + i / 1000 });

test("guidage vers un arrêt, Google Maps ou Waze", () => {
  assert.equal(
    lienGuidage("google", { lat: 48.85, lng: 2.35 }),
    "https://www.google.com/maps/dir/?api=1&destination=48.85%2C2.35&travelmode=driving"
  );
  assert.equal(lienGuidage("waze", { lat: 48.85, lng: 2.35 }), "https://waze.com/ul?ll=48.85%2C2.35&navigate=yes");
});

test("une petite tournée tient dans un seul lien, étapes dans l'ordre", () => {
  const liens = liensTournee([p(1), p(2), p(3)]);
  assert.equal(liens.length, 1);
  assert.deepEqual([liens[0].de, liens[0].a], [1, 3]);
  const url = new URL(liens[0].url);
  assert.equal(url.searchParams.get("destination"), "48.803,2.303");
  assert.equal(url.searchParams.get("waypoints"), "48.801,2.301|48.802,2.302");
});

test("au-delà de 10 arrêts, la tournée est découpée, sans en perdre", () => {
  const points = Array.from({ length: 23 }, (_, i) => p(i + 1));
  const liens = liensTournee(points);
  assert.deepEqual(liens.map((l) => [l.de, l.a]), [[1, 10], [11, 20], [21, 23]]);
  for (const l of liens) {
    const w = new URL(l.url).searchParams.get("waypoints");
    assert.equal(w ? w.split("|").length : 0, l.a - l.de);
  }
});

test("aucun arrêt, aucun lien", () => {
  assert.deepEqual(liensTournee([]), []);
});

test("position du téléphone : seulement si elle est plausible", () => {
  assert.deepEqual(departValide("48.85", "2.35"), { lat: 48.85, lng: 2.35 });
  assert.equal(departValide(0, 0), null);
  assert.equal(departValide("", ""), null);
  assert.equal(departValide("abc", "2.35"), null);
  assert.equal(departValide(45.76, 4.83), null); // Lyon
});
```

- [ ] **Step 2: vérifier l'échec** — `node --test lib/tournees/navigation.test.js` → FAIL.

- [ ] **Step 3: implémentation**

```js title="lib/tournees/navigation.js"
// Liens qui ouvrent le guidage vocal dans Google Maps ou Waze. Le guidage
// n'est pas refait dans le site : une page web perd la position GPS dès que
// l'écran se verrouille, les applications de navigation non.

// Google Maps accepte 9 étapes + la destination par lien.
const ARRETS_PAR_LIEN = 10;

const coord = ({ lat, lng }) => `${lat},${lng}`;

export function lienGuidage(appli, point) {
  if (appli === "waze") {
    return `https://waze.com/ul?${new URLSearchParams({ ll: coord(point), navigate: "yes" })}`;
  }
  return `https://www.google.com/maps/dir/?${new URLSearchParams({
    api: "1",
    destination: coord(point),
    travelmode: "driving",
  })}`;
}

/**
 * La tournée entière dans Google Maps, en tronçons. Sans point de départ :
 * Google part de la position actuelle du téléphone, ce qui est juste aussi
 * bien au premier tronçon qu'aux suivants.
 */
export function liensTournee(points) {
  const liens = [];
  for (let i = 0; i < points.length; i += ARRETS_PAR_LIEN) {
    const troncon = points.slice(i, i + ARRETS_PAR_LIEN);
    const params = new URLSearchParams({
      api: "1",
      destination: coord(troncon[troncon.length - 1]),
      travelmode: "driving",
    });
    if (troncon.length > 1) params.set("waypoints", troncon.slice(0, -1).map(coord).join("|"));
    liens.push({ de: i + 1, a: i + troncon.length, url: `https://www.google.com/maps/dir/?${params}` });
  }
  return liens;
}

// Île-de-France, large. Une position hors de ce cadre est une erreur du
// téléphone (ou un formulaire trafiqué) : on part alors de l'entrepôt.
const CADRE = { latMin: 48.1, latMax: 49.3, lngMin: 1.4, lngMax: 3.6 };

export function departValide(lat, lng) {
  if (lat === "" || lng === "" || lat == null || lng == null) return null;
  const la = Number(lat);
  const lo = Number(lng);
  if (!Number.isFinite(la) || !Number.isFinite(lo)) return null;
  if (la < CADRE.latMin || la > CADRE.latMax || lo < CADRE.lngMin || lo > CADRE.lngMax) return null;
  return { lat: la, lng: lo };
}
```

- [ ] **Step 4: vérifier** — `npm test` → PASS.
- [ ] **Step 5: commit** — `feat(tournees): liens Google Maps et Waze, position du telephone`

---

### Task 6: Base de données et droit de planifier

**Files:**
- Modify: `prisma/schema.prisma`, `lib/roles.js`, `lib/roles.test.js`
- Create: migration `prisma/migrations/<horodatage>_tournees/`

**Interfaces:**
- Produces : modèle `Tour {id, date, driverId, status "PLANNED"|"STARTED", startedAt?, conduiteMin?, trace? (JSON [lng,lat][]), createdAt, deliveries}` avec `@@unique([date, driverId])` (clé composée `date_driverId`) ; `Delivery.tourId?`, `Delivery.ordre?`, `Delivery.heurePrevue?` (minutes) ; `Address.lat?`, `Address.lng?` ; `User.tours` ; permission `planifierTournees: ["ADMIN"]`.

- [ ] **Step 1: test du droit** — dans `lib/roles.test.js` :

```js
test("seul l'administrateur répartit les tournées", () => {
  assert.equal(can("ADMIN", "planifierTournees"), true);
  assert.equal(can("MAGASINIER", "planifierTournees"), false);
  assert.equal(can("LIVREUR", "planifierTournees"), false);
});
```

- [ ] **Step 2: vérifier l'échec** — `node --test lib/roles.test.js` → FAIL.

- [ ] **Step 3: implémentation** — dans `lib/roles.js`, section Terrain, ajouter `planifierTournees: ["ADMIN"], // répartir les interventions entre livreurs`. Dans `prisma/schema.prisma` :

```prisma
// dans model Address, après accessCode
  // Coordonnées GPS, remplies par le géocodage (lib/geocodage.js). Nulles
  // tant qu'il n'a pas réussi : l'adresse n'entre alors dans aucune tournée.
  lat        Float?
  lng        Float?

// dans model User, après events
  tours  Tour[]

// dans model Delivery, après bookingId
  // Tournée du livreur qui fera l'intervention, et sa place dans l'ordre.
  tour        Tour?   @relation(fields: [tourId], references: [id], onDelete: SetNull)
  tourId      String?
  ordre       Int?
  heurePrevue Int? // minutes depuis minuit, heure de Paris : 750 = 12 h 30

  @@index([date])

// nouveau modèle, après Delivery
// La tournée d'un livreur pour un jour. Une seule par livreur et par jour.
model Tour {
  id          String     @id @default(cuid())
  date        DateTime // le jour, à minuit UTC comme Delivery.date
  driver      User       @relation(fields: [driverId], references: [id], onDelete: Cascade)
  driverId    String
  // PLANNED : l'admin peut la recalculer. STARTED : le livreur est parti,
  // plus personne d'autre que lui n'y touche.
  status      String     @default("PLANNED")
  startedAt   DateTime?
  conduiteMin Int?
  trace       String? // tracé routier en JSON [[lng, lat], …], null sans OpenRouteService
  createdAt   DateTime   @default(now())
  deliveries  Delivery[]

  @@unique([date, driverId])
}
```

Puis `npx prisma migrate dev --name tournees`.

- [ ] **Step 4: vérifier** — `npm test` → PASS ; `npx prisma migrate status` → à jour.
- [ ] **Step 5: commit** — `feat(tournees): tournees en base et droit de planifier`

---

### Task 7: Planification côté serveur

**Files:**
- Create: `lib/tournees/planification.js`

Module serveur (Prisma, réseau) : pas de test unitaire, toute la logique testable vit dans les tâches 2 à 5. Vérifié en recette (tâche 10).

**Interfaces:**
- Consumes : `resoudre`, `ordreConserveSiIncomplet` (T3) ; `versArrets`, `interventionPlanifiable` (T2) ; `geocoder` (T4) ; `matriceTemps`, `traceTournee` (T4) ; `ENTREPOT`, `CAPACITE_VEHICULE`, `DEBUT_JOURNEE_MIN`, `FIN_JOURNEE_MIN` (T1) ; `nowInParis`, `minuteInParis`, `toDay`.
- Produces :
  - `DETAILS_INTERVENTION` (objet `include` Prisma)
  - `interventionsDuJour(day: string): Promise<Delivery[]>`
  - `geocoderAdresseParId(addressId): Promise<void>`
  - `planifierJour(day, driverIds: string[]): Promise<{ placees: number, nonPlacees: number }>` — lève `ErreurTournee` (message pour l'admin).
  - `reordonnerTournee(tourId, { depart }?: { depart?: {lat,lng} | null }): Promise<void>`
  - `reattribuer(deliveryId, driverId): Promise<string | null>` (message d'erreur ou null)
  - `class ErreurTournee extends Error`

- [ ] **Step 1: implémentation**

```js title="lib/tournees/planification.js"
// Relie le solveur à la base : charger les interventions du jour, géocoder,
// calculer, enregistrer. Les appels réseau (géocodage, temps de trajet) se
// font toujours AVANT la transaction : une transaction ne doit jamais
// attendre un service extérieur.

import { prisma } from "../prisma.js";
import { toDay, nowInParis, minuteInParis } from "../dates.js";
import { geocoder } from "../geocodage.js";
import { matriceTemps, traceTournee } from "../itineraires.js";
import { ENTREPOT, CAPACITE_VEHICULE, DEBUT_JOURNEE_MIN, FIN_JOURNEE_MIN } from "./config.js";
import { versArrets, interventionPlanifiable } from "./arrets.js";
import { resoudre, ordreConserveSiIncomplet } from "./solveur.js";

export class ErreurTournee extends Error {}

export const DETAILS_INTERVENTION = {
  booking: { include: { customer: true, address: true, product: true, unit: true, kit: true } },
};

export async function interventionsDuJour(day) {
  const deliveries = await prisma.delivery.findMany({
    where: { date: new Date(day), status: "SCHEDULED" },
    include: { ...DETAILS_INTERVENTION, tour: true },
  });
  return deliveries.filter((d) => interventionPlanifiable(d, d.booking.status));
}

// Remplit les coordonnées manquantes, en base et sur les objets chargés.
async function geocoderAdresses(deliveries) {
  const faites = new Map();
  for (const d of deliveries) {
    const a = d.booking.address;
    if (a.lat != null && a.lng != null) continue;
    if (!faites.has(a.id)) {
      const r = await geocoder(a);
      if (r) await prisma.address.update({ where: { id: a.id }, data: { lat: r.lat, lng: r.lng } });
      faites.set(a.id, r);
    }
    const r = faites.get(a.id);
    if (r) Object.assign(a, { lat: r.lat, lng: r.lng });
  }
}

/** À la réservation, sans jamais la ralentir ni la faire échouer. */
export async function geocoderAdresseParId(addressId) {
  try {
    const a = await prisma.address.findUnique({ where: { id: addressId } });
    if (!a || a.lat != null) return;
    const r = await geocoder(a);
    if (r) await prisma.address.update({ where: { id: a.id }, data: { lat: r.lat, lng: r.lng } });
  } catch (e) {
    console.error("Géocodage à la réservation impossible :", e.message);
  }
}

// Aujourd'hui, on ne planifie pas dans le passé.
function debutPour(day) {
  return day === nowInParis().day ? Math.max(DEBUT_JOURNEE_MIN, minuteInParis()) : DEBUT_JOURNEE_MIN;
}

const aDesCoordonnees = (d) => d.booking.address.lat != null && d.booking.address.lng != null;

// Prépare la matrice et lance le solveur. departs[i] : position de départ du
// véhicule i, ou null pour l'entrepôt.
async function calculer(deliveries, vehiculesBase, departs = []) {
  const points = [ENTREPOT];
  const vehicules = vehiculesBase.map((v, i) => {
    let depart = 0;
    if (departs[i]) {
      depart = points.length;
      points.push(departs[i]);
    }
    return { ...v, depart, arrivee: 0 };
  });
  const items = deliveries.map((d) => {
    const lieu = points.length;
    points.push({ lat: d.booking.address.lat, lng: d.booking.address.lng });
    return { id: d.id, type: d.type, bookingId: d.bookingId, timeSlot: d.timeSlot, floor: d.booking.address.floor, lieu };
  });
  const { minutes } = await matriceTemps(points);
  const resultat = resoudre({ arrets: versArrets(items), vehicules, temps: minutes });
  const pointDe = new Map(items.map((i) => [i.id, points[i.lieu]]));
  return { resultat, pointDe, points, vehicules };
}

export async function planifierJour(day, driverIds) {
  const date = new Date(day);
  const tours = await prisma.tour.findMany({ where: { date } });
  const commencees = tours.filter((t) => t.status === "STARTED");
  const idsCommencees = new Set(commencees.map((t) => t.id));
  const occupes = new Set(commencees.map((t) => t.driverId));
  const libres = driverIds.filter((id) => !occupes.has(id));

  const aPlacer = (await interventionsDuJour(day)).filter((d) => !idsCommencees.has(d.tourId));
  await geocoderAdresses(aPlacer);
  const localisees = aPlacer.filter(aDesCoordonnees);

  const debut = debutPour(day);
  const { resultat, pointDe } = await calculer(
    localisees,
    libres.map((id) => ({ id, debut, fin: FIN_JOURNEE_MIN, capacite: CAPACITE_VEHICULE }))
  );
  const traces = await Promise.all(
    resultat.tournees.map((t) =>
      t.arrets.length ? traceTournee([ENTREPOT, ...t.arrets.map((a) => pointDe.get(a.id)), ENTREPOT]) : null
    )
  );

  await prisma.$transaction(
    async (tx) => {
      // Un livreur a pu partir pendant le calcul : on ne touche pas à sa tournée.
      const parties = await tx.tour.count({ where: { date, status: "STARTED", driverId: { in: libres } } });
      if (parties) throw new ErreurTournee("Un livreur vient de commencer sa tournée. Relancez le calcul.");
      const anciennes = (await tx.tour.findMany({ where: { date, status: "PLANNED" }, select: { id: true } })).map((t) => t.id);
      await tx.delivery.updateMany({
        where: { tourId: { in: anciennes } },
        data: { tourId: null, ordre: null, heurePrevue: null },
      });
      await tx.tour.deleteMany({ where: { id: { in: anciennes } } });
      for (const [i, t] of resultat.tournees.entries()) {
        if (!t.arrets.length) continue;
        const tour = await tx.tour.create({
          data: {
            date,
            driverId: t.vehicule,
            conduiteMin: t.conduite,
            trace: traces[i] ? JSON.stringify(traces[i]) : null,
          },
        });
        for (const [k, a] of t.arrets.entries()) {
          await tx.delivery.update({
            where: { id: a.id },
            data: { tourId: tour.id, ordre: k + 1, heurePrevue: a.debut },
          });
        }
      }
    },
    { isolationLevel: "Serializable", timeout: 20000 }
  );

  const placees = resultat.tournees.reduce((s, t) => s + t.arrets.length, 0);
  return { placees, nonPlacees: aPlacer.length - placees };
}

/**
 * Réordonne les arrêts restants d'une tournée, depuis l'entrepôt ou depuis
 * la position du livreur. Aucun arrêt n'en sort jamais.
 */
export async function reordonnerTournee(tourId, { depart = null } = {}) {
  const tour = await prisma.tour.findUnique({
    where: { id: tourId },
    include: { deliveries: { include: DETAILS_INTERVENTION, orderBy: [{ ordre: "asc" }, { timeSlot: "asc" }] } },
  });
  if (!tour) return;
  if (!tour.deliveries.length) {
    if (tour.status === "PLANNED") await prisma.tour.delete({ where: { id: tourId } });
    return;
  }
  const faites = tour.deliveries.filter((d) => d.status !== "SCHEDULED");
  const restantes = tour.deliveries.filter((d) => d.status === "SCHEDULED");
  await geocoderAdresses(restantes);
  const localisees = restantes.filter(aDesCoordonnees);
  const sansCoord = restantes.filter((d) => !aDesCoordonnees(d));

  const { resultat, pointDe, points, vehicules } = await calculer(
    localisees,
    [{ id: tour.driverId, debut: debutPour(toDay(tour.date)), fin: FIN_JOURNEE_MIN, capacite: CAPACITE_VEHICULE }],
    [depart]
  );
  const ids = ordreConserveSiIncomplet(resultat, localisees.map((d) => d.id));
  const heures = resultat.nonCases.length ? new Map() : new Map(resultat.tournees[0].arrets.map((a) => [a.id, a.debut]));
  const ordre = [...ids, ...sansCoord.map((d) => d.id)];
  const trace = ids.length
    ? await traceTournee([points[vehicules[0].depart], ...ids.map((id) => pointDe.get(id)), ENTREPOT])
    : null;

  await prisma.$transaction(async (tx) => {
    for (const [k, id] of ordre.entries()) {
      await tx.delivery.update({
        where: { id },
        data: { ordre: faites.length + k + 1, ...(heures.has(id) ? { heurePrevue: heures.get(id) } : {}) },
      });
    }
    await tx.tour.update({
      where: { id: tourId },
      data: {
        trace: trace ? JSON.stringify(trace) : null,
        ...(resultat.nonCases.length ? {} : { conduiteMin: resultat.tournees[0].conduite }),
      },
    });
  });
}

/** Donne une intervention à un autre livreur, puis réordonne les deux tournées. */
export async function reattribuer(deliveryId, driverId) {
  const d = await prisma.delivery.findUnique({ where: { id: deliveryId } });
  if (!d || d.status !== "SCHEDULED") return "Cette intervention n'est plus à faire.";
  const ancienne = d.tourId;
  const cible = await prisma.tour.upsert({
    where: { date_driverId: { date: d.date, driverId } },
    update: {},
    create: { date: d.date, driverId },
  });
  if (cible.id === ancienne) return null;
  await prisma.delivery.update({ where: { id: deliveryId }, data: { tourId: cible.id, ordre: null, heurePrevue: null } });
  await reordonnerTournee(cible.id);
  if (ancienne) await reordonnerTournee(ancienne);
  return null;
}
```

- [ ] **Step 2: vérifier** — `node -e "import('./lib/tournees/planification.js').then(m => console.log(Object.keys(m)))"` liste les exports sans erreur ; `npm test` → PASS.
- [ ] **Step 3: commit** — `feat(tournees): planification en base (calcul, recalcul, reattribution)`

---

### Task 8: Page des tournées — vue admin et carte

**Files:**
- Create: `app/admin/tournees/page.js`, `app/admin/tournees/actions.js`, `app/admin/tournees/VueAdmin.js`, `app/admin/tournees/CarteTournees.js`, `app/admin/tournees/donnees.js`
- Modify: `app/admin/AdminHeader.js` (lien « Tournées »), `app/globals.css`, `package.json` (`maplibre-gl`)

**Interfaces:**
- Consumes : T7 (`planifierJour`, `reattribuer`, `reordonnerTournee`, `interventionsDuJour`, `DETAILS_INTERVENTION`, `ErreurTournee`), T5 (`departValide`), T2 (`heureTexte`), `requireCan`, `can`, `markDelivery`.
- Produces : actions `calculerTournees`, `deplacerArret`, `commencerTournee`, `marquerArret` ; composant `CarteTournees({ tournees: {couleur, trace, points: {lat, lng, numero, label, fait}[]}[], entrepot })` ; `donnees.js` : `jourDemande(param): string`, `pointsDeTournee(deliveries): points`, `libelleArret(d): string`, `adresseTexte(address): string`.

- [ ] **Step 1:** `npm install maplibre-gl@^5`
- [ ] **Step 2: fichiers** (code complet ci-dessous)

```js title="app/admin/tournees/donnees.js"
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
```

```js title="app/admin/tournees/CarteTournees.js"
"use client";

import { useEffect, useRef } from "react";
import "maplibre-gl/dist/maplibre-gl.css";

// Carte des tournées : un trait et des pastilles numérotées par livreur.
// Fond OpenFreeMap (OpenStreetMap), gratuit et sans clé.
const STYLE = "https://tiles.openfreemap.org/styles/liberty";

function pastille(texte, couleur, fait) {
  const el = document.createElement("div");
  el.className = `carte-pastille${fait ? " fait" : ""}`;
  el.style.background = fait ? "#9aa5b8" : couleur;
  el.textContent = texte;
  return el;
}

export default function CarteTournees({ tournees, entrepot }) {
  const conteneur = useRef(null);
  const cle = JSON.stringify({ tournees, entrepot });

  useEffect(() => {
    let carte = null;
    let annule = false;
    import("maplibre-gl").then(({ default: maplibregl }) => {
      if (annule || !conteneur.current) return;
      carte = new maplibregl.Map({
        container: conteneur.current,
        style: STYLE,
        center: [entrepot.lng, entrepot.lat],
        zoom: 12,
        attributionControl: { compact: true },
      });
      carte.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");

      const limites = new maplibregl.LngLatBounds([entrepot.lng, entrepot.lat], [entrepot.lng, entrepot.lat]);
      new maplibregl.Marker({ element: pastille("⌂", "#05122e", false) })
        .setLngLat([entrepot.lng, entrepot.lat])
        .setPopup(new maplibregl.Popup({ offset: 14 }).setText(entrepot.nom))
        .addTo(carte);

      for (const t of tournees) {
        for (const p of t.points) {
          limites.extend([p.lng, p.lat]);
          new maplibregl.Marker({ element: pastille(String(p.numero), t.couleur, p.fait) })
            .setLngLat([p.lng, p.lat])
            // setText et non setHTML : le nom du client vient d'un formulaire.
            .setPopup(new maplibregl.Popup({ offset: 14 }).setText(p.label))
            .addTo(carte);
        }
      }

      carte.on("load", () => {
        tournees.forEach((t, i) => {
          const depot = [entrepot.lng, entrepot.lat];
          const ligne = t.trace ?? [depot, ...t.points.map((p) => [p.lng, p.lat]), depot];
          carte.addSource(`tournee-${i}`, {
            type: "geojson",
            data: { type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: ligne } },
          });
          carte.addLayer({
            id: `tournee-${i}`,
            type: "line",
            source: `tournee-${i}`,
            layout: { "line-join": "round", "line-cap": "round" },
            paint: {
              "line-color": t.couleur,
              "line-width": 4,
              "line-opacity": 0.8,
              // Sans tracé routier, des pointillés disent « à vol d'oiseau ».
              ...(t.trace ? {} : { "line-dasharray": [1.5, 1.5] }),
            },
          });
        });
      });
      carte.fitBounds(limites, { padding: 48, maxZoom: 15, duration: 0 });
    });
    return () => {
      annule = true;
      carte?.remove();
    };
    // cle résume tournees + entrepot : on ne recrée la carte que s'ils changent.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cle]);

  return <div ref={conteneur} className="carte-tournees" role="region" aria-label="Carte des tournées" />;
}
```

```js title="app/admin/tournees/actions.js"
"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "../../../lib/prisma";
import { can } from "../../../lib/roles";
import { departValide } from "../../../lib/tournees/navigation";
import { planifierJour, reattribuer, reordonnerTournee, ErreurTournee } from "../../../lib/tournees/planification";
import { requireCan } from "../auth";
import { markDelivery } from "../actions";
import { jourDemande } from "./donnees";

function retour(day, { erreur, info } = {}) {
  revalidatePath("/admin/tournees");
  const p = new URLSearchParams({ jour: day });
  if (erreur) p.set("erreur", erreur);
  if (info) p.set("info", info);
  redirect(`/admin/tournees?${p}`);
}

export async function calculerTournees(formData) {
  await requireCan("planifierTournees");
  const day = jourDemande(String(formData.get("jour") ?? ""));
  const demandes = formData.getAll("livreurs").map(String);
  // Seuls de vrais comptes livreurs actifs : un identifiant trafiqué ne crée pas de tournée.
  const livreurs = await prisma.user.findMany({
    where: { id: { in: demandes }, role: "LIVREUR", active: true },
    select: { id: true },
    orderBy: { name: "asc" },
  });
  if (!livreurs.length) return retour(day, { erreur: "Cochez au moins un livreur." });
  let bilan;
  try {
    bilan = await planifierJour(day, livreurs.map((l) => l.id));
  } catch (e) {
    if (e instanceof ErreurTournee) return retour(day, { erreur: e.message });
    if (e.code === "P2034") return retour(day, { erreur: "Quelqu'un modifiait les tournées en même temps. Relancez le calcul." });
    throw e;
  }
  const info = bilan.nonPlacees
    ? `${bilan.placees} arrêt(s) répartis, ${bilan.nonPlacees} non placé(s) : voir la liste en rouge.`
    : `${bilan.placees} arrêt(s) répartis.`;
  retour(day, { info });
}

export async function deplacerArret(formData) {
  await requireCan("planifierTournees");
  const day = jourDemande(String(formData.get("jour") ?? ""));
  const driverId = String(formData.get("livreur") ?? "");
  const livreur = await prisma.user.findFirst({ where: { id: driverId, role: "LIVREUR", active: true } });
  if (!livreur) return retour(day, { erreur: "Livreur introuvable." });
  const erreur = await reattribuer(String(formData.get("id") ?? ""), livreur.id);
  retour(day, erreur ? { erreur } : { info: `Arrêt confié à ${livreur.name}.` });
}

export async function commencerTournee(formData) {
  const user = await requireCan("voirTournees");
  const tour = await prisma.tour.findUnique({ where: { id: String(formData.get("id") ?? "") } });
  if (!tour || tour.driverId !== user.id) {
    return retour(jourDemande(""), { erreur: "Cette tournée n'est pas la vôtre." });
  }
  const day = tour.date.toISOString().slice(0, 10);
  if (tour.status !== "STARTED") {
    await prisma.tour.update({ where: { id: tour.id }, data: { status: "STARTED", startedAt: new Date() } });
  }
  const depart = departValide(formData.get("lat"), formData.get("lng"));
  await reordonnerTournee(tour.id, { depart });
  retour(day, { info: depart ? "C'est parti ! Ordre recalculé depuis votre position." : "C'est parti !" });
}

export async function marquerArret(formData) {
  const user = await requireCan("livrer");
  const d = await prisma.delivery.findUnique({
    where: { id: String(formData.get("id") ?? "") },
    include: { tour: true },
  });
  if (!can(user.role, "planifierTournees") && d?.tour?.driverId !== user.id) {
    return retour(jourDemande(""), { erreur: "Cet arrêt n'est pas dans votre tournée." });
  }
  formData.set("retour", "/admin/tournees");
  return markDelivery(formData);
}
```

```js title="app/admin/tournees/page.js"
import { requireCan } from "../auth";
import { can } from "../../../lib/roles";
import AdminHeader from "../AdminHeader";
import VueAdmin from "./VueAdmin";
import VueLivreur from "./VueLivreur";
import { jourDemande } from "./donnees";

export const dynamic = "force-dynamic";
export const metadata = { title: "Tournées — LOOTACLIM" };

// Une seule adresse pour tout le monde : l'admin y répartit, le livreur y
// déroule sa tournée. C'est là que la connexion envoie un livreur.
export default async function Tournees({ searchParams }) {
  const user = await requireCan("voirTournees");
  const day = jourDemande(searchParams.jour);
  return (
    <div className="stack">
      <AdminHeader />
      {searchParams.erreur && <p className="form-error" role="alert">{searchParams.erreur}</p>}
      {searchParams.info && <p className="form-info" role="status">{searchParams.info}</p>}
      {can(user.role, "planifierTournees") ? <VueAdmin day={day} /> : <VueLivreur user={user} day={day} />}
    </div>
  );
}
```

```js title="app/admin/tournees/VueAdmin.js"
import { prisma } from "../../../lib/prisma";
import { addDays, nowInParis } from "../../../lib/dates";
import { ENTREPOT, COULEURS_TOURNEES } from "../../../lib/tournees/config";
import { heureTexte } from "../../../lib/tournees/arrets";
import { interventionsDuJour, DETAILS_INTERVENTION } from "../../../lib/tournees/planification";
import CarteTournees from "./CarteTournees";
import { calculerTournees, deplacerArret } from "./actions";
import { adresseTexte, pointsDeTournee, dateLongue } from "./donnees";

const STATUT_TOURNEE = { PLANNED: "Prévue", STARTED: "En cours" };

export default async function VueAdmin({ day }) {
  const [livreurs, tours, aFaire] = await Promise.all([
    prisma.user.findMany({ where: { role: "LIVREUR", active: true }, orderBy: { name: "asc" } }),
    prisma.tour.findMany({
      where: { date: new Date(day) },
      include: { driver: true, deliveries: { include: DETAILS_INTERVENTION, orderBy: { ordre: "asc" } } },
      orderBy: { createdAt: "asc" },
    }),
    interventionsDuJour(day),
  ]);
  const nonPlacees = aFaire.filter((d) => !d.tourId);
  const avecTournee = new Set(tours.map((t) => t.driverId));
  const cocheParDefaut = (id) => (tours.length ? avecTournee.has(id) : true);
  const aujourdhui = nowInParis().day;
  const couleur = (i) => COULEURS_TOURNEES[i % COULEURS_TOURNEES.length];

  return (
    <>
      <div>
        <span className="eyebrow">Back-office</span>
        <h1 className="section-title">Tournées du {dateLongue(day)}</h1>
        <div className="tournees-jours">
          <a href={`/admin/tournees?jour=${aujourdhui}`}>Aujourd&apos;hui</a>
          <a href={`/admin/tournees?jour=${addDays(aujourdhui, 1)}`}>Demain</a>
          <form method="get" className="actions-cell">
            <input type="date" name="jour" defaultValue={day} aria-label="Autre jour" />
            <button type="submit" className="btn-small">Voir</button>
          </form>
        </div>
      </div>

      <form action={calculerTournees} className="card stack-sm">
        <input type="hidden" name="jour" value={day} />
        <h2>Qui travaille ce jour-là ?</h2>
        {livreurs.length ? (
          <div className="tournees-livreurs">
            {livreurs.map((l) => (
              <label key={l.id} className="case">
                <input type="checkbox" name="livreurs" value={l.id} defaultChecked={cocheParDefaut(l.id)} /> {l.name}
              </label>
            ))}
          </div>
        ) : (
          <p className="muted">
            Aucun compte livreur. Créez-en avec <code>node prisma/creer-compte.js</code>, ou lancez les données
            de test : <code>npm run db:demo-tournees</code>.
          </p>
        )}
        <p className="muted">
          {aFaire.length} intervention(s) à faire ce jour-là. Les tournées déjà commencées ne sont pas modifiées.
        </p>
        <div>
          <button type="submit" className="btn btn-primary" disabled={!livreurs.length}>
            Calculer les tournées
          </button>
        </div>
      </form>

      {nonPlacees.length > 0 && (
        <div className="card tournees-alerte">
          <h2>Non placées ({nonPlacees.length})</h2>
          <ul>
            {nonPlacees.map((d) => (
              <li key={d.id}>
                <strong>{d.booking.reference}</strong> · {d.type === "PICKUP" ? "Reprise" : "Livraison"} {d.timeSlot} ·{" "}
                {adresseTexte(d.booking.address)} —{" "}
                {d.booking.address.lat == null
                  ? "adresse introuvable, à corriger dans la réservation"
                  : tours.length
                    ? "impossible à caser : créneau intenable ou véhicules pleins"
                    : "pas encore réparties"}
                {livreurs.length > 0 && <MenuDonner d={d} day={day} livreurs={livreurs} />}
              </li>
            ))}
          </ul>
        </div>
      )}

      {tours.length > 0 && (
        <>
          <CarteTournees
            entrepot={ENTREPOT}
            tournees={tours.map((t, i) => ({
              couleur: couleur(i),
              trace: t.trace ? JSON.parse(t.trace) : null,
              points: pointsDeTournee(t.deliveries),
            }))}
          />
          <div className="tournees-colonnes">
            {tours.map((t, i) => (
              <section key={t.id} className="card tournee-colonne" style={{ borderTopColor: couleur(i) }}>
                <h2>{t.driver.name}</h2>
                <p className="muted">
                  {STATUT_TOURNEE[t.status]} · {t.deliveries.length} arrêt(s)
                  {t.conduiteMin != null && ` · ${t.conduiteMin} min de conduite`} ·{" "}
                  {t.deliveries.filter((d) => d.type === "DROPOFF").length} machine(s) à charger
                </p>
                <ol className="tournee-arrets">
                  {t.deliveries.map((d) => (
                    <li key={d.id} className={d.status !== "SCHEDULED" ? "fait" : ""}>
                      <span className="tournee-heure">{d.heurePrevue != null ? heureTexte(d.heurePrevue) : "—"}</span>
                      <span>
                        <strong>{d.type === "PICKUP" ? "Reprise" : "Livraison"}</strong> ({d.timeSlot}) ·{" "}
                        {d.booking.customer.firstName} {d.booking.customer.lastName}
                        <br />
                        <span className="muted">{adresseTexte(d.booking.address)}</span>
                      </span>
                      {d.status === "SCHEDULED" && <MenuDonner d={d} day={day} livreurs={livreurs.filter((l) => l.id !== t.driverId)} />}
                    </li>
                  ))}
                </ol>
              </section>
            ))}
          </div>
        </>
      )}
    </>
  );
}

function MenuDonner({ d, day, livreurs }) {
  if (!livreurs.length) return null;
  return (
    <form action={deplacerArret} className="actions-cell tournee-donner">
      <input type="hidden" name="id" value={d.id} />
      <input type="hidden" name="jour" value={day} />
      <select name="livreur" required defaultValue="" aria-label="Donner à">
        <option value="" disabled>Donner à…</option>
        {livreurs.map((l) => (
          <option key={l.id} value={l.id}>{l.name}</option>
        ))}
      </select>
      <button type="submit" className="btn-small">OK</button>
    </form>
  );
}
```

`app/admin/AdminHeader.js` : ajouter `<Link href="/admin/tournees">Tournées</Link>` après « Tableau de bord ».

CSS à ajouter à la fin de `app/globals.css` :

```css
/* ---- Tournées des livreurs ---- */
.form-info { background: #e8f5ec; color: #14532d; border-radius: 10px; padding: 10px 14px; font-size: 14px; }
.stack-sm { display: flex; flex-direction: column; gap: 12px; }
.tournees-jours { display: flex; flex-wrap: wrap; gap: 14px; align-items: center; font-size: 14px; margin-top: 6px; }
.tournees-jours a { color: var(--deep); font-weight: 600; }
.tournees-livreurs { display: flex; flex-wrap: wrap; gap: 10px 22px; }
.case { display: inline-flex; gap: 8px; align-items: center; font-size: 15px; cursor: pointer; }
.tournees-alerte { border: 2px solid var(--sun); }
.tournees-alerte ul { padding-left: 18px; display: flex; flex-direction: column; gap: 8px; font-size: 14px; }
.carte-tournees { width: 100%; height: 520px; border-radius: 16px; overflow: hidden; background: var(--ice); }
.carte-pastille { width: 26px; height: 26px; border-radius: 50%; color: #fff; font: 700 12px/26px "Inter", sans-serif; text-align: center; border: 2px solid #fff; box-shadow: 0 1px 4px rgba(5, 18, 46, .35); cursor: pointer; }
.carte-pastille.fait { opacity: .75; }
.tournees-colonnes { display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 16px; }
.tournee-colonne { border-top: 6px solid var(--cool); }
.tournee-arrets { list-style: none; display: flex; flex-direction: column; gap: 10px; margin-top: 12px; font-size: 14px; }
.tournee-arrets li { display: grid; grid-template-columns: 52px 1fr; gap: 4px 10px; padding-bottom: 10px; border-bottom: 1px solid var(--ice); }
.tournee-arrets li.fait { opacity: .5; }
.tournee-heure { font-weight: 700; color: var(--deep); }
.tournee-donner { grid-column: 2; }
@media (max-width: 700px) {
  .carte-tournees { height: 340px; }
}
```

- [ ] **Step 3: vérifier** — `npm test` → PASS ; `npm run build` (serveur dev arrêté, voir pièges) → compilation OK.
- [ ] **Step 4: commit** — `feat(tournees): page admin, carte MapLibre et actions`

---

### Task 9: Vue livreur

**Files:**
- Create: `app/admin/tournees/VueLivreur.js`, `app/admin/tournees/Guidage.js`, `app/admin/tournees/CommencerTournee.js`
- Modify: `app/globals.css`

**Interfaces:**
- Consumes : `commencerTournee`, `marquerArret` (T8), `lienGuidage`, `liensTournee` (T5), `CarteTournees`, `donnees.js` (T8), `DETAILS_INTERVENTION` (T7), `FLOOR_LABELS`.
- Produces : `ChoixAppli()`, `LienGuidage({ point, children, className })` (client, préférence en `localStorage` clé `lc-appli-gps`) ; `CommencerTournee({ tourId })` (client).

- [ ] **Step 1: fichiers**

```js title="app/admin/tournees/Guidage.js"
"use client";

import { useEffect, useState } from "react";
import { lienGuidage } from "../../../lib/tournees/navigation";

// Le livreur choisit une fois son application de guidage ; son téléphone
// s'en souvient. Préférence de confort : si le stockage est indisponible,
// on retombe sur Google Maps sans rien casser.
const CLE = "lc-appli-gps";
const EVENEMENT = "lc-appli-gps";

function lire() {
  try {
    return localStorage.getItem(CLE) === "waze" ? "waze" : "google";
  } catch {
    return "google";
  }
}

function useAppli() {
  const [appli, setAppli] = useState("google");
  useEffect(() => {
    setAppli(lire());
    const maj = () => setAppli(lire());
    window.addEventListener(EVENEMENT, maj);
    return () => window.removeEventListener(EVENEMENT, maj);
  }, []);
  return appli;
}

export function ChoixAppli() {
  const appli = useAppli();
  const choisir = (valeur) => {
    try {
      localStorage.setItem(CLE, valeur);
    } catch {}
    window.dispatchEvent(new Event(EVENEMENT));
  };
  return (
    <div className="choix-appli" role="radiogroup" aria-label="Application de guidage">
      <span className="muted">Guidage :</span>
      {[
        ["google", "Google Maps"],
        ["waze", "Waze"],
      ].map(([valeur, nom]) => (
        <button
          key={valeur}
          type="button"
          role="radio"
          aria-checked={appli === valeur}
          className={appli === valeur ? "actif" : ""}
          onClick={() => choisir(valeur)}
        >
          {nom}
        </button>
      ))}
    </div>
  );
}

export function LienGuidage({ point, className, children }) {
  const appli = useAppli();
  return (
    <a href={lienGuidage(appli, point)} target="_blank" rel="noopener noreferrer" className={className}>
      {children}
    </a>
  );
}
```

```js title="app/admin/tournees/CommencerTournee.js"
"use client";

import { useRef, useState } from "react";
import { commencerTournee } from "./actions";

// Au départ, on demande la position du téléphone pour ordonner les arrêts
// depuis là où le livreur est vraiment. Refus ou lenteur : on part de
// l'entrepôt, sans bloquer.
export default function CommencerTournee({ tourId }) {
  const form = useRef(null);
  const [enCours, setEnCours] = useState(false);

  function envoyer(position) {
    if (position) {
      form.current.lat.value = position.coords.latitude;
      form.current.lng.value = position.coords.longitude;
    }
    form.current.requestSubmit();
  }

  function demarrer() {
    setEnCours(true);
    if (!navigator.geolocation) return envoyer(null);
    navigator.geolocation.getCurrentPosition(envoyer, () => envoyer(null), {
      enableHighAccuracy: true,
      timeout: 8000,
      maximumAge: 60000,
    });
  }

  return (
    <form ref={form} action={commencerTournee}>
      <input type="hidden" name="id" value={tourId} />
      <input type="hidden" name="lat" defaultValue="" />
      <input type="hidden" name="lng" defaultValue="" />
      <button type="button" className="btn btn-primary btn-large" onClick={demarrer} disabled={enCours}>
        {enCours ? "Calcul de votre trajet…" : "Commencer ma tournée"}
      </button>
    </form>
  );
}
```

```js title="app/admin/tournees/VueLivreur.js"
import { prisma } from "../../../lib/prisma";
import { addDays, nowInParis } from "../../../lib/dates";
import { FLOOR_LABELS } from "../../../lib/constants";
import { ENTREPOT, COULEURS_TOURNEES } from "../../../lib/tournees/config";
import { heureTexte } from "../../../lib/tournees/arrets";
import { liensTournee } from "../../../lib/tournees/navigation";
import { DETAILS_INTERVENTION } from "../../../lib/tournees/planification";
import CarteTournees from "./CarteTournees";
import CommencerTournee from "./CommencerTournee";
import { ChoixAppli, LienGuidage } from "./Guidage";
import { marquerArret } from "./actions";
import { adresseTexte, pointsDeTournee, dateLongue } from "./donnees";

export default async function VueLivreur({ user, day }) {
  const aujourdhui = nowInParis().day;
  const tour = user.id
    ? await prisma.tour.findUnique({
        where: { date_driverId: { date: new Date(day), driverId: user.id } },
        include: { deliveries: { include: DETAILS_INTERVENTION, orderBy: { ordre: "asc" } } },
      })
    : null;

  const autreJour =
    day === aujourdhui ? (
      <a href={`/admin/tournees?jour=${addDays(aujourdhui, 1)}`}>Voir demain</a>
    ) : (
      <a href={`/admin/tournees?jour=${aujourdhui}`}>Revenir à aujourd&apos;hui</a>
    );

  if (!tour || !tour.deliveries.length) {
    return (
      <div className="card livreur-vide">
        <span className="eyebrow">{dateLongue(day)}</span>
        <h1 className="section-title">Pas de tournée prévue</h1>
        <p className="muted">L&apos;administrateur ne vous a encore confié aucun arrêt ce jour-là.</p>
        <p>{autreJour}</p>
      </div>
    );
  }

  const restants = tour.deliveries.filter((d) => d.status === "SCHEDULED");
  const enCours = restants[0] ?? null;
  const aCharger = restants.filter((d) => d.type === "DROPOFF").length;
  const pointsRestants = restants
    .filter((d) => d.booking.address.lat != null)
    .map((d) => ({ lat: d.booking.address.lat, lng: d.booking.address.lng }));

  return (
    <>
      <div className="livreur-entete">
        <span className="eyebrow">{dateLongue(day)} · {autreJour}</span>
        <h1 className="section-title">Ma tournée</h1>
        <p className="muted">
          {restants.length} arrêt(s) restant(s) sur {tour.deliveries.length}
          {tour.conduiteMin != null && ` · environ ${tour.conduiteMin} min de conduite`}
          {tour.status === "PLANNED" && ` · ${aCharger} machine(s) à charger à l'entrepôt`}
        </p>
      </div>

      {tour.status === "PLANNED" && day === aujourdhui && <CommencerTournee tourId={tour.id} />}

      <ChoixAppli />
      <CarteTournees
        entrepot={ENTREPOT}
        tournees={[{
          couleur: COULEURS_TOURNEES[0],
          trace: tour.trace ? JSON.parse(tour.trace) : null,
          points: pointsDeTournee(tour.deliveries),
        }]}
      />

      {pointsRestants.length > 1 && (
        <div className="livreur-liens">
          {liensTournee(pointsRestants).map((l) => (
            <a key={l.de} href={l.url} target="_blank" rel="noopener noreferrer" className="btn btn-secondary">
              {liensTournee(pointsRestants).length > 1
                ? `Arrêts ${l.de} à ${l.a} dans Google Maps`
                : "Toute la tournée dans Google Maps"}
            </a>
          ))}
        </div>
      )}

      {!enCours && (
        <div className="card livreur-fini">
          <h2>Tournée terminée 🎉</h2>
          <p className="muted">Pensez à décharger les machines reprises à l&apos;entrepôt.</p>
        </div>
      )}

      <ol className="livreur-arrets">
        {tour.deliveries.map((d) => (
          <Arret key={d.id} d={d} actif={d.id === enCours?.id} />
        ))}
      </ol>
    </>
  );
}

function Arret({ d, actif }) {
  const b = d.booking;
  const fait = d.status !== "SCHEDULED";
  const reprise = d.type === "PICKUP";
  const cautionManquante = !reprise && b.depositAmount > 0 && b.depositStatus !== "HELD";
  const point = b.address.lat != null ? { lat: b.address.lat, lng: b.address.lng } : null;
  return (
    <li className={`card livreur-arret${actif ? " actif" : ""}${fait ? " fait" : ""}`}>
      <div className="livreur-arret-tete">
        <span className="livreur-numero">{d.ordre ?? "–"}</span>
        <span>
          <strong>{reprise ? "Reprise" : "Livraison"}</strong>
          {d.heurePrevue != null && !fait && ` · vers ${heureTexte(d.heurePrevue)}`}
          <br />
          <span className="muted">Créneau client {d.timeSlot}</span>
        </span>
        {fait && <span className="pill DELIVERED">{d.status === "DONE" ? "Fait" : "Échec"}</span>}
      </div>
      <p>
        <strong>{b.customer.firstName} {b.customer.lastName}</strong> ·{" "}
        <a href={`tel:${b.customer.phone.replace(/\s/g, "")}`}>{b.customer.phone}</a>
      </p>
      <p>{adresseTexte(b.address)}</p>
      <p className="muted">
        {FLOOR_LABELS[b.address.floor] ?? b.address.floor}
        {b.address.accessCode && ` · Code : ${b.address.accessCode}`}
      </p>
      <p className="muted">
        {b.product.name}
        {b.unit && ` · machine ${b.unit.serialNumber}`}
        {b.kit && ` · kit ${b.kit.serialNumber}`}
        {b.wantsKit && !b.kit && " · kit demandé, non affecté"}
      </p>
      {!fait && cautionManquante && (
        <p className="form-error">Caution non posée : appelez l&apos;administrateur avant de livrer.</p>
      )}
      {!fait && (
        <div className="livreur-actions">
          {point && (
            <LienGuidage point={point} className={`btn ${actif ? "btn-primary" : "btn-secondary"}`}>
              Y aller
            </LienGuidage>
          )}
          <form action={marquerArret}>
            <input type="hidden" name="id" value={d.id} />
            <input type="hidden" name="resultat" value="DONE" />
            <button type="submit" className={`btn ${actif ? "btn-primary" : "btn-secondary"}`}>
              {reprise ? "Récupérée" : "Livrée"}
            </button>
          </form>
        </div>
      )}
    </li>
  );
}
```

CSS à ajouter à la fin de `app/globals.css` (vérifier au passage que `.btn-secondary` et `.btn-large` existent ; sinon les définir ici) :

```css
.choix-appli { display: flex; gap: 8px; align-items: center; font-size: 14px; }
.choix-appli button { border: 1.5px solid var(--frost); background: #fff; color: var(--navy); border-radius: 100px; padding: 6px 14px; font-weight: 600; cursor: pointer; }
.choix-appli button.actif { background: var(--navy); border-color: var(--navy); color: #fff; }
.livreur-liens { display: flex; flex-wrap: wrap; gap: 10px; }
.livreur-arrets { list-style: none; display: flex; flex-direction: column; gap: 12px; }
.livreur-arret { display: flex; flex-direction: column; gap: 6px; font-size: 15px; }
.livreur-arret.actif { outline: 3px solid var(--cool); }
.livreur-arret.fait { opacity: .55; }
.livreur-arret-tete { display: flex; gap: 12px; align-items: center; }
.livreur-arret-tete .pill { margin-left: auto; }
.livreur-numero { flex: none; width: 34px; height: 34px; border-radius: 50%; background: var(--navy); color: #fff; font-weight: 700; display: grid; place-items: center; }
.livreur-actions { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 6px; }
.livreur-actions form, .livreur-actions .btn { width: 100%; }
.livreur-actions .btn { text-align: center; padding-top: 14px; padding-bottom: 14px; }
```

- [ ] **Step 2: vérifier** — `npm test` → PASS ; `npm run build` → OK.
- [ ] **Step 3: commit** — `feat(tournees): vue livreur, guidage Google Maps ou Waze, depart GPS`

---

### Task 10: Fausses commandes, géocodage à la réservation, doc, recette

**Files:**
- Create: `prisma/fausses-tournees.js`
- Modify: `package.json` (script `db:demo-tournees`), `app/reserver/[slug]/actions.js` (géocodage après création), `README.md`

**Interfaces:**
- Consumes : `hashPassword` (lib/password.js), `geocoder` (T4), `TIME_SLOTS`, `addDays`, `nowInParis`, `geocoderAdresseParId` (T7).

- [ ] **Step 1: script de données de test**

```js title="prisma/fausses-tournees.js"
// Données de test pour les tournées : 3 livreurs et une trentaine
// d'interventions à de vraies adresses de Paris et de la petite couronne,
// aujourd'hui et demain.
//
//   npm run db:demo-tournees              crée (ou recrée) les données
//   npm run db:demo-tournees -- --effacer retire tout ce que ce script a créé
//
// Tout ce qui est créé est reconnaissable : emails en @test.lootaclim.fr,
// références TEST-…, machines TEST-…. Rien d'autre n'est jamais touché.

import { PrismaClient } from "@prisma/client";
import { addDays, nowInParis } from "../lib/dates.js";
import { hashPassword } from "../lib/password.js";
import { geocoder } from "../lib/geocodage.js";
import { TIME_SLOTS } from "../lib/constants.js";

const prisma = new PrismaClient();
const DOMAINE = "@test.lootaclim.fr";
const MOT_DE_PASSE = "tournee-test-2026";

const LIVREURS = [
  { name: "Karim (test)", email: `livreur1${DOMAINE}` },
  { name: "Léa (test)", email: `livreur2${DOMAINE}` },
  { name: "Mehdi (test)", email: `livreur3${DOMAINE}` },
];

// Vraies adresses, tous arrondissements et quelques communes proches.
const ADRESSES = [
  ["8 Rue de la Roquette", "75011", "Paris"],
  ["45 Rue Oberkampf", "75011", "Paris"],
  ["12 Rue des Martyrs", "75009", "Paris"],
  ["30 Rue de Lévis", "75017", "Paris"],
  ["110 Rue du Faubourg Saint-Denis", "75010", "Paris"],
  ["18 Rue Lepic", "75018", "Paris"],
  ["22 Rue de Belleville", "75020", "Paris"],
  ["60 Rue de Ménilmontant", "75020", "Paris"],
  ["14 Rue Mouffetard", "75005", "Paris"],
  ["40 Rue Monge", "75005", "Paris"],
  ["7 Rue de Buci", "75006", "Paris"],
  ["25 Rue du Bac", "75007", "Paris"],
  ["50 Rue Cler", "75007", "Paris"],
  ["15 Rue de Passy", "75016", "Paris"],
  ["80 Avenue de Versailles", "75016", "Paris"],
  ["120 Rue de la Convention", "75015", "Paris"],
  ["35 Rue du Commerce", "75015", "Paris"],
  ["10 Rue Daguerre", "75014", "Paris"],
  ["20 Rue de la Butte aux Cailles", "75013", "Paris"],
  ["90 Avenue d'Italie", "75013", "Paris"],
  ["40 Rue de Charenton", "75012", "Paris"],
  ["30 Rue des Rosiers", "75004", "Paris"],
  ["50 Rue Montorgueil", "75002", "Paris"],
  ["32 Rue de Bretagne", "75003", "Paris"],
  ["20 Rue des Dames", "75017", "Paris"],
  ["5 Rue de Charonne", "75011", "Paris"],
  ["20 Avenue Jean-Baptiste Clément", "92100", "Boulogne-Billancourt"],
  ["10 Rue de Paris", "93100", "Montreuil"],
  ["15 Rue du Midi", "94300", "Vincennes"],
  ["30 Rue Anatole France", "92300", "Levallois-Perret"],
];

const PRENOMS = ["Camille", "Hugo", "Inès", "Lucas", "Chloé", "Yanis", "Manon", "Théo", "Sarah", "Nathan"];
const NOMS = ["Martin", "Bernard", "Dubois", "Moreau", "Laurent", "Simon", "Michel", "Garcia", "Roux", "Fontaine"];
const ETAGES = ["rdc", "asc", "esc", "asc"];

async function verifierQueCeNestPasLaProduction() {
  if (process.env.VERCEL_ENV === "production") throw new Error("Refusé en production.");
  const vraies = await prisma.booking.count({ where: { NOT: { reference: { startsWith: "TEST-" } } } });
  if (vraies > 20 && process.env.SEED_FORCE !== "oui") {
    console.error(`\n⛔ ${vraies} vraies réservations trouvées : cette base ressemble à la production.`);
    console.error("   Vérifiez POSTGRES_PRISMA_URL dans .env. Pour passer outre : SEED_FORCE=oui\n");
    process.exit(1);
  }
}

async function effacer() {
  const tests = await prisma.booking.findMany({ where: { reference: { startsWith: "TEST-" } }, select: { id: true } });
  const ids = tests.map((b) => b.id);
  await prisma.delivery.deleteMany({ where: { bookingId: { in: ids } } });
  await prisma.booking.deleteMany({ where: { id: { in: ids } } });
  await prisma.unit.deleteMany({ where: { serialNumber: { startsWith: "TEST-" } } });
  await prisma.customer.deleteMany({ where: { email: { endsWith: DOMAINE } } }); // adresses en cascade
  await prisma.user.deleteMany({ where: { email: { endsWith: DOMAINE } } }); // tournées en cascade
  // Tournées d'autres livreurs vidées par la suppression.
  await prisma.tour.deleteMany({ where: { deliveries: { none: {} } } });
  console.log(`🧹 Données de test effacées (${ids.length} réservations).`);
}

async function creer() {
  const produits = await prisma.product.findMany({ where: { active: true }, orderBy: { name: "asc" } });
  if (!produits.length) throw new Error("Aucun modèle en base : lancez d'abord npm run db:seed.");

  const passwordHash = await hashPassword(MOT_DE_PASSE);
  for (const l of LIVREURS) {
    await prisma.user.create({ data: { ...l, passwordHash, role: "LIVREUR" } });
  }

  const aujourdhui = nowInParis().day;
  let n = 0;
  let introuvables = 0;
  for (const [i, [line1, zip, city]] of ADRESSES.entries()) {
    const coords = await geocoder({ line1, zip, city });
    if (!coords) {
      introuvables++;
      console.warn(`⚠️  Adresse introuvable, créée quand même sans coordonnées : ${line1}, ${zip}`);
    }
    const jour = i % 2 === 0 ? aujourdhui : addDays(aujourdhui, 1);
    const reprise = i % 3 === 2;
    const creneau = TIME_SLOTS[(i * 5) % TIME_SLOTS.length].id;
    const produit = produits[i % produits.length];
    n++;
    const num = String(n).padStart(3, "0");

    const client = await prisma.customer.create({
      data: {
        email: `client${num}${DOMAINE}`,
        firstName: PRENOMS[i % PRENOMS.length],
        lastName: NOMS[(i * 3) % NOMS.length],
        phone: `06 00 00 ${String(Math.floor(i / 10)).padStart(2, "0")} ${String(i % 100).padStart(2, "0")}`,
        addresses: {
          create: {
            line1, zip, city,
            floor: ETAGES[i % ETAGES.length],
            accessCode: i % 4 === 0 ? `${1000 + i * 37}B` : null,
            lat: coords?.lat ?? null,
            lng: coords?.lng ?? null,
          },
        },
      },
      include: { addresses: true },
    });
    const machine = await prisma.unit.create({
      data: { serialNumber: `TEST-${num}`, productId: produit.id, status: reprise ? "RENTED" : "AVAILABLE" },
    });
    // Livraison : réservation confirmée qui démarre ce jour-là, pour 5 jours.
    // Reprise : réservation livrée il y a 5 jours, qui se termine ce jour-là.
    const debut = reprise ? addDays(jour, -5) : jour;
    const fin = reprise ? jour : addDays(jour, 5);
    await prisma.booking.create({
      data: {
        reference: `TEST-${num}`,
        customerId: client.id,
        addressId: client.addresses[0].id,
        productId: produit.id,
        unitId: machine.id,
        startDate: new Date(debut),
        endDate: new Date(fin),
        status: reprise ? "DELIVERED" : "CONFIRMED",
        subtotal: 0,
        total: 0,
        deliveryFee: 0,
        // Pas de caution sur les données de test : aucun appel Stripe possible.
        depositAmount: 0,
        deliveries: {
          create: [
            { type: "DROPOFF", date: new Date(debut), timeSlot: reprise ? "9h-11h" : creneau, status: reprise ? "DONE" : "SCHEDULED" },
            { type: "PICKUP", date: new Date(fin), timeSlot: reprise ? creneau : "14h-16h" },
          ],
        },
      },
    });
  }
  console.log(`\n✅ ${n} interventions créées (aujourd'hui et demain), ${introuvables} adresse(s) introuvable(s).`);
  console.log("   Livreurs de test (mot de passe commun) :");
  for (const l of LIVREURS) console.log(`   • ${l.name.padEnd(14)} ${l.email}`);
  console.log(`   Mot de passe : ${MOT_DE_PASSE}\n`);
  console.log("   Admin : /admin/tournees → cocher les livreurs → « Calculer les tournées ».");
}

async function main() {
  await verifierQueCeNestPasLaProduction();
  await effacer();
  if (!process.argv.includes("--effacer")) await creer();
}

main()
  .catch((e) => {
    console.error(e.message ?? e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
```

`package.json` : `"db:demo-tournees": "node prisma/fausses-tournees.js"`.

- [ ] **Step 2: géocodage à la réservation** — dans `app/reserver/[slug]/actions.js`, importer `geocoderAdresseParId` depuis `../../../lib/tournees/planification` et, juste après `const { booking, customer, product } = created;` :

```js
  // Coordonnées GPS pour les tournées, sans ralentir le client : pas
  // d'await. Si ça échoue, le calcul des tournées réessaiera.
  geocoderAdresseParId(booking.addressId);
```

- [ ] **Step 3: README** — nouvelle section « 🚚 Tournées des livreurs » : ce que fait la page, `npm run db:demo-tournees` (et `-- --effacer`), la clé `ORS_API_KEY` (création gratuite sur openrouteservice.org, à mettre dans `.env` et dans Vercel), l'adresse provisoire de l'entrepôt dans `lib/tournees/config.js`, les limites (un seul chargement par jour et par véhicule, pas de suivi en direct).

- [ ] **Step 4: recette** — `npm run db:demo-tournees` ; lancer `npm run dev` ; en admin, `/admin/tournees` → calculer pour les 3 livreurs → carte à 3 couleurs, aucun créneau violé (vérifier que chaque heure prévue tombe dans le créneau) ; « Donner à » déplace un arrêt ; connexion `livreur1@test.lootaclim.fr` → atterrit sur sa tournée, ne voit que ses arrêts, « Commencer », « Y aller » ouvre Google Maps, « Livrée » passe au suivant ; un livreur qui poste l'id d'un arrêt d'un autre reçoit « Cet arrêt n'est pas dans votre tournée ».
- [ ] **Step 5: commit** — `feat(tournees): fausses commandes parisiennes, geocodage a la reservation, doc`
