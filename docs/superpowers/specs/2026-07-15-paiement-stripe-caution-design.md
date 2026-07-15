# Étape 4 — Paiement Stripe + caution par empreinte

**Date** : 15 juillet 2026
**Statut** : validé avec Hugo (voir décisions ci-dessous)

## Objectif

Faire payer la location au client au moment de sa demande (comme aujourd'hui,
mais avec de l'argent qui bouge), et bloquer une caution par empreinte
bancaire avant chaque livraison — sans jamais faire perdre une réservation
payée, et sans jamais livrer une machine dont la caution n'a pas pu être
posée.

## Décisions validées

| Sujet | Décision |
|---|---|
| Moment du paiement | Le client paie le **montant total de la location** au moment de sa demande, avant toute validation de votre part. La réservation arrive ensuite dans votre back-office déjà payée, statut « En attente » — comme aujourd'hui. |
| Interface de paiement | Stripe Checkout, page hébergée par Stripe (le site ne manipule jamais de numéro de carte). |
| Fiabilité de la confirmation | Webhook Stripe comme source de vérité (fonctionne même si le client ne revient jamais sur le site) ; la page de confirmation vérifie aussi en direct, en filet. |
| Blocage du calendrier pendant le paiement | Nouveau statut transitoire `AWAITING_PAYMENT`, qui bloque le calendrier comme `PENDING` aujourd'hui. Expire après 30 min si le paiement n'aboutit pas ; les dates se libèrent automatiquement. |
| Montant de la caution | Fixe par modèle, éditable par vous sur `/admin/produits` (comme le prix/jour). |
| Pose de la caution | Automatique, la veille de la livraison (ou immédiatement si la livraison est très proche au moment du paiement). Un bouton « Vérifier les cautions à poser aujourd'hui » en back-office sert de filet et d'outil de test. |
| Échec de pose de caution | Réservation signalée bien visible dans le tableau de bord ; la livraison ne peut pas être marquée « Effectuée » tant que la caution n'est pas posée. |
| Fin de caution | Décision manuelle en back-office après la reprise : « Libérer » ou « Encaisser X € » (montant saisi par vous). |
| Annulation | Remboursement automatique intégral de la location si elle était payée ; libération automatique de la caution si elle était posée. |
| Hors périmètre | Emails automatiques, factures PDF (étape 5) ; autres moyens de paiement que la carte ; remboursement partiel/frais d'annulation ; vérification d'email, références non devinables (étapes suivantes). |

## 1. Modèle de données

```prisma
model Product {
  // ...existant...
  depositAmount Int @default(0) // caution en CENTIMES, éditable en back-office
}

model Customer {
  // ...existant...
  stripeCustomerId String? // client Stripe, pour débiter la caution plus tard sans redemander la carte
}

model Booking {
  // ...existant...
  status         String  @default("AWAITING_PAYMENT")
  // AWAITING_PAYMENT | PENDING | CONFIRMED | DELIVERED | RETURNED | CANCELLED
  checkoutExpiresAt DateTime? // fin de validité de la session Stripe Checkout (statut AWAITING_PAYMENT)
  depositAmount     Int     @default(0) // caution en centimes, figée au moment de la réservation
  depositStatus     String  @default("NONE")
  // NONE | HELD | FAILED | RELEASED | CAPTURED
  capturedAmount    Int?    // montant réellement encaissé si CAPTURED
}
```

`paymentId` et `depositId` existent déjà dans le schéma (ids Stripe du
paiement et de l'empreinte) : ils sont réutilisés tels quels.

`BLOCKING_STATUSES` (`lib/availability.js` et `lib/transitions.js`) passe de
`["PENDING", "CONFIRMED", "DELIVERED"]` à
`["AWAITING_PAYMENT", "PENDING", "CONFIRMED", "DELIVERED"]` — une réservation
en cours de paiement bloque le calendrier au même titre qu'une réservation
confirmée.

Le plafond de 3 demandes par email (étape 3) compte désormais
`AWAITING_PAYMENT` + `PENDING` ensemble, sinon quelqu'un pourrait ouvrir des
sessions de paiement en boucle sans jamais payer et bloquer des dates.

## 2. Parcours de paiement (tunnel)

`app/reserver/[slug]/actions.js`, fonction `createBooking` :

1. Mêmes vérifications qu'aujourd'hui (formulaire, disponibilité, plafond de
   3 demandes) dans la même transaction Serializable.
2. Le devis (`quote()`) est calculé comme aujourd'hui ; le `depositAmount` du
   modèle est lu et copié sur la réservation.
3. La réservation est créée avec le statut `AWAITING_PAYMENT` et
   `checkoutExpiresAt = maintenant + 30 min` — elle bloque déjà le calendrier.
4. Hors transaction : création d'une session Stripe Checkout (`mode:
   "payment"`, devise EUR, locale `fr`, un seul article = le total de la
   location, `metadata.bookingId`, `payment_intent_data.setup_future_usage:
   "off_session"` pour pouvoir débiter la caution plus tard sans redemander la
   carte, `expires_at` aligné sur `checkoutExpiresAt`, `success_url` vers la
   page de confirmation avec `?session_id={CHECKOUT_SESSION_ID}`,
   `cancel_url` vers le tunnel).
5. Si Stripe échoue à créer la session (erreur réseau, clé absente…) : la
   réservation `AWAITING_PAYMENT` est supprimée (la date se libère) et un
   message d'erreur générique s'affiche dans le tunnel.
6. `redirect(session.url)` vers la page Stripe.

## 3. Confirmation du paiement

**Webhook** — `app/api/stripe/webhook/route.js` (route HTTP brute, pas une
Server Action : Stripe a besoin du corps non modifié pour vérifier la
signature avec `STRIPE_WEBHOOK_SECRET`).

- `checkout.session.completed` → retrouve la réservation par
  `metadata.bookingId`. Si elle est toujours `AWAITING_PAYMENT` : passe à
  `PENDING`, enregistre `paymentId` (id du PaymentIntent) et
  `stripeCustomerId` sur le client. Si la livraison a lieu aujourd'hui ou
  demain (jour civil), tente immédiatement la pose de la caution (voir
  section 4) — sinon la tâche quotidienne s'en chargera la veille.
- `checkout.session.expired` → si la réservation est toujours
  `AWAITING_PAYMENT`, elle est supprimée (date libérée).
- Traitement idempotent (relit toujours le statut actuel avant d'agir) :
  Stripe peut renvoyer un même événement plusieurs fois.

**Filet côté page de confirmation** — `/reserver/confirmation/[reference]`
reçoit aussi `?session_id=...`. Si la réservation n'est pas encore `PENDING`
au chargement de la page (webhook pas encore arrivé), la page appelle la même
fonction de finalisation directement (en interrogeant Stripe sur l'état de la
session) avant de s'afficher. Dans l'immense majorité des cas le webhook est
déjà passé et ce filet ne fait rien.

## 4. Caution — pose automatique

Fonction partagée `placeDueDeposits()` dans `lib/stripe.js`, appelée par
trois déclencheurs :
- immédiatement après paiement si la livraison est proche (section 3) ;
- une tâche planifiée quotidienne (`app/api/cron/deposits/route.js`, protégée
  par un secret `CRON_SECRET`, programmée via `vercel.json` une fois par
  jour) ;
- le bouton back-office « Vérifier les cautions à poser aujourd'hui ».

Elle sélectionne les réservations `CONFIRMED`, dont la livraison (`DROPOFF`)
a lieu aujourd'hui ou demain (jour civil, comme les autres calculs de dates
du projet — voir `lib/dates.js`), et dont `depositStatus === "NONE"`. Pour
chacune :
crée un `PaymentIntent` Stripe (`capture_method: "manual"`, `off_session:
true`) sur le `stripeCustomerId` enregistré, montant = `booking.depositAmount`.

- Succès (`requires_capture`) → `depositStatus = "HELD"`, `depositId`
  enregistré.
- Échec (carte refusée/expirée, authentification requise...) →
  `depositStatus = "FAILED"` — la réservation ressort signalée dans le
  tableau de bord.

## 5. Caution — libération / encaissement

Deux nouvelles actions admin (`app/admin/actions.js`), disponibles uniquement
sur une réservation `RETURNED` avec `depositStatus === "HELD"` :

- `releaseDeposit(bookingId)` → annule le `PaymentIntent` de caution côté
  Stripe (jamais débité) → `depositStatus = "RELEASED"`.
- `captureDeposit(bookingId, montantEuros)` → `0 < montant ≤ depositAmount`
  → capture partielle du `PaymentIntent` pour ce montant précis →
  `depositStatus = "CAPTURED"`, `capturedAmount` enregistré.

Ces règles (transitions autorisées) sont exprimées comme fonctions pures
dans `lib/transitions.js` (`depositReleaseError`, `depositCaptureError`),
testées comme le reste du fichier.

## 6. Blocage de la livraison si caution non posée

`deliveryDoneEffects` (`lib/transitions.js`), branche `DROPOFF` : ajoute la
condition `booking.depositStatus === "HELD"` en plus des conditions
existantes (réservation `CONFIRMED`, machine affectée). Message d'erreur
dédié si la caution n'est pas posée : « La caution n'a pas encore été posée
sur ce client — vérifiez la carte avant de livrer. »

## 7. Annulation avec remboursement

`cancelBooking` étendu : si `booking.paymentId` existe, appelle
`stripe.refunds.create` (remboursement intégral) **avant** d'écrire en base ;
si l'appel Stripe échoue, l'annulation est bloquée et l'erreur remontée (pas
de désynchronisation argent/statut). Si `depositStatus === "HELD"`, la
caution est libérée dans la foulée. Puis le statut passe à `CANCELLED` comme
aujourd'hui.

## 8. Nettoyage des réservations abandonnées

Le webhook `checkout.session.expired` couvre le cas normal. En filet, la
tâche planifiée quotidienne (section 4) supprime aussi les réservations
`AWAITING_PAYMENT` dont `checkoutExpiresAt` est dépassé, et le calcul de
disponibilité (`fullDays`) ignore de toute façon une `AWAITING_PAYMENT`
expirée même si la ligne existe encore — défense en profondeur, dans le même
esprit que le double verrou d'authentification de l'étape 3.

## 9. Interface back-office

- Nouvelle colonne/pastille « Caution » sur le tableau des réservations :
  Non due / Posée / **Échec ⚠️** (mise en évidence visuelle) / Libérée /
  Encaissée (montant affiché).
- Sur une réservation `RETURNED` avec caution `HELD` : boutons « Libérer la
  caution » et « Encaisser… » (champ montant en euros).
- Bouton « Vérifier les cautions à poser aujourd'hui » en haut du tableau de
  bord.
- Le bouton « Effectuée » d'une livraison `DROPOFF` reste cliquable mais
  renvoie l'erreur de la section 6 si la caution n'est pas posée (même patron
  que les autres refus de transition : bannière `?erreur=`).

## 10. Configuration et documentation

- Nouvelle dépendance : `stripe` (SDK Node officiel).
- Nouvelles variables d'environnement (`.env.example` + README) :
  `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `CRON_SECRET`.
- README : nouvelle section « 💳 Paiement Stripe » (créer le compte, récupérer
  les clés de test, installer et lancer `stripe listen` en local pour le
  webhook — commandes exactes fournies), au même niveau de détail que la
  section connexion back-office de l'étape 3.
- README : case Étape 4 cochée dans la feuille de route ; la liste « avant
  toute mise en ligne réelle » mise à jour pour retirer le paiement de ce qui
  manque encore.
- `lootaclim-guide-lancement-express.md` : note ajoutée indiquant que le
  paiement Stripe existe désormais nativement dans le site sur-mesure
  (pertinent pour la bascule Phase 1 → Phase 2 à l'automne).
- Une section récapitulative claire « Ce qu'il reste à faire de votre côté »
  (créer le compte Stripe, config des clés, etc.) sera ajoutée au README à
  l'implémentation, sur le même modèle que l'étape 3.

## 11. Tests

- `lib/transitions.test.js` (étendu) : `DROPOFF` refusé sans caution `HELD`,
  accepté avec ; `depositReleaseError`/`depositCaptureError` (bonnes/mauvaises
  transitions, montant hors bornes).
- `lib/availability.test.js` (étendu) : `AWAITING_PAYMENT` bloque le
  calendrier ; une `AWAITING_PAYMENT` expirée ne bloque plus.
- Les appels réels à Stripe ne sont pas unitairement testés (comme les appels
  Prisma ne le sont pas) : vérification HTTP de bout en bout à
  l'implémentation avec les cartes de test Stripe (4242…), `stripe listen`
  pour le webhook local, et le bouton manuel pour simuler la pose de caution
  sans attendre un vrai lendemain : tunnel → paiement test → réservation
  `PENDING` payée → confirmation → affectation → pose de caution manuelle →
  livraison bloquée puis débloquée → reprise → libération/encaissement →
  scénario d'annulation avec remboursement.

## Hors périmètre (étapes suivantes)

- Emails automatiques (reçu de paiement, confirmation) et factures PDF
  (étape 5).
- Autres moyens de paiement (virement, SEPA...).
- Remboursement partiel / frais d'annulation retenus.
- Vérification d'email des clients, références de réservation non devinables.
- Re-tentative automatique en cas d'échec de pose de caution (v1 : action
  manuelle de votre part après avoir recontacté le client).
