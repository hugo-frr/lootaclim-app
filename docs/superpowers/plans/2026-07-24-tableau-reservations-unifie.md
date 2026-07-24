# Tableau de réservations unifié — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Un seul tableau de réservations dans `/admin`, trié par urgence, une action pertinente par ligne, responsive (table desktop / cartes mobile) sans dupliquer le markup.

**Architecture:** `app/admin/page.js` reste un Server Component. Toute la logique "quelle action montrer" est extraite en fonctions pures dans le fichier (calculables et réutilisables desktop/mobile puisque c'est le même markup). Deux petites additions côté `app/admin/actions.js` : `cancelBooking` nettoie les livraisons, nouvelle action `placeDepositNow`.

**Tech Stack:** React Server Components, CSS Grid/Flexbox (une media query, pas de duplication de markup). Aucune nouvelle dépendance.

## Global Constraints

- Spec : `docs/superpowers/specs/2026-07-24-tableau-reservations-unifie-design.md`
- Page présentationnelle : pas de nouveau `*.test.js`, vérification par build + tests existants + vérification directe de la logique sur la vraie base (comme pour le diagnostic du bug).
- Un commit par tâche, sur `main`.

---

### Task 1 : `cancelBooking` nettoie les livraisons + nouvelle action `placeDepositNow`

**Files:**
- Modify: `app/admin/actions.js`

- [ ] **Step 1 : Supprimer les livraisons SCHEDULED dans la transaction d'annulation**

Dans `cancelBooking`, à l'intérieur de la transaction, juste après `await tx.booking.update({ ... data: { status: "CANCELLED", ... } })`, ajouter :

```js
      await tx.delivery.deleteMany({ where: { bookingId: id, status: "SCHEDULED" } });
```

- [ ] **Step 2 : Ajouter `placeDepositNow`**

À la suite de `checkDepositsNow`, ajouter :

```js
// Pose manuelle de la caution d'UNE réservation (bouton par ligne) — no-op
// si elle n'est pas due aujourd'hui/demain (même règle que le cron), pour
// ne jamais poser une caution trop tôt (risque d'expiration bancaire à
// ~7 jours, voir README).
export async function placeDepositNow(formData) {
  await requireAdmin();
  const id = String(formData.get("id") ?? "");
  const result = await placeDepositIfDue(id);
  finish("/admin", result === "FAILED" ? "La pose de la caution a échoué — vérifiez la carte du client." : null);
}
```

- [ ] **Step 3 : Build**

Run: `npm run build`
Expected: `✓ Compiled successfully`

- [ ] **Step 4 : Commit**

```bash
git add app/admin/actions.js
git commit -m "fix(admin): nettoyer les livraisons à l'annulation + pose manuelle de caution"
```

---

### Task 2 : CSS du tableau/cartes responsive

**Files:**
- Modify: `app/globals.css`

**Interfaces:**
- Produces : `.bookings-list`, `.bookings-head`, `.booking-row`, `.booking-field`, `.booking-field-label`, `.booking-actions` — consommées par Task 3.

- [ ] **Step 1 : Ajouter le bloc CSS**

Ajouter à la fin de `app/globals.css` :

```css

/* ---- Tableau de réservations unifié ---- */
.bookings-list { display: flex; flex-direction: column; }
.bookings-head, .booking-row {
  display: grid;
  grid-template-columns: 84px 1.1fr 1fr 0.8fr 1fr 1fr 76px 96px 96px 190px;
  gap: 10px;
  align-items: center;
  padding: 12px 10px;
}
.bookings-head {
  font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em;
  color: #5c7d94; font-weight: 600;
  border-bottom: 2px solid rgba(63, 182, 224, 0.25);
}
.booking-row { border-bottom: 1px solid rgba(63, 182, 224, 0.12); font-size: 13px; }
.booking-row:last-child { border-bottom: none; }
.booking-field-label { display: none; }
.booking-next { font-size: 12px; color: #5c7d94; }

@media (max-width: 900px) {
  .bookings-head { display: none; }
  .booking-row {
    display: flex; flex-direction: column; gap: 8px;
    background: rgba(255, 255, 255, 0.85);
    border: 1px solid rgba(63, 182, 224, 0.18);
    border-radius: 14px;
    padding: 14px;
    margin-bottom: 12px;
  }
  .booking-field {
    display: flex; justify-content: space-between; align-items: center; gap: 10px;
  }
  .booking-field-label { display: inline; font-size: 11.5px; color: #5c7d94; font-weight: 600; }
  .booking-actions { width: 100%; }
  .booking-actions .btn-small, .booking-actions form { width: 100%; }
  .booking-actions .actions-cell-stacked { width: 100%; }
}
```

- [ ] **Step 2 : Build**

Run: `npm run build`
Expected: `✓ Compiled successfully`

- [ ] **Step 3 : Commit**

```bash
git add app/globals.css
git commit -m "feat(admin): CSS du tableau de réservations responsive (table/cartes)"
```

---

### Task 3 : Réécrire le tableau dans `app/admin/page.js`

**Files:**
- Modify: `app/admin/page.js`

**Interfaces:**
- Consumes: classes CSS de Task 2, `placeDepositNow`/`checkDepositsNow` (Task 1), `depositDue` (`../../lib/transitions`), `toDay`/`addDays`/`nowInParis` (`../../lib/dates`).
- Produces : `bookingField(label, value)` (petit helper local, affiche `<div className="booking-field"><span className="booking-field-label">label</span><span>value</span></div>` — même contenu affiché en cellule de grille sur desktop et en ligne libellée sur mobile grâce au CSS, pas de JSX dupliqué).

- [ ] **Step 1 : Étendre les imports et la requête**

Remplacer les imports en tête de fichier :

```js
import { prisma } from "../../lib/prisma";
import {
  euros,
  BOOKING_STATUS,
  UNIT_STATUS,
  KIT_STATUS,
  DELIVERY_STATUS,
  DEPOSIT_STATUS,
} from "../../lib/constants";
import { toDay, addDays, nowInParis } from "../../lib/dates";
import { unitAssignmentError, kitAssignmentError, depositDue } from "../../lib/transitions";
import AdminHeader from "./AdminHeader";
import ConfirmSubmit from "./ConfirmSubmit";
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
  placeDepositNow,
  releaseDeposit,
  captureDeposit,
} from "./actions";
```

(Uniquement `DELIVERY_STATUS` reste utilisé dans le tableau "Parc machines" plus bas — le reste des imports existants ne change pas de nom.)

- [ ] **Step 2 : Remplacer la requête `bookings` et supprimer la requête `deliveries`**

Remplacer :

```js
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
```

Par :

```js
    prisma.booking.findMany({
      include: {
        customer: true,
        product: true,
        unit: { include: { product: true } },
        kit: true,
        deliveries: true,
      },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
```

Supprimer entièrement la requête `prisma.delivery.findMany({...})` du même `Promise.all` (et retirer `deliveries` de la liste déstructurée — il n'y a plus qu'un seul tableau `bookings`, `units`, `kits`, `customerCount`, `products` en résultat de `Promise.all`).

- [ ] **Step 3 : Ajouter les helpers de tri et d'action, avant `export default async function Admin`**

```js
const dateTimeFr = (d, slot) => `${dateFr(d)}${slot ? ` · ${slot}` : ""}`;

// Ordre d'affichage : PENDING d'abord (bloque une décision), puis les
// réservations à venir triées par date d'intervention la plus proche,
// enfin l'historique (le plus récent en premier).
function bookingSortKey(b) {
  const dropoff = b.deliveries.find((d) => d.type === "DROPOFF");
  const pickup = b.deliveries.find((d) => d.type === "PICKUP");
  if (b.status === "PENDING") return [0, toDay(b.startDate)];
  if (b.status === "CONFIRMED") return [1, toDay(dropoff?.date ?? b.startDate)];
  if (b.status === "DELIVERED") return [2, toDay(pickup?.date ?? b.endDate)];
  if (b.status === "AWAITING_PAYMENT") return [3, toDay(b.createdAt)];
  if (b.status === "RETURNED") return [4, `~${toDay(pickup?.date ?? b.endDate)}`]; // ~ inverse le tri croissant → plus récent d'abord
  return [5, `~${toDay(b.createdAt)}`]; // CANCELLED
}
function compareBookings(a, b) {
  const [ta, da] = bookingSortKey(a);
  const [tb, db] = bookingSortKey(b);
  if (ta !== tb) return ta - tb;
  return da < db ? (da.startsWith("~") ? 1 : -1) : da > db ? (da.startsWith("~") ? -1 : 1) : 0;
}
```

- [ ] **Step 4 : Remplacer tout le bloc "Réservations récentes" ET supprimer entièrement le bloc "Prochaines livraisons & reprises"**

Remplacer les deux `<div className="card">...</div>` (celui du tableau `<table>` de réservations avec ses `<thead>`/`<tbody>`, ET celui juste après pour "Prochaines livraisons & reprises") par :

```jsx
      <div className="card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 10 }}>
          <h2>Réservations</h2>
          <form action={checkDepositsNow}>
            <button type="submit" className="btn-small">Vérifier les cautions dues aujourd'hui</button>
          </form>
        </div>
        <div className="bookings-list">
          <div className="bookings-head">
            <span>Réf.</span><span>Client</span><span>Machine</span><span>Kit</span>
            <span>Livraison</span><span>Reprise</span><span>Total</span>
            <span>Statut</span><span>Caution</span><span>Action</span>
          </div>
          {[...bookings].sort(compareBookings).map((b) => {
            const dropoff = b.deliveries.find((d) => d.type === "DROPOFF");
            const pickup = b.deliveries.find((d) => d.type === "PICKUP");
            const today = nowInParis().day;
            const depositReady = b.depositAmount > 0 && depositDue(toDay(b.startDate), today);
            const depositDueDay = addDays(toDay(b.startDate), -1);

            return (
              <div className="booking-row" key={b.id}>
                <div className="booking-field"><span className="booking-field-label">Réf.</span><span>{b.reference}</span></div>
                <div className="booking-field"><span className="booking-field-label">Client</span><span>{b.customer.firstName} {b.customer.lastName}</span></div>

                <div className="booking-field">
                  <span className="booking-field-label">Machine</span>
                  {b.status === "PENDING" ? (
                    <select name="unitId" form={`confirm-${b.id}`} defaultValue={b.unitId ?? ""}>
                      <option value="">— à affecter —</option>
                      {eligibleUnits(b, units).map((u) => (
                        <option key={u.id} value={u.id}>{u.serialNumber}</option>
                      ))}
                    </select>
                  ) : b.status === "CONFIRMED" ? (
                    <form action={assignUnit} className="actions-cell">
                      <input type="hidden" name="bookingId" value={b.id} />
                      <select name="unitId" required defaultValue={b.unitId ?? ""}>
                        <option value="" disabled>Machine…</option>
                        {eligibleUnits(b, units).map((u) => (
                          <option key={u.id} value={u.id}>{u.serialNumber}</option>
                        ))}
                      </select>
                      <button type="submit" className="btn-small">{b.unitId ? "Modifier" : "Affecter"}</button>
                    </form>
                  ) : b.unit ? (
                    <span>{b.unit.product.name} · {b.unit.serialNumber}</span>
                  ) : (
                    <span className="muted">{b.product.name} · — à affecter —</span>
                  )}
                </div>

                <div className="booking-field">
                  <span className="booking-field-label">Kit</span>
                  {!b.wantsKit ? (
                    <span className="muted">—</span>
                  ) : b.status === "PENDING" ? (
                    <select name="kitId" form={`confirm-${b.id}`} defaultValue={b.kitId ?? ""}>
                      <option value="">— aucun —</option>
                      {eligibleKits(b, kits).map((k) => (
                        <option key={k.id} value={k.id}>{k.serialNumber}</option>
                      ))}
                    </select>
                  ) : b.status === "CONFIRMED" ? (
                    <form action={assignKit} className="actions-cell">
                      <input type="hidden" name="bookingId" value={b.id} />
                      <select name="kitId" required defaultValue={b.kitId ?? ""}>
                        <option value="" disabled>Kit…</option>
                        {eligibleKits(b, kits).map((k) => (
                          <option key={k.id} value={k.id}>{k.serialNumber}</option>
                        ))}
                      </select>
                      <button type="submit" className="btn-small">{b.kitId ? "Modifier" : "Affecter"}</button>
                    </form>
                  ) : b.kitId ? (
                    <span>{b.kit.serialNumber}</span>
                  ) : (
                    <span className="muted">— (non affecté)</span>
                  )}
                </div>

                <div className="booking-field"><span className="booking-field-label">Livraison</span><span>{dateTimeFr(b.startDate, dropoff?.timeSlot)}</span></div>
                <div className="booking-field"><span className="booking-field-label">Reprise</span><span>{dateTimeFr(b.endDate, pickup?.timeSlot)}</span></div>
                <div className="booking-field"><span className="booking-field-label">Total</span><span>{euros(b.total)}</span></div>
                <div className="booking-field"><span className="booking-field-label">Statut</span><span className={`pill ${b.status}`}>{BOOKING_STATUS[b.status]}</span></div>
                <div className="booking-field">
                  <span className="booking-field-label">Caution</span>
                  {b.depositAmount > 0 ? (
                    <span className={`pill deposit-${b.depositStatus}`}>{DEPOSIT_STATUS[b.depositStatus]}</span>
                  ) : (
                    <span className="muted">—</span>
                  )}
                </div>

                <div className="booking-field booking-actions">
                  <span className="booking-field-label">Action</span>
                  <div className="actions-cell actions-cell-stacked">
                    {b.status === "AWAITING_PAYMENT" && <span className="muted">Paiement en cours…</span>}

                    {b.status === "PENDING" && (
                      <>
                        <form id={`confirm-${b.id}`} action={confirmBooking}>
                          <input type="hidden" name="id" value={b.id} />
                          <button type="submit" className="btn-small">Confirmer</button>
                        </form>
                        <form action={cancelBooking}>
                          <input type="hidden" name="id" value={b.id} />
                          <ConfirmSubmit className="btn-small btn-danger" message={`Annuler la réservation ${b.reference} ?`}>Annuler</ConfirmSubmit>
                        </form>
                      </>
                    )}

                    {b.status === "CONFIRMED" && depositReady && (
                      <form action={placeDepositNow}>
                        <input type="hidden" name="id" value={b.id} />
                        <button type="submit" className="btn-small">Poser la caution</button>
                      </form>
                    )}
                    {b.status === "CONFIRMED" && !depositReady && b.depositAmount > 0 && b.depositStatus === "NONE" && (
                      <span className="booking-next">Caution à poser le {dateFr(depositDueDay)}</span>
                    )}
                    {b.status === "CONFIRMED" && (depositReady === false ? b.depositAmount === 0 || b.depositStatus === "HELD" : true) && !(b.depositAmount > 0 && b.depositStatus === "NONE" && !depositReady) && (
                      <>
                        <form action={markDelivery}>
                          <input type="hidden" name="id" value={dropoff?.id} />
                          <input type="hidden" name="resultat" value="DONE" />
                          <button type="submit" className="btn-small">Marquer livrée</button>
                        </form>
                        <form action={markDelivery}>
                          <input type="hidden" name="id" value={dropoff?.id} />
                          <input type="hidden" name="resultat" value="FAILED" />
                          <ConfirmSubmit className="btn-small btn-danger" message="Marquer cette livraison en échec ?">Échec</ConfirmSubmit>
                        </form>
                      </>
                    )}
                    {b.status === "CONFIRMED" && (
                      <form action={cancelBooking}>
                        <input type="hidden" name="id" value={b.id} />
                        <ConfirmSubmit className="btn-small btn-danger" message={`Annuler la réservation ${b.reference} ?`}>Annuler</ConfirmSubmit>
                      </form>
                    )}

                    {b.status === "DELIVERED" && (
                      <>
                        <form action={markDelivery}>
                          <input type="hidden" name="id" value={pickup?.id} />
                          <input type="hidden" name="resultat" value="DONE" />
                          <button type="submit" className="btn-small">Marquer reprise</button>
                        </form>
                        <form action={markDelivery}>
                          <input type="hidden" name="id" value={pickup?.id} />
                          <input type="hidden" name="resultat" value="FAILED" />
                          <ConfirmSubmit className="btn-small btn-danger" message="Marquer cette reprise en échec ?">Échec</ConfirmSubmit>
                        </form>
                      </>
                    )}

                    {b.status === "RETURNED" && b.depositStatus === "HELD" && (
                      <>
                        <form action={releaseDeposit}>
                          <input type="hidden" name="id" value={b.id} />
                          <button type="submit" className="btn-small">Libérer caution</button>
                        </form>
                        <form action={captureDeposit} className="actions-cell">
                          <input type="hidden" name="id" value={b.id} />
                          <input name="montantEuros" placeholder="Montant €" inputMode="decimal" style={{ width: 90 }} required />
                          <ConfirmSubmit className="btn-small btn-danger" message={`Encaisser la caution de ${b.reference} ?`}>Encaisser</ConfirmSubmit>
                        </form>
                      </>
                    )}

                    {["RETURNED", "CANCELLED"].includes(b.status) && !(b.status === "RETURNED" && b.depositStatus === "HELD") && (
                      <span className="muted">—</span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
```

- [ ] **Step 5 : Simplifier — retirer la condition intermédiaire fragile**

Le bloc conditionnel du Step 4 pour "Marquer livrée" contient une condition trop compliquée (double négation). La remplacer par une fonction claire ajoutée avec les helpers du Step 3 :

```js
// Prête à livrer : machine affectée (toujours vrai après auto-affectation,
// sauf aucune machine dispo au moment de la réservation) et caution posée
// si elle est due maintenant (pas seulement "un jour non due").
function readyToDeliver(b, depositReady) {
  return !(b.depositAmount > 0 && b.depositStatus === "NONE" && depositReady);
}
```

Puis, dans le JSX du Step 4, remplacer la condition :

```jsx
{b.status === "CONFIRMED" && (depositReady === false ? b.depositAmount === 0 || b.depositStatus === "HELD" : true) && !(b.depositAmount > 0 && b.depositStatus === "NONE" && !depositReady) && (
```

Par :

```jsx
{b.status === "CONFIRMED" && readyToDeliver(b, depositReady) && (
```

- [ ] **Step 6 : Build et tests**

Run: `npm run build && npm test`
Expected: `✓ Compiled successfully`, `76/76` tests au vert (aucun test ne touche `app/admin/page.js`).

- [ ] **Step 7 : Commit**

```bash
git add app/admin/page.js
git commit -m "feat(admin): tableau de réservations unifié, trié par urgence, une action par ligne"
```

---

### Task 4 : Vérification directe (logique) + manuelle (visuel, par Hugo)

**Files:** aucun

- [ ] **Step 1 : Vérifier `compareBookings` et le calcul de caution directement contre la vraie base**

Écrire un script Node ponctuel (comme pour le diagnostic précédent) import ant `compareBookings`-equivalent logic ou, plus simple, relire les résultats de `bookingSortKey` appliqués aux vraies réservations de la base (celles listées lors du diagnostic du bug) et vérifier à la main que l'ordre obtenu correspond à l'attendu (PENDING en premier, etc.) — pas de nouveau fichier de test automatisé (page non testée, cohérent avec le reste du projet).

- [ ] **Step 2 : Checklist visuelle pour Hugo (ordinateur ET téléphone)**

- Une seule liste "Réservations", plus de tableau "Prochaines livraisons" séparé.
- Sur téléphone : chaque réservation est une carte lisible, libellés visibles, bouton d'action pleine largeur, facile à toucher.
- Sur ordinateur : colonnes alignées comme un tableau classique.
- Les 3 réservations annulées (LC-2026-0001, 0008, 0009) n'apparaissent plus comme "à livrer".
- Le bouton "Vérifier les cautions dues aujourd'hui" est visible et cliquable.
- Cliquer "Marquer livrée" sur une réservation confirmée avec caution posée fonctionne enfin.
