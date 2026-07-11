# Étape 2 — Tunnel de réservation avec calendrier de disponibilité

**Date** : 11 juillet 2026
**Statut** : validé avec Hugo (voir décisions ci-dessous)

## Objectif

Permettre à un client de réserver un climatiseur depuis le site : choisir un modèle,
des dates sur un calendrier de disponibilité, saisir ses coordonnées et son adresse,
puis envoyer une **demande de réservation**. Le paiement (Stripe) arrive à l'étape 4 ;
l'authentification et la validation en back-office à l'étape 3.

## Décisions validées

| Sujet | Décision |
|---|---|
| Fin du tunnel | Réservation créée en statut `PENDING` (« En attente »), à confirmer manuellement. Les dates sont bloquées dans le calendrier dès la demande. |
| Tarification | Prix/jour × nb de jours (inclusif), remise −15 % dès 7 jours, −30 % dès 30 jours, + 29 € de livraison. Frais d'étage à 0 pour l'instant. Tout en centimes. |
| Durée minimale | 1 jour. |
| Battement logistique | 1 jour bloqué entre deux locations d'une même machine. |
| Entrée dans le tunnel | Bouton « Réserver » sur chaque carte du catalogue → `/reserver/[slug]`. |
| Créneaux livraison/reprise | Créneaux de 2 h : `9h-11h`, `11h-13h`, `14h-16h`, `16h-18h`. |
| Zone de livraison | Paris + petite couronne : codes postaux commençant par 75, 92, 93 ou 94. |
| Horizon de réservation | Au plus tôt demain (pas de livraison le jour même), au plus tard J+3 mois. |
| Architecture | Server Components + Server Actions (pas de routes API). Calendrier maison, zéro dépendance UI ajoutée. |

## 1. Changement de schéma

Le modèle `Booking` ne référence aujourd'hui qu'une `Unit` optionnelle (affectée en
back-office avant livraison). Une demande `PENDING` sans machine affectée ne peut donc
être rattachée à aucun modèle — impossible de bloquer le bon calendrier.

**Modification** : ajout d'une relation obligatoire `Booking.productId → Product`.

- Migration Prisma ; la base locale ne contient que des données de démo →
  `prisma migrate reset` + seed mis à jour (la réservation de démo reçoit son
  `productId`, ses créneaux passent au format 2 h).
- `lib/constants.js` : ajout de `TIME_SLOTS` (les 4 créneaux) et `DELIVERY_ZONES`
  (préfixes de codes postaux autorisés).

## 2. Disponibilité — `lib/availability.js` (fonctions pures)

Fonctions sans accès à la base (elles reçoivent les données en paramètres), donc
testables directement.

- **Capacité** d'un modèle = nombre de ses machines dont le statut n'est ni
  `RETIRED` ni `MAINTENANCE`. Les statuts `AVAILABLE`/`RENTED`/`IN_TRANSIT` décrivent
  l'instant présent, pas le futur : ce sont les réservations qui font foi pour le
  calendrier.
- **Occupation** : chaque réservation dont le statut n'est ni `CANCELLED` ni
  `RETURNED` occupe l'intervalle `[startDate, endDate + 1 jour]` (le jour de
  battement). Le modèle est symétrique : la nouvelle réservation occupe aussi son
  jour de battement, ce qui garantit un jour de creux dans les deux sens.
- **Jour complet** : jour où le nombre de réservations qui l'occupent ≥ capacité.
- **Plage réservable** `[début, fin]` : aucun jour de `[début, fin + 1]` n'est
  complet, `début ≥ demain`, `fin ≤ J+3 mois`.
