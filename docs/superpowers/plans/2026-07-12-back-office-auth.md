# Back-office : authentification et actions (Étape 3) — Plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Protéger `/admin` par mot de passe (cookie signé + middleware) et gérer tout le cycle de vie depuis le back-office : confirmer/annuler, affecter les machines, suivre les livraisons, gérer le parc, éditer les modèles — plus le kit de durcissement léger.

**Architecture:** Middleware Next.js sur `/admin/*` + cookie HMAC (Web Crypto, compatible edge et Node). Toutes les mutations sont des Server Actions protégées par `requireAdmin()`, avec préconditions re-vérifiées en transaction. Les règles du cycle de vie vivent dans `lib/transitions.js` (pur, testé). Les erreurs remontent en bannière via redirection `?erreur=` — pages admin 100 % Server Components (un seul composant client : le bouton de confirmation).

**Tech Stack:** Next.js 14 (App Router, middleware edge), Prisma 5 + SQLite, `node:test`, Web Crypto. Aucune dépendance ajoutée.

**Spec:** `docs/superpowers/specs/2026-07-12-back-office-auth-design.md`

---

## Structure des fichiers

| Fichier | Rôle |
|---|---|
| `lib/session.js` *(créé)* | Jetons signés : `signSession`, `verifySession`, constantes cookie (Web Crypto, pur) |
| `lib/transitions.js` *(créé)* | Cycle de vie : `confirmError`, `cancelError`, `deliveryDoneEffects`, `deliveryFailError`, `unitAssignmentError`, `unitStatusChangeError` |
| `lib/*.test.js` *(créés)* | Tests des deux modules (54 tests au total avec l'existant) |
| `middleware.js` *(créé, racine)* | Verrou de `/admin/*`, redirection vers la connexion |
| `app/admin/auth.js` *(créé)* | `requireAdmin()` + anti-force-brute en mémoire (serveur uniquement) |
| `app/admin/connexion/page.js` *(créé)* | Page de connexion (Server Component, bannière `?erreur=`) |
| `app/admin/connexion/actions.js` *(créé)* | Server Actions `login` / `logout` |
| `app/admin/AdminHeader.js` *(créé)* | En-tête admin : liens + bouton Se déconnecter |
| `app/admin/ConfirmSubmit.js` *(créé)* | Seul composant client : bouton submit avec `window.confirm` |
| `app/admin/actions.js` *(créé)* | Les 6 actions de gestion (confirm/cancel/assign/markDelivery/saveUnit/updateProduct) |
| `app/admin/page.js` *(réécrit)* | Tableau de bord avec colonnes Actions, bannière, en-tête |
| `app/admin/produits/page.js` *(créé)* | Édition des modèles (description, prix, actif) |
| `app/error.js` *(créé)* | Page d'erreur français + bouton Réessayer |
| `app/reserver/[slug]/actions.js` *(modifié)* | Plafond de 3 demandes `PENDING` par email |
| `app/globals.css` *(modifié)* | Styles admin (en-tête, petits boutons, cellules d'actions, bannière verte) |
| `.env.example` *(créé)* / `.env` *(créé, non versionné)* | `ADMIN_PASSWORD`, `SESSION_SECRET` |
| `README.md` *(modifié)* | Section Connexion, feuille de route, avertissement mis à jour |

**Conventions transverses :** montants en centimes ; jours `"AAAA-MM-JJ"` ; imports relatifs avec `.js` dans `lib/` ; commentaires en français ; messages d'erreur en français ; chaque action admin commence par `await requireAdmin()` et termine par `revalidatePath` + `redirect` (jamais de `redirect` dans un `try/catch` ni dans une transaction).

---

### Task 1 : `lib/session.js` — jetons signés (TDD)

**Files:**
- Create: `lib/session.js`
- Test: `lib/session.test.js`

- [ ] **Step 1 : Écrire les tests (qui échouent)** — créer `lib/session.test.js` :

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  signSession,
  verifySession,
  SESSION_COOKIE,
  SESSION_DURATION_MS,
} from "./session.js";

const SECRET = "secret-de-test";

test("aller-retour : un jeton signé est accepté avant expiration", async () => {
  const token = await signSession(1_000_000, SECRET);
  assert.equal(await verifySession(token, SECRET, 999_999), true);
});

test("un jeton expiré est refusé", async () => {
  const token = await signSession(1_000_000, SECRET);
  assert.equal(await verifySession(token, SECRET, 1_000_000), false);
});

test("un jeton falsifié est refusé", async () => {
  const token = await signSession(1_000_000, SECRET);
  const [payload, sig] = token.split(".");
  assert.equal(await verifySession(`2000000.${sig}`, SECRET, 0), false);
  assert.equal(await verifySession(`${payload}.${"0".repeat(sig.length)}`, SECRET, 0), false);
});

test("mauvais secret et jetons malformés refusés", async () => {
  const token = await signSession(1_000_000, SECRET);
  assert.equal(await verifySession(token, "autre-secret", 0), false);
  for (const bad of ["", "abc", "123", ".", "123.", ".abc", null, undefined]) {
    assert.equal(await verifySession(bad, SECRET, 0), false);
  }
});

test("les constantes de cookie sont exportées", () => {
  assert.equal(SESSION_COOKIE, "lc_admin");
  assert.equal(SESSION_DURATION_MS, 7 * 24 * 60 * 60 * 1000);
});
```

- [ ] **Step 2 : Vérifier l'échec**

Run: `node --test lib/session.test.js`
Expected: FAIL avec `ERR_MODULE_NOT_FOUND` sur `lib/session.js`.

- [ ] **Step 3 : Implémenter `lib/session.js`**

```js
// Jetons de session signés (HMAC-SHA256) via l'API Web Crypto : disponible
// dans Node 20 (tests, Server Actions) ET dans le runtime edge du middleware.
// Format du jeton : "<expiration en ms>.<signature hex>".

const encoder = new TextEncoder();

async function hmacHex(message, secret) {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(message));
  return [...new Uint8Array(signature)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function signSession(expiresAtMs, secret) {
  const payload = String(expiresAtMs);
  return `${payload}.${await hmacHex(payload, secret)}`;
}

export async function verifySession(token, secret, nowMs) {
  if (typeof token !== "string") return false;
  const dot = token.indexOf(".");
  if (dot === -1) return false;
  const payload = token.slice(0, dot);
  const signature = token.slice(dot + 1);
  if (!/^\d+$/.test(payload) || Number(payload) <= nowMs) return false;
  const expected = await hmacHex(payload, secret);
  if (signature.length !== expected.length) return false;
  // Comparaison en temps constant : on parcourt toujours toute la chaîne
  let diff = 0;
  for (let i = 0; i < expected.length; i++) {
    diff |= signature.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  return diff === 0;
}

export const SESSION_COOKIE = "lc_admin";
export const SESSION_DURATION_MS = 7 * 24 * 60 * 60 * 1000; // 7 jours
```

- [ ] **Step 4 : Vérifier le succès**

Run: `node --test lib/session.test.js` → `pass 5`, puis `npm test` → 43 tests, 0 échec.

- [ ] **Step 5 : Commit**

```bash
git add lib/session.js lib/session.test.js
git commit -m "feat: jetons de session signés (HMAC Web Crypto, comparaison temps constant)" -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2 : `lib/transitions.js` — cycle réservation/livraison (TDD)

**Files:**
- Create: `lib/transitions.js`
- Test: `lib/transitions.test.js`

- [ ] **Step 1 : Écrire les tests (qui échouent)** — créer `lib/transitions.test.js` :

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  confirmError,
  cancelError,
  deliveryDoneEffects,
  deliveryFailError,
} from "./transitions.js";

test("confirmError : seule une demande en attente se confirme", () => {
  assert.equal(confirmError({ status: "PENDING" }), null);
  for (const status of ["CONFIRMED", "DELIVERED", "RETURNED", "CANCELLED"]) {
    assert.match(confirmError({ status }), /En attente/);
  }
});

test("cancelError : annulable avant livraison uniquement", () => {
  assert.equal(cancelError({ status: "PENDING" }), null);
  assert.equal(cancelError({ status: "CONFIRMED" }), null);
  for (const status of ["DELIVERED", "RETURNED", "CANCELLED"]) {
    assert.match(cancelError({ status }), /ne peut plus/);
  }
});

test("deliveryDoneEffects : livraison effectuée → livrée + machine en location", () => {
  const r = deliveryDoneEffects(
    { type: "DROPOFF", status: "SCHEDULED" },
    { status: "CONFIRMED", unitId: "u1" }
  );
  assert.deepEqual(r, { booking: "DELIVERED", unit: "RENTED" });
});

test("deliveryDoneEffects : la livraison exige confirmation et machine affectée", () => {
  assert.match(
    deliveryDoneEffects({ type: "DROPOFF", status: "SCHEDULED" }, { status: "PENDING", unitId: "u1" }).error,
    /Confirmez/
  );
  assert.match(
    deliveryDoneEffects({ type: "DROPOFF", status: "SCHEDULED" }, { status: "CONFIRMED", unitId: null }).error,
    /Affectez/
  );
});

test("deliveryDoneEffects : reprise effectuée → terminée + machine disponible", () => {
  const r = deliveryDoneEffects(
    { type: "PICKUP", status: "SCHEDULED" },
    { status: "DELIVERED", unitId: "u1" }
  );
  assert.deepEqual(r, { booking: "RETURNED", unit: "AVAILABLE" });
});

test("deliveryDoneEffects : la reprise exige une réservation livrée", () => {
  assert.match(
    deliveryDoneEffects({ type: "PICKUP", status: "SCHEDULED" }, { status: "CONFIRMED", unitId: "u1" }).error,
    /livraison/
  );
});

test("intervention déjà traitée refusée (effectuée comme échec)", () => {
  assert.match(
    deliveryDoneEffects({ type: "DROPOFF", status: "DONE" }, { status: "CONFIRMED", unitId: "u1" }).error,
    /plus planifiée/
  );
  assert.equal(deliveryFailError({ status: "SCHEDULED" }), null);
  assert.match(deliveryFailError({ status: "DONE" }), /plus planifiée/);
});
```

- [ ] **Step 2 : Vérifier l'échec**

Run: `node --test lib/transitions.test.js`
Expected: FAIL avec `ERR_MODULE_NOT_FOUND` sur `lib/transitions.js`.

- [ ] **Step 3 : Implémenter `lib/transitions.js`**

```js
// Règles d'enchaînement des statuts (réservations, livraisons, machines).
// Fonctions pures : elles renvoient null (autorisé) ou un message d'erreur
// en français ; deliveryDoneEffects renvoie les effets à appliquer.

import { addDays } from "./dates.js";

export function confirmError(booking) {
  return booking.status === "PENDING"
    ? null
    : "Seule une demande « En attente » peut être confirmée.";
}

export function cancelError(booking) {
  return ["PENDING", "CONFIRMED"].includes(booking.status)
    ? null
    : "Une réservation livrée ou terminée ne peut plus être annulée.";
}

// Marquer une intervention « effectuée ». delivery : { type, status },
// booking : { status, unitId }. Renvoie { error } ou { booking, unit }
// (les nouveaux statuts à appliquer atomiquement).
export function deliveryDoneEffects(delivery, booking) {
  if (delivery.status !== "SCHEDULED") {
    return { error: "Cette intervention n'est plus planifiée." };
  }
  if (delivery.type === "DROPOFF") {
    if (booking.status !== "CONFIRMED") {
      return { error: "Confirmez la réservation avant de marquer la livraison effectuée." };
    }
    if (!booking.unitId) {
      return { error: "Affectez d'abord une machine à cette réservation." };
    }
    return { booking: "DELIVERED", unit: "RENTED" };
  }
  if (delivery.type === "PICKUP") {
    if (booking.status !== "DELIVERED") {
      return { error: "Marquez d'abord la livraison comme effectuée." };
    }
    return { booking: "RETURNED", unit: "AVAILABLE" };
  }
  return { error: "Type d'intervention inconnu." };
}

export function deliveryFailError(delivery) {
  return delivery.status === "SCHEDULED"
    ? null
    : "Cette intervention n'est plus planifiée.";
}
```

- [ ] **Step 4 : Vérifier le succès**

Run: `node --test lib/transitions.test.js` → `pass 7`, puis `npm test` → 50 tests, 0 échec.

- [ ] **Step 5 : Commit**

```bash
git add lib/transitions.js lib/transitions.test.js
git commit -m "feat: règles du cycle de vie réservation/livraison (transitions pures)" -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3 : `lib/transitions.js` — affectation machine + statuts du parc (TDD)

**Files:**
- Modify: `lib/transitions.js` (ajout en fin de fichier)
- Modify: `lib/transitions.test.js` (ajout en fin de fichier)

- [ ] **Step 1 : Ajouter les tests (qui échouent)** à la fin de `lib/transitions.test.js` — et compléter l'import en tête de fichier avec `unitAssignmentError` et `unitStatusChangeError` :

```js
test("unitAssignmentError : cas valide", () => {
  const booking = { status: "PENDING", productId: "p1", startDay: "2026-08-01", endDay: "2026-08-05" };
  const unit = { status: "AVAILABLE", productId: "p1" };
  assert.equal(unitAssignmentError(booking, unit, []), null);
});

test("unitAssignmentError : mauvais modèle, machine indisponible, réservation trop avancée", () => {
  const booking = { status: "PENDING", productId: "p1", startDay: "2026-08-01", endDay: "2026-08-05" };
  assert.match(unitAssignmentError(booking, { status: "AVAILABLE", productId: "p2" }, []), /bon modèle/);
  assert.match(unitAssignmentError(booking, { status: "MAINTENANCE", productId: "p1" }, []), /indisponible/);
  assert.match(
    unitAssignmentError({ ...booking, status: "DELIVERED" }, { status: "AVAILABLE", productId: "p1" }, []),
    /ne peut plus/
  );
});

test("unitAssignmentError : chevauchement avec battement refusé, dates disjointes acceptées", () => {
  const booking = { status: "CONFIRMED", productId: "p1", startDay: "2026-08-10", endDay: "2026-08-12" };
  const unit = { status: "AVAILABLE", productId: "p1" };
  // L'autre location finit le 8 → occupe jusqu'au 9 : pas de croisement avec [10, 13]
  assert.equal(
    unitAssignmentError(booking, unit, [{ startDay: "2026-08-05", endDay: "2026-08-08", status: "CONFIRMED" }]),
    null
  );
  // Finit le 9 → occupe jusqu'au 10 : croise le début de la nouvelle
  assert.match(
    unitAssignmentError(booking, unit, [{ startDay: "2026-08-05", endDay: "2026-08-09", status: "CONFIRMED" }]),
    /chevauchent/
  );
  // Une réservation annulée ne bloque pas
  assert.equal(
    unitAssignmentError(booking, unit, [{ startDay: "2026-08-05", endDay: "2026-08-09", status: "CANCELLED" }]),
    null
  );
});

test("unitStatusChangeError : trois statuts manuels, le reste piloté par les livraisons", () => {
  assert.equal(unitStatusChangeError({ status: "AVAILABLE" }, "MAINTENANCE"), null);
  assert.equal(unitStatusChangeError({ status: "RETIRED" }, "AVAILABLE"), null);
  assert.match(unitStatusChangeError({ status: "RENTED" }, "AVAILABLE"), /location/);
  assert.match(unitStatusChangeError({ status: "AVAILABLE" }, "RENTED"), /livraisons/);
});
```

- [ ] **Step 2 : Vérifier l'échec**

Run: `node --test lib/transitions.test.js`
Expected: FAIL — les nouveaux tests échouent (`unitAssignmentError is not a function` ou import invalide), les 7 anciens passent.

- [ ] **Step 3 : Ajouter à la fin de `lib/transitions.js`**

```js
// Affectation d'une machine physique à une réservation.
// booking : { status, productId, startDay, endDay } (jours "AAAA-MM-JJ") —
// unit : { status, productId } — unitBookings : les AUTRES réservations déjà
// affectées à cette machine [{ startDay, endDay, status }].
const BLOCKING_STATUSES = ["PENDING", "CONFIRMED", "DELIVERED"];

export function unitAssignmentError(booking, unit, unitBookings) {
  if (!["PENDING", "CONFIRMED"].includes(booking.status)) {
    return "Cette réservation ne peut plus recevoir de machine.";
  }
  if (unit.productId !== booking.productId) {
    return "Cette machine n'est pas du bon modèle.";
  }
  if (["RETIRED", "MAINTENANCE"].includes(unit.status)) {
    return "Cette machine est indisponible (maintenance ou retirée du parc).";
  }
  for (const other of unitBookings) {
    if (!BLOCKING_STATUSES.includes(other.status)) continue;
    // Chaque location occupe [début, fin + 1 jour de battement] : deux fenêtres
    // se croisent si chacune commence avant la fin de l'autre.
    if (
      booking.startDay <= addDays(other.endDay, 1) &&
      other.startDay <= addDays(booking.endDay, 1)
    ) {
      return "Cette machine est déjà réservée sur des dates qui chevauchent.";
    }
  }
  return null;
}

// Changement MANUEL du statut d'une machine depuis le back-office.
// RENTED et IN_TRANSIT sont pilotés par les livraisons, jamais à la main.
const MANUAL_STATUSES = ["AVAILABLE", "MAINTENANCE", "RETIRED"];

export function unitStatusChangeError(unit, newStatus) {
  if (!MANUAL_STATUSES.includes(newStatus)) {
    return "Ce statut est piloté par les livraisons.";
  }
  if (!MANUAL_STATUSES.includes(unit.status)) {
    return "Cette machine est en location : marquez d'abord la reprise effectuée.";
  }
  return null;
}
```

- [ ] **Step 4 : Vérifier le succès**

Run: `node --test lib/transitions.test.js` → `pass 11`, puis `npm test` → 54 tests, 0 échec.

- [ ] **Step 5 : Commit**

```bash
git add lib/transitions.js lib/transitions.test.js
git commit -m "feat: règles d'affectation de machine et de statut du parc" -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4 : Configuration, `requireAdmin` et middleware

**Files:**
- Create: `.env.example`
- Create: `.env` (local, non versionné — déjà couvert par `.gitignore`)
- Create: `app/admin/auth.js`
- Create: `middleware.js` (racine du projet)

- [ ] **Step 1 : Créer `.env.example`**

```
# Copiez ce fichier en ".env" et remplissez les deux valeurs.
# Le fichier .env est local : il n'est jamais publié ni versionné.

# Mot de passe de connexion au back-office /admin
ADMIN_PASSWORD=

# Clé de signature des sessions — générer avec :
#   node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
SESSION_SECRET=
```

- [ ] **Step 2 : Créer le `.env` local de développement**

```bash
printf 'ADMIN_PASSWORD=lootaclim-dev\nSESSION_SECRET=%s\n' \
  "$(node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))")" > .env
```

(Mot de passe de développement provisoire — le README de la Task 10 explique à Hugo comment le changer.) Vérifier : `git status` ne doit PAS lister `.env`.

- [ ] **Step 3 : Créer `app/admin/auth.js`**

```js
// Garde d'accès des Server Actions admin + anti-force-brute de la connexion.
// Fichier serveur uniquement (il importe next/headers).

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { verifySession, SESSION_COOKIE } from "../../lib/session";

// Double verrou avec le middleware : à appeler en tête de CHAQUE action admin.
export async function requireAdmin() {
  const token = cookies().get(SESSION_COOKIE)?.value ?? "";
  const secret = process.env.SESSION_SECRET;
  if (!secret || !(await verifySession(token, secret, Date.now()))) {
    redirect("/admin/connexion");
  }
}

// Anti-force-brute en mémoire, par IP, fenêtre glissante de 15 minutes.
// Limite assumée : compteur perdu au redémarrage — suffisant en mono-instance.
const attempts = new Map();
const WINDOW_MS = 15 * 60 * 1000;
const MAX_FREE_ATTEMPTS = 5;
const DELAY_MS = 3000;

export async function throttleLogin(ip) {
  const entry = attempts.get(ip);
  if (entry && Date.now() - entry.since > WINDOW_MS) attempts.delete(ip);
  const current = attempts.get(ip);
  if (current && current.count >= MAX_FREE_ATTEMPTS) {
    await new Promise((resolve) => setTimeout(resolve, DELAY_MS));
  }
}

export function recordLoginFailure(ip) {
  const entry = attempts.get(ip) ?? { count: 0, since: Date.now() };
  entry.count += 1;
  attempts.set(ip, entry);
}

export function clearLoginFailures(ip) {
  attempts.delete(ip);
}
```

- [ ] **Step 4 : Créer `middleware.js` à la racine**

```js
// Verrou du back-office : toute URL /admin/* sans session valide est
// renvoyée vers la page de connexion (avec retour à la page demandée après).
// S'exécute dans le runtime edge : lib/session.js n'utilise que Web Crypto.

import { NextResponse } from "next/server";
import { verifySession, SESSION_COOKIE } from "./lib/session";

export async function middleware(request) {
  const { pathname, search } = request.nextUrl;
  if (pathname.startsWith("/admin/connexion")) return NextResponse.next();

  const token = request.cookies.get(SESSION_COOKIE)?.value ?? "";
  const secret = process.env.SESSION_SECRET ?? "";
  if (secret && (await verifySession(token, secret, Date.now()))) {
    return NextResponse.next();
  }

  const url = new URL("/admin/connexion", request.url);
  url.searchParams.set("suivant", pathname + search);
  return NextResponse.redirect(url);
}

export const config = { matcher: ["/admin/:path*"] };
```

- [ ] **Step 5 : Vérifier le verrou**

Lance `npm run dev` en arrière-plan, attends quelques secondes, puis :
- `curl -s -o /dev/null -w "%{http_code} %{redirect_url}" http://localhost:3000/admin` → code `307` (ou `302`) et une URL de redirection contenant `/admin/connexion?suivant=%2Fadmin` ;
- `curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/catalogue` → `200` (le public n'est pas touché).
Tue le serveur. Puis `npm test` → 54/54 et `npx next build` → compile (le middleware apparaît dans la sortie de build, ligne `ƒ Middleware`).

- [ ] **Step 6 : Commit**

```bash
git add .env.example app/admin/auth.js middleware.js
git commit -m "feat: verrou du back-office (middleware + requireAdmin + anti-force-brute)" -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 5 : Page de connexion, login/logout, en-tête admin

**Files:**
- Create: `app/admin/connexion/actions.js`
- Create: `app/admin/connexion/page.js`
- Create: `app/admin/AdminHeader.js`
- Modify: `app/globals.css` (ajout en fin de fichier)

- [ ] **Step 1 : Créer `app/admin/connexion/actions.js`**

```js
"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import crypto from "node:crypto";
import { signSession, SESSION_COOKIE, SESSION_DURATION_MS } from "../../../lib/session";
import { throttleLogin, recordLoginFailure, clearLoginFailures } from "../auth";

// Le paramètre "suivant" doit rester dans le back-office (pas de redirection ouverte)
const safeNext = (raw) =>
  typeof raw === "string" && raw.startsWith("/admin") ? raw : "/admin";

// Comparaison en temps constant, insensible aux longueurs différentes :
// on compare les hachés SHA-256 des deux mots de passe.
function passwordsMatch(given, expected) {
  const a = crypto.createHash("sha256").update(given).digest();
  const b = crypto.createHash("sha256").update(expected).digest();
  return crypto.timingSafeEqual(a, b);
}

export async function login(formData) {
  const password = String(formData.get("password") ?? "");
  const next = safeNext(formData.get("suivant"));

  const expected = process.env.ADMIN_PASSWORD;
  const secret = process.env.SESSION_SECRET;
  if (!expected || !secret) {
    redirect(
      "/admin/connexion?erreur=" +
        encodeURIComponent(
          "Administration non configurée : créez le fichier .env (voir la section Connexion du README)."
        )
    );
  }

  const ip = headers().get("x-forwarded-for")?.split(",")[0]?.trim() || "locale";
  await throttleLogin(ip);

  if (!passwordsMatch(password, expected)) {
    recordLoginFailure(ip);
    redirect(
      `/admin/connexion?erreur=${encodeURIComponent("Mot de passe incorrect.")}` +
        `&suivant=${encodeURIComponent(next)}`
    );
  }

  clearLoginFailures(ip);
  cookies().set(SESSION_COOKIE, await signSession(Date.now() + SESSION_DURATION_MS, secret), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_DURATION_MS / 1000,
  });
  redirect(next);
}

export async function logout() {
  cookies().delete(SESSION_COOKIE);
  redirect("/admin/connexion");
}
```

- [ ] **Step 2 : Créer `app/admin/connexion/page.js`**

```js
import { login } from "./actions";

export const dynamic = "force-dynamic";

export default function Connexion({ searchParams }) {
  const erreur = searchParams.erreur;
  const suivant = searchParams.suivant ?? "/admin";

  return (
    <div style={{ maxWidth: 420, margin: "40px auto 0" }}>
      <div className="card">
        <span className="eyebrow">Back-office</span>
        <h1 className="section-title" style={{ fontSize: 26 }}>Connexion</h1>
        <form action={login}>
          <input type="hidden" name="suivant" value={suivant} />
          <div className="field">
            <label htmlFor="password">Mot de passe administrateur</label>
            <input id="password" name="password" type="password" required autoFocus />
          </div>
          <button type="submit" className="btn btn-primary" style={{ width: "100%", marginTop: 14 }}>
            Se connecter
          </button>
        </form>
        {erreur && <p className="form-error" role="alert">{erreur}</p>}
      </div>
    </div>
  );
}
```

- [ ] **Step 3 : Créer `app/admin/AdminHeader.js`**

```js
import Link from "next/link";
import { logout } from "./connexion/actions";

// En-tête commun des pages du back-office (pas de la page de connexion)
export default function AdminHeader() {
  return (
    <div className="admin-header">
      <Link href="/admin">Tableau de bord</Link>
      <Link href="/admin/produits">Modèles &amp; prix</Link>
      <form action={logout}>
        <button type="submit" className="linklike">Se déconnecter</button>
      </form>
    </div>
  );
}
```

- [ ] **Step 4 : Ajouter à la FIN de `app/globals.css`**

```css
/* ---- Back-office (étape 3) ---- */
.admin-header { display: flex; gap: 18px; align-items: center; font-size: 14px; }
.admin-header a { color: var(--deep); text-decoration: none; font-weight: 600; }
.admin-header a:hover { text-decoration: underline; }
.admin-header form { margin-left: auto; }
.linklike { border: none; background: none; color: #c0392b; font: inherit; font-weight: 600; cursor: pointer; padding: 0; }
.linklike:hover { text-decoration: underline; }
.btn-small { border: none; border-radius: 8px; padding: 6px 12px; font-size: 12.5px; font-weight: 600; cursor: pointer; background: var(--navy); color: #fff; }
.btn-small:hover { opacity: 0.85; }
.btn-danger { background: #ffe1dc; color: #c0392b; }
.actions-cell { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
.actions-cell form { display: flex; gap: 6px; align-items: center; }
.actions-cell select, .actions-cell input { padding: 6px 8px; border: 1px solid rgba(63, 182, 224, 0.35); border-radius: 8px; font-size: 12.5px; font-family: inherit; background: #fff; color: var(--navy); }
.form-ok { margin-top: 12px; padding: 12px 14px; border-radius: 10px; background: #d9f3e6; color: #1a8c5b; font-size: 13.5px; }
.muted { color: #7b98ab; font-size: 12.5px; font-weight: 400; }
textarea { width: 100%; padding: 10px 12px; border: 1px solid rgba(63, 182, 224, 0.35); border-radius: 10px; font-size: 14px; font-family: inherit; background: #fff; color: var(--navy); resize: vertical; }
textarea:focus { outline: 2px solid var(--cool); border-color: transparent; }
```

- [ ] **Step 5 : Vérification HTTP du cycle connexion/déconnexion**

Lance `npm run dev` en arrière-plan. Avec un pot à cookies (`curl -c jar -b jar`) :
1. `GET /admin` → redirection vers `/admin/connexion?suivant=%2Fadmin` ; `GET` de cette page → 200, contient « Mot de passe administrateur ».
2. Soumets le formulaire de connexion en vrai (récupère les champs cachés `$ACTION…` du HTML de la page comme au E2E de l'étape 2, POST multipart avec `password=mauvais` + `suivant=/admin`) → redirection vers `/admin/connexion?erreur=…incorrect…`.
3. Même POST avec `password=lootaclim-dev` → `Set-Cookie: lc_admin=…` et redirection vers `/admin`.
4. `GET /admin` avec le cookie → `200` (le tableau de bord s'affiche).
5. POST du formulaire de déconnexion (action `logout` sur `/admin`) → cookie supprimé ; `GET /admin` → de nouveau redirigé vers la connexion.
Tue le serveur. Rapporte les codes/Location réels de chaque étape.

- [ ] **Step 6 : `npm test`** → 54/54 et `npx next build` → compile.

- [ ] **Step 7 : Commit**

```bash
git add app/admin/connexion app/admin/AdminHeader.js app/globals.css
git commit -m "feat: page de connexion admin, login/logout, en-tête du back-office" -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 6 : Les 6 actions de gestion + bouton de confirmation

**Files:**
- Create: `app/admin/actions.js`
- Create: `app/admin/ConfirmSubmit.js`

- [ ] **Step 1 : Créer `app/admin/ConfirmSubmit.js`** (seul composant client de l'admin)

```js
"use client";

// Bouton de soumission avec confirmation native du navigateur.
export default function ConfirmSubmit({ message, className, children }) {
  return (
    <button
      type="submit"
      className={className}
      onClick={(e) => {
        if (!window.confirm(message)) e.preventDefault();
      }}
    >
      {children}
    </button>
  );
}
```

- [ ] **Step 2 : Créer `app/admin/actions.js`**

```js
"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "../../lib/prisma";
import { toDay } from "../../lib/dates";
import {
  confirmError,
  cancelError,
  deliveryDoneEffects,
  deliveryFailError,
  unitAssignmentError,
  unitStatusChangeError,
} from "../../lib/transitions";
import { requireAdmin } from "./auth";

// Toutes les actions suivent le même patron : requireAdmin → transaction qui
// re-vérifie les préconditions et écrit → revalidation → redirection (avec
// bannière ?erreur= le cas échéant). redirect() reste HORS transaction.
function finish(path, error) {
  revalidatePath("/admin");
  redirect(error ? `${path}?erreur=${encodeURIComponent(error)}` : path);
}

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
  finish("/admin", error);
}

export async function cancelBooking(formData) {
  await requireAdmin();
  const id = String(formData.get("id") ?? "");
  let error = null;
  await prisma.$transaction(async (tx) => {
    const booking = await tx.booking.findUnique({ where: { id } });
    error = booking ? cancelError(booking) : "Réservation introuvable.";
    if (error) return;
    await tx.booking.update({ where: { id }, data: { status: "CANCELLED" } });
  });
  finish("/admin", error);
}

export async function assignUnit(formData) {
  await requireAdmin();
  const bookingId = String(formData.get("bookingId") ?? "");
  const unitId = String(formData.get("unitId") ?? "");
  let error = null;
  await prisma.$transaction(
    async (tx) => {
      const booking = await tx.booking.findUnique({ where: { id: bookingId } });
      const unit = await tx.unit.findUnique({
        where: { id: unitId },
        include: {
          bookings: { select: { id: true, startDate: true, endDate: true, status: true } },
        },
      });
      if (!booking || !unit) {
        error = "Réservation ou machine introuvable.";
        return;
      }
      const b = {
        status: booking.status,
        productId: booking.productId,
        startDay: toDay(booking.startDate),
        endDay: toDay(booking.endDate),
      };
      const others = unit.bookings
        .filter((x) => x.id !== booking.id)
        .map((x) => ({ startDay: toDay(x.startDate), endDay: toDay(x.endDate), status: x.status }));
      error = unitAssignmentError(b, unit, others);
      if (error) return;
      await tx.booking.update({ where: { id: bookingId }, data: { unitId } });
    },
    { isolationLevel: "Serializable" }
  );
  finish("/admin", error);
}

export async function markDelivery(formData) {
  await requireAdmin();
  const id = String(formData.get("id") ?? "");
  const resultat = String(formData.get("resultat") ?? "");
  let error = null;
  await prisma.$transaction(
    async (tx) => {
      const delivery = await tx.delivery.findUnique({
        where: { id },
        include: { booking: true },
      });
      if (!delivery) {
        error = "Intervention introuvable.";
        return;
      }
      if (resultat === "FAILED") {
        error = deliveryFailError(delivery);
        if (error) return;
        await tx.delivery.update({ where: { id }, data: { status: "FAILED" } });
        return;
      }
      const effects = deliveryDoneEffects(delivery, delivery.booking);
      if (effects.error) {
        error = effects.error;
        return;
      }
      await tx.delivery.update({ where: { id }, data: { status: "DONE" } });
      await tx.booking.update({
        where: { id: delivery.bookingId },
        data: { status: effects.booking },
      });
      await tx.unit.update({
        where: { id: delivery.booking.unitId },
        data: { status: effects.unit },
      });
    },
    { isolationLevel: "Serializable" }
  );
  finish("/admin", error);
}

export async function saveUnit(formData) {
  await requireAdmin();
  const id = String(formData.get("id") ?? "");
  const statut = String(formData.get("statut") ?? "");
  const notes = String(formData.get("notes") ?? "").trim().slice(0, 500);
  let error = null;
  await prisma.$transaction(async (tx) => {
    const unit = await tx.unit.findUnique({ where: { id } });
    if (!unit) {
      error = "Machine introuvable.";
      return;
    }
    error = unitStatusChangeError(unit, statut);
    if (error) return;
    await tx.unit.update({ where: { id }, data: { status: statut, notes: notes || null } });
  });
  finish("/admin", error);
}

export async function updateProduct(formData) {
  await requireAdmin();
  const id = String(formData.get("id") ?? "");
  const description = String(formData.get("description") ?? "").trim();
  const priceEuros = Number(String(formData.get("dailyPriceEuros") ?? "").replace(",", "."));
  const active = formData.get("active") === "oui";

  let error = null;
  if (description.length < 10 || description.length > 500) {
    error = "La description doit faire entre 10 et 500 caractères.";
  } else if (!Number.isFinite(priceEuros) || priceEuros < 1 || priceEuros > 500) {
    error = "Le prix par jour doit être compris entre 1 € et 500 €.";
  } else {
    const exists = await prisma.product.findUnique({ where: { id } });
    if (!exists) {
      error = "Modèle introuvable.";
    } else {
      await prisma.product.update({
        where: { id },
        data: { description, dailyPrice: Math.round(priceEuros * 100), active },
      });
    }
  }
  revalidatePath("/admin/produits");
  revalidatePath("/catalogue");
  redirect(error ? `/admin/produits?erreur=${encodeURIComponent(error)}` : "/admin/produits?ok=1");
}
```

- [ ] **Step 3 : Vérifier que le projet compile**

Run: `npx next build`
Expected: `✓ Compiled successfully`. (Les actions ne sont branchées à aucune page pour l'instant ; la vérification fonctionnelle arrive aux Tasks 7-8.)

- [ ] **Step 4 : Commit**

```bash
git add app/admin/actions.js app/admin/ConfirmSubmit.js
git commit -m "feat: actions de gestion du back-office (confirmer, annuler, affecter, livraisons, parc, modèles)" -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 7 : Tableau de bord réécrit avec colonnes Actions

**Files:**
- Modify: `app/admin/page.js` (remplacement complet)

- [ ] **Step 1 : Remplacer entièrement `app/admin/page.js`** par :

```js
import { prisma } from "../../lib/prisma";
import {
  euros,
  BOOKING_STATUS,
  UNIT_STATUS,
  DELIVERY_STATUS,
} from "../../lib/constants";
import { toDay } from "../../lib/dates";
import { unitAssignmentError } from "../../lib/transitions";
import AdminHeader from "./AdminHeader";
import ConfirmSubmit from "./ConfirmSubmit";
import {
  confirmBooking,
  cancelBooking,
  assignUnit,
  markDelivery,
  saveUnit,
} from "./actions";

export const dynamic = "force-dynamic";

const dateFr = (d) =>
  new Date(d).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", timeZone: "UTC" });

// Machines proposables pour une réservation : celles dont l'affectation
// serait acceptée par les règles (bon modèle, en état, dates libres).
function eligibleUnits(booking, units) {
  const b = {
    status: booking.status,
    productId: booking.productId,
    startDay: toDay(booking.startDate),
    endDay: toDay(booking.endDate),
  };
  return units.filter((u) => {
    const others = u.bookings
      .filter((x) => x.id !== booking.id)
      .map((x) => ({ startDay: toDay(x.startDate), endDay: toDay(x.endDate), status: x.status }));
    return unitAssignmentError(b, u, others) === null;
  });
}

const MANUAL_STATUSES = ["AVAILABLE", "MAINTENANCE", "RETIRED"];

export default async function Admin({ searchParams }) {
  const [bookings, units, deliveries, customerCount] = await Promise.all([
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
  ]);

  const caConfirme = bookings
    .filter((b) => !["CANCELLED", "PENDING"].includes(b.status))
    .reduce((s, b) => s + b.total, 0);
  const dispo = units.filter((u) => u.status === "AVAILABLE").length;

  return (
    <div className="stack">
      <AdminHeader />
      {searchParams.erreur && (
        <p className="form-error" role="alert">{searchParams.erreur}</p>
      )}
      <div>
        <span className="eyebrow">Back-office</span>
        <h1 className="section-title">Tableau de bord</h1>
        <div className="kpis">
          <div className="card kpi">
            <div className="num">{euros(caConfirme)}</div>
            <div className="lbl">CA confirmé (20 dern. résa)</div>
          </div>
          <div className="card kpi">
            <div className="num">{dispo}/{units.length}</div>
            <div className="lbl">Machines disponibles</div>
          </div>
          <div className="card kpi">
            <div className="num">{deliveries.length}</div>
            <div className="lbl">Livraisons planifiées</div>
          </div>
          <div className="card kpi">
            <div className="num">{customerCount}</div>
            <div className="lbl">Clients</div>
          </div>
        </div>
      </div>

      <div className="card">
        <h2 style={{ marginBottom: 16 }}>Réservations récentes</h2>
        <table>
          <thead>
            <tr>
              <th>Réf.</th><th>Client</th><th>Machine</th><th>Du</th><th>Au</th><th>Total</th><th>Statut</th><th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {bookings.map((b) => (
              <tr key={b.id}>
                <td>{b.reference}</td>
                <td>{b.customer.firstName} {b.customer.lastName}</td>
                <td>{b.unit ? `${b.unit.product.name} · ${b.unit.serialNumber}` : `${b.product.name} · — à affecter —`}</td>
                <td>{dateFr(b.startDate)}</td>
                <td>{dateFr(b.endDate)}</td>
                <td>{euros(b.total)}</td>
                <td><span className={`pill ${b.status}`}>{BOOKING_STATUS[b.status]}</span></td>
                <td>
                  <div className="actions-cell">
                    {b.status === "PENDING" && (
                      <form action={confirmBooking}>
                        <input type="hidden" name="id" value={b.id} />
                        <button type="submit" className="btn-small">Confirmer</button>
                      </form>
                    )}
                    {["PENDING", "CONFIRMED"].includes(b.status) && !b.unitId && (
                      <form action={assignUnit}>
                        <input type="hidden" name="bookingId" value={b.id} />
                        <select name="unitId" required defaultValue="">
                          <option value="" disabled>Machine…</option>
                          {eligibleUnits(b, units).map((u) => (
                            <option key={u.id} value={u.id}>{u.serialNumber}</option>
                          ))}
                        </select>
                        <button type="submit" className="btn-small">Affecter</button>
                      </form>
                    )}
                    {["PENDING", "CONFIRMED"].includes(b.status) && (
                      <form action={cancelBooking}>
                        <input type="hidden" name="id" value={b.id} />
                        <ConfirmSubmit
                          className="btn-small btn-danger"
                          message={`Annuler la réservation ${b.reference} ?`}
                        >
                          Annuler
                        </ConfirmSubmit>
                      </form>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card">
        <h2 style={{ marginBottom: 16 }}>Prochaines livraisons & reprises</h2>
        <table>
          <thead>
            <tr><th>Date</th><th>Créneau</th><th>Type</th><th>Client</th><th>Adresse</th><th>Statut</th><th>Actions</th></tr>
          </thead>
          <tbody>
            {deliveries.map((d) => (
              <tr key={d.id}>
                <td>{dateFr(d.date)}</td>
                <td>{d.timeSlot}</td>
                <td>{d.type === "DROPOFF" ? "🚚 Livraison" : "↩️ Reprise"}</td>
                <td>{d.booking.customer.firstName} {d.booking.customer.lastName}</td>
                <td>{d.booking.address.line1}, {d.booking.address.zip} {d.booking.address.city}</td>
                <td><span className={`pill ${d.status}`}>{DELIVERY_STATUS[d.status]}</span></td>
                <td>
                  <div className="actions-cell">
                    <form action={markDelivery}>
                      <input type="hidden" name="id" value={d.id} />
                      <input type="hidden" name="resultat" value="DONE" />
                      <button type="submit" className="btn-small">Effectuée</button>
                    </form>
                    <form action={markDelivery}>
                      <input type="hidden" name="id" value={d.id} />
                      <input type="hidden" name="resultat" value="FAILED" />
                      <ConfirmSubmit className="btn-small btn-danger" message="Marquer cette intervention en échec ?">
                        Échec
                      </ConfirmSubmit>
                    </form>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card">
        <h2 style={{ marginBottom: 16 }}>Parc machines</h2>
        <table>
          <thead>
            <tr><th>N° série</th><th>Modèle</th><th>Statut</th><th>Gestion</th></tr>
          </thead>
          <tbody>
            {units.map((u) => (
              <tr key={u.id}>
                <td>{u.serialNumber}</td>
                <td>{u.product.name}</td>
                <td><span className={`pill ${u.status}`}>{UNIT_STATUS[u.status]}</span></td>
                <td>
                  {MANUAL_STATUSES.includes(u.status) ? (
                    <form action={saveUnit} className="actions-cell">
                      <input type="hidden" name="id" value={u.id} />
                      <select name="statut" defaultValue={u.status}>
                        {MANUAL_STATUSES.map((s) => (
                          <option key={s} value={s}>{UNIT_STATUS[s]}</option>
                        ))}
                      </select>
                      <input name="notes" defaultValue={u.notes ?? ""} placeholder="Notes…" maxLength={500} />
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
    </div>
  );
}
```

Note : l'ancien avertissement rouge « pas encore protégé par mot de passe » disparaît — il ne serait plus vrai.

- [ ] **Step 2 : Vérification fonctionnelle HTTP**

Lance `npm run dev` en arrière-plan et connecte-toi (cookie `lc_admin` via le POST de connexion comme à la Task 5). Puis, EN NETTOYANT TOUT À LA FIN :
1. Crée une réservation de test via le tunnel public (POST multipart comme au E2E de l'étape 2 : dates libres à ~1 mois, email `test-e3@example.com`) → note sa référence.
2. `GET /admin` (avec cookie) → 200 ; la ligne de test montre « RIVOLI · — à affecter — », statut « En attente », boutons Confirmer/Affecter/Annuler présents.
3. POST de l'action Confirmer (formulaire de la ligne) → redirection `/admin` ; en base le statut est `CONFIRMED`.
4. POST de l'action Affecter avec une machine RIVOLI éligible → `booking.unitId` renseigné en base.
5. POST « Effectuée » sur la livraison DROPOFF de cette réservation → en base : livraison `DONE`, réservation `DELIVERED`, machine `RENTED`. Vérifie aussi que la ligne « Gestion » de cette machine affiche maintenant « piloté par les livraisons ».
6. POST « Effectuée » sur la PICKUP → réservation `RETURNED`, machine `AVAILABLE`.
7. Cas d'erreur : re-POST « Effectuée » sur la même PICKUP (déjà `DONE`) → redirection avec `?erreur=` contenant « plus planifiée » ; `GET /admin` de cette URL → la bannière s'affiche.
8. Sans cookie : POST direct d'une action (Confirmer) → redirigé vers la connexion, rien ne change en base (double verrou).
9. NETTOYAGE : supprime la réservation de test (deliveries → booking → address → customer `test-e3@example.com`) via un script node/Prisma ; l'état final doit être identique à l'initial (compte les lignes avant/après). La machine utilisée doit être revenue à `AVAILABLE` (c'est le cas après l'étape 6).
Tue le serveur. Rapporte chaque vérification avec sa sortie réelle.

- [ ] **Step 3 : `npm test`** → 54/54 et `npx next build` → compile.

- [ ] **Step 4 : Commit**

```bash
git add app/admin/page.js
git commit -m "feat: colonnes d'actions du tableau de bord (confirmer, affecter, livraisons, parc)" -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 8 : Page `/admin/produits`

**Files:**
- Create: `app/admin/produits/page.js`

- [ ] **Step 1 : Créer `app/admin/produits/page.js`**

```js
import { prisma } from "../../../lib/prisma";
import { euros } from "../../../lib/constants";
import AdminHeader from "../AdminHeader";
import { updateProduct } from "../actions";

export const dynamic = "force-dynamic";

export default async function Produits({ searchParams }) {
  const products = await prisma.product.findMany({ orderBy: { dailyPrice: "asc" } });

  return (
    <div className="stack">
      <AdminHeader />
      <div>
        <span className="eyebrow">Back-office</span>
        <h1 className="section-title">Modèles &amp; prix</h1>
      </div>
      {searchParams.erreur && (
        <p className="form-error" role="alert">{searchParams.erreur}</p>
      )}
      {searchParams.ok && (
        <p className="form-ok" role="status">Modifications enregistrées.</p>
      )}
      {products.map((p) => (
        <form key={p.id} action={updateProduct} className="card">
          <input type="hidden" name="id" value={p.id} />
          <h2 className="step-title">
            {p.name}{" "}
            <span className="muted">({euros(p.dailyPrice)}/jour actuellement)</span>
          </h2>
          <div className="form-grid">
            <div className="field full">
              <label htmlFor={`desc-${p.id}`}>Description</label>
              <textarea
                id={`desc-${p.id}`}
                name="description"
                defaultValue={p.description}
                rows={3}
                required
                minLength={10}
                maxLength={500}
              />
            </div>
            <div className="field">
              <label htmlFor={`prix-${p.id}`}>Prix par jour (€)</label>
              <input
                id={`prix-${p.id}`}
                name="dailyPriceEuros"
                defaultValue={(p.dailyPrice / 100).toLocaleString("fr-FR")}
                inputMode="decimal"
                required
              />
            </div>
            <div className="field">
              <label htmlFor={`actif-${p.id}`}>Visible au catalogue</label>
              <select id={`actif-${p.id}`} name="active" defaultValue={p.active ? "oui" : "non"}>
                <option value="oui">Oui</option>
                <option value="non">Non</option>
              </select>
            </div>
          </div>
          <button type="submit" className="btn btn-primary" style={{ marginTop: 14 }}>
            Enregistrer {p.name}
          </button>
        </form>
      ))}
      <p className="muted">
        Le nom et l&apos;adresse (slug) des modèles ne sont pas modifiables ici :
        ils structurent les liens du site.
      </p>
    </div>
  );
}
```

- [ ] **Step 2 : Vérification HTTP** (serveur dev + cookie admin, nettoyage à la fin)

1. `GET /admin/produits` sans cookie → redirection connexion ; avec cookie → 200, trois formulaires (SEINE, RIVOLI, TROCADÉRO).
2. POST `updateProduct` pour SEINE avec `dailyPriceEuros=13,50` (et description/active inchangés) → redirection `?ok=1` ; en base `dailyPrice = 1350` ; `GET /catalogue` → « 13,50 € ».
3. POST avec `dailyPriceEuros=0` → redirection `?erreur=` contenant « entre 1 € et 500 € » ; prix inchangé en base.
4. POST avec `active=non` pour SEINE → SEINE disparaît du catalogue (`GET /catalogue` ne contient plus SEINE) et `GET /reserver/seine` → 404.
5. NETTOYAGE : re-POST pour remettre SEINE à `12` €/jour, description d'origine, `active=oui` ; vérifier le catalogue redevenu identique.
Tue le serveur. `npm test` → 54/54.

- [ ] **Step 3 : Commit**

```bash
git add app/admin/produits
git commit -m "feat: édition des modèles et prix depuis le back-office" -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 9 : Kit de durcissement — page d'erreur + plafond de demandes

**Files:**
- Create: `app/error.js`
- Modify: `app/reserver/[slug]/actions.js`

- [ ] **Step 1 : Créer `app/error.js`**

```js
"use client";

// Page d'erreur générique : remplace l'écran technique de Next.js.
export default function Error({ reset }) {
  return (
    <div style={{ maxWidth: 520, margin: "60px auto 0", textAlign: "center" }}>
      <div className="card">
        <span className="eyebrow">Oups</span>
        <h1 className="section-title" style={{ fontSize: 26 }}>
          Une erreur inattendue est survenue
        </h1>
        <p style={{ fontSize: 14.5, color: "#5c7d94", lineHeight: 1.7, marginBottom: 20 }}>
          Ce n&apos;est pas de votre faute. Vous pouvez réessayer, ou revenir à
          l&apos;accueil — et nous contacter si le problème persiste.
        </p>
        <button type="button" className="btn btn-primary" onClick={() => reset()}>
          Réessayer
        </button>
        <p style={{ marginTop: 14 }}>
          <a href="/" style={{ color: "var(--deep)", fontSize: 14 }}>Retour à l&apos;accueil</a>
        </p>
      </div>
    </div>
  );
}
```

- [ ] **Step 2 : Plafond de demandes dans `app/reserver/[slug]/actions.js`**

Dans la transaction de `createBooking`, juste APRÈS le bloc `if (unavailable) throw new BookingError(unavailable);` et AVANT le calcul du devis (`const q = quote(...)`), insérer :

```js
          // Plafond anti-abus : pas plus de 3 demandes en attente par client.
          const pendingCount = await tx.booking.count({
            where: { customer: { email: f.email }, status: "PENDING" },
          });
          if (pendingCount >= 3) {
            throw new BookingError(
              "Vous avez déjà 3 demandes en attente. Attendez leur confirmation ou contactez-nous."
            );
          }
```

- [ ] **Step 3 : Vérification HTTP** (serveur dev, nettoyage à la fin)

1. Crée 3 réservations via le tunnel (POST multipart, même email `cap-test@example.com`, plages de dates libres et différentes) → les 3 passent (redirections 303).
2. Tente la 4ᵉ → PAS de redirection vers une confirmation : la réponse action contient le message « Vous avez déjà 3 demandes en attente » (dans le flux de réponse de l'action) ; rien de créé en base (toujours 3 réservations pour cet email).
3. NETTOYAGE : supprime les 3 réservations de test (deliveries, bookings, addresses, customer) ; vérifie les comptes revenus à l'état initial.
4. Page d'erreur : `npx next build` compile ; la présence de `app/error.js` suffit (la déclencher artificiellement n'est pas nécessaire).
Tue le serveur. `npm test` → 54/54.

- [ ] **Step 4 : Commit**

```bash
git add app/error.js "app/reserver/[slug]/actions.js"
git commit -m "feat: page d'erreur français + plafond de 3 demandes en attente par client" -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 10 : README + vérification finale

**Files:**
- Modify: `README.md`

- [ ] **Step 1 : README — quatre modifications**

1. Dans le tableau « 📄 Les pages », remplacer :

```markdown
| `/admin` | Back-office : tableau de bord, réservations, livraisons, parc machines |
```

par :

```markdown
| `/admin` | Back-office (protégé par mot de passe) : demandes, livraisons, parc machines |
| `/admin/produits` | Édition des modèles : descriptions, prix, visibilité |
```

2. Après la section « 🧪 Tests », ajouter :

```markdown
## 🔐 Connexion au back-office

Le back-office `/admin` est protégé par mot de passe. À la première installation :

1. Copiez `.env.example` en `.env` (fichier local, jamais publié).
2. Remplacez `ADMIN_PASSWORD` par votre mot de passe.
3. Générez la clé de session avec :

```bash
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

et collez le résultat après `SESSION_SECRET=`. Relancez `npm run dev`.

Sans ces deux valeurs, le back-office reste fermé. La session dure 7 jours ;
le bouton « Se déconnecter » est en haut du back-office.
```

(Attention à l'imbrication des blocs de code markdown.)

3. Feuille de route : cocher l'étape 3 :

```markdown
- [x] Étape 3 : authentification (protéger /admin) + formulaires d'édition
```

4. Dans « ⚠️ Notes importantes », remplacer le point « **Ne déployez pas en ligne avant l'étape 3** … » par :

```markdown
- **Avant toute mise en ligne** : le back-office est désormais protégé et le
  tunnel plafonné à 3 demandes en attente par client, mais il manque encore la
  vérification d'email des clients, des références de réservation non
  devinables et le paiement (étapes 4-5).
```

- [ ] **Step 2 : Vérification finale complète**

```bash
npm test          # → 54/54
npx next build    # → compile, middleware présent
```

Puis `npm run dev` et le tour complet par curl (avec pot à cookies) :
- `/` , `/catalogue`, `/reserver/rivoli`, `/reserver/confirmation/LC-2026-0001` → 200 (public intact) ;
- `/admin` sans cookie → redirection connexion ; connexion (mauvais puis bon mot de passe) ; `/admin` et `/admin/produits` → 200 avec cookie ; déconnexion → verrou refermé.
Tue le serveur.

- [ ] **Step 3 : Commit**

```bash
git add README.md
git commit -m "docs: étape 3 terminée — connexion au back-office documentée" -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```
