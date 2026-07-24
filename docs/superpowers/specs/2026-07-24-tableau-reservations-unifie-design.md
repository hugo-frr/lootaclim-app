# Tableau de réservations unifié (back-office)

## Objectif

Remplacer les deux tableaux actuels de `/admin` ("Réservations récentes" et
"Prochaines livraisons & reprises") par un seul tableau par réservation,
trié par urgence, où chaque ligne montre exactement une action pertinente
au lieu de proposer des boutons qui échouent silencieusement.

## Root cause du bug signalé ("le bouton Effectuée ne fonctionne pas")

Vérifié directement sur la base (voir conversation) — trois causes réelles,
toutes liées au fait que les deux tableaux ne partagent pas leurs règles :
1. `cancelBooking` ne nettoie jamais les `Delivery` de la réservation
   annulée : elles restent `SCHEDULED` indéfiniment, visibles et cliquables
   dans "Prochaines livraisons", mais toujours bloquées par `deliveryDoneEffects`.
2. Ce même tableau affiche des livraisons de réservations `PENDING` voire
   `AWAITING_PAYMENT` — pas encore confirmées/payées, donc systématiquement
   bloquées.
3. `checkDepositsNow` est importé dans `app/admin/page.js` mais **jamais
   affiché** : aucun moyen de poser une caution manuellement, donc en local
   (pas de cron) une réservation confirmée reste bloquée sur "caution non
   posée" indéfiniment.

## Décisions validées

- **Un seul tableau**, une ligne par réservation. Les livraisons ne sont
  plus une entité affichée séparément — chaque ligne montre directement
  livraison (date + créneau) et reprise (date + créneau).
- **Une action principale par ligne**, calculée selon l'état réel de la
  réservation (statut + machine + caution), jamais un bouton qui peut
  échouer silencieusement :
  - `AWAITING_PAYMENT` → aucune action, texte informatif seul.
  - `PENDING` → **Confirmer** (formulaire existant, machine/kit inclus) +
    **Annuler** en secondaire.
  - `CONFIRMED`, caution due maintenant (`depositDue`, même règle que le
    cron) et pas encore posée → **Poser la caution**.
  - `CONFIRMED`, caution due plus tard → texte informatif "Caution à poser
    le {date}" (pas de bouton mort).
  - `CONFIRMED`, prête (machine affectée, caution posée ou non due) →
    **Marquer livrée** + **Échec**.
  - `DELIVERED` → **Marquer reprise** + **Échec**.
  - `RETURNED` → gestion de la caution (déjà existante, inchangée).
  - `CANCELLED` → aucune action, ligne d'historique.
- **Tri par urgence**, pas par date de création : `PENDING` d'abord (bloque
  une décision), puis `CONFIRMED` par date de livraison croissante, puis
  `DELIVERED` par date de reprise croissante, puis le reste (historique) en
  dernier, plus récent d'abord.
- **Deux corrections de fond** (indépendantes du visuel) :
  - `cancelBooking` supprime désormais les `Delivery` `SCHEDULED` de la
    réservation annulée (elles n'ont plus aucun sens une fois annulée).
  - Un vrai bouton "Vérifier les cautions dues aujourd'hui" (`checkDepositsNow`,
    déjà codé) apparaît enfin dans la page.
- **Responsive, en un seul jeu de markup** (pas de table dupliquée) : une
  grille CSS qui devient un tableau à colonnes sur ordinateur et une pile de
  cartes (une réservation = une carte, libellés visibles en ligne) sur
  mobile — bascule via une seule media query, cohérent avec le point de
  rupture déjà utilisé ailleurs sur le site (820px), élargi ici à 900px vu
  le nombre de champs. Boutons d'action pleine largeur et faciles à toucher
  sur mobile.
- **Design réutilisé, pas réinventé** : palette, typographie, cartes et
  pastilles de statut déjà en place dans `globals.css` — aucune nouvelle
  couleur ni police, cohérent avec le reste du site.

## Hors périmètre

- Filtres/onglets (Actives vs Historique) : pas nécessaire au volume actuel
  (quelques réservations) — le tri par urgence suffit, à revisiter si le
  volume grandit.
- Pagination au-delà d'un plafond généreux (50 réservations).
- Modification du contenu des actions existantes (`confirmBooking`,
  `cancelBooking`, `markDelivery`, libération/encaissement caution) — seule
  leur présentation change, plus la suppression des livraisons à
  l'annulation et l'ajout de `placeDepositNow` (nouvelle action fine,
  réutilise `placeDepositIfDue` existant).

## Vérification

Page presentationnelle + 2 petites actions serveur : `npm run build` +
`npm test` (pas de régression `lib/`) + vérification directe de la logique
de tri/action sur de vraies données (comme fait pour le diagnostic) +
contrôle visuel manuel par Hugo sur ordinateur ET téléphone (je ne peux pas
piloter de navigateur moi-même).