- Le serveur calcule l'ensemble des jours complets sur l'horizon (+ 1 jour pour le
  battement de fin d'horizon) et le passe au composant client.

Toutes les dates sont manipulées en date civile locale (`YYYY-MM-DD`), jamais en
heures/minutes, pour éviter les pièges de fuseaux horaires.

## 3. Prix — `lib/pricing.js` (fonctions pures)

Entrées : prix/jour en centimes, dates de début et fin. Sortie : devis
`{ days, subtotal, discountRate, discount, deliveryFee, total }`.

- `days` = nombre de jours **inclusif** (du 1er au 3 = 3 jours).
- `subtotal = dailyPrice × days`.
- `discountRate` = 0,30 si `days ≥ 30`, sinon 0,15 si `days ≥ 7`, sinon 0.
  `discount = round(subtotal × discountRate)`.
- `deliveryFee = 2900`, `floorFee = 0`.
- `total = subtotal − discount + deliveryFee`.

## 4. Le tunnel — `/reserver/[slug]`

- `app/reserver/[slug]/page.js` — Server Component : charge le produit, calcule
  capacité + jours complets, rend le composant client. 404 si le slug est inconnu
  ou le produit inactif ; message dédié si la capacité est nulle.
- `app/reserver/[slug]/BookingWizard.js` — Client Component en 3 étapes
  progressives sur une seule page :
  1. **Dates** — calendrier maison : 2 mois affichés, navigation sur 3 mois, jours
     complets/hors plage grisés, clic début puis fin (re-clic pour recommencer).
     La sélection est refusée si la plage traverse un jour complet. Devis affiché
     en direct (jours, remise éventuelle, livraison, total).
  2. **Coordonnées** — prénom, nom, email, téléphone ; adresse : rue, code postal
     (validé 75/92/93/94 avec message clair), ville, étage (`rdc`/`asc`/`esc`),
     code d'accès (facultatif) ; créneau de livraison et créneau de reprise.
  3. **Récapitulatif** — relecture complète, bouton « Confirmer ma demande ».
- Catalogue : bouton « Réserver » sur chaque carte (lien vers `/reserver/[slug]`),
  désactivé si le modèle n'a aucune machine en parc.
- Styles ajoutés dans `globals.css`, dans la palette existante.

## 5. Création de la réservation — Server Action

`app/reserver/[slug]/actions.js` : `createBooking(formData)`.

1. **Validation serveur** (les contrôles client ne sont qu'un confort) : dates dans
   l'horizon, plage cohérente, email/téléphone plausibles, code postal en zone,
   créneaux dans `TIME_SLOTS`, étage dans les valeurs connues. Messages d'erreur
   en français renvoyés au formulaire.
2. **Transaction Prisma** :
   - re-lecture des réservations du modèle et re-vérification de la disponibilité
     (protection contre deux clients réservant la dernière machine en même temps) ;
   - client retrouvé par email (`upsert` : coordonnées mises à jour) ; adresse créée ;
   - réservation créée : statut `PENDING`, montants du devis recalculés côté serveur,
     `unitId` null (affectation en back-office), référence `LC-<année>-<n° sur 4 chiffres>`
     (compteur = nombre de réservations de l'année + 1 ; en cas de collision sur la
     contrainte d'unicité, nouvelle tentative — 3 essais max) ;
   - deux `Delivery` : `DROPOFF` le premier jour, `PICKUP` le dernier jour, avec les
     créneaux choisis.
3. Redirection vers `/reserver/confirmation/[reference]`.

Si la disponibilité a disparu entre-temps : message « Ces dates viennent d'être
réservées » et calendrier rafraîchi.

## 6. Page de confirmation

`app/reserver/confirmation/[reference]/page.js` — Server Component : référence,
modèle, dates, créneaux, adresse, détail du prix, et le message « Votre demande est
enregistrée, nous la confirmons rapidement par téléphone ou par email ». 404 si la
référence est inconnue. Les demandes apparaissent dans le back-office existant avec
la pastille « En attente » ; les boutons de confirmation arrivent à l'étape 3.

## 7. Tests

- `npm test` → `node --test` (rien à installer).
- `lib/availability.test.js` : capacité (statuts exclus), occupation avec battement,
  chevauchements partiels, jour complet, plage traversant un jour complet, bornes
  demain/J+3 mois.
- `lib/pricing.test.js` : 1 jour, 6/7 jours (seuil −15 %), 29/30 jours (seuil −30 %),
  arrondis en centimes, total.
- La logique métier étant pure, la Server Action reste une fine couche
  d'orchestration (validation + transaction) vérifiée manuellement dans le navigateur.

## Hors périmètre (étapes suivantes)

- Authentification et boutons de confirmation en back-office (étape 3).
- Paiement et caution Stripe (étape 4).
- Emails automatiques (étape 5).
- Frais d'étage (champ en base déjà prêt, à activer plus tard).

## Documentation

Mettre à jour le `README.md` : étape 2 cochée dans la feuille de route, nouvelles
pages `/reserver/[slug]` et confirmation, commande `npm test`, note sur la
réinitialisation de la base (`npm run db:migrate` après la migration).
