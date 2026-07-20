# Emails de confirmation — Implementation Plan

Spec : `docs/superpowers/specs/2026-07-20-email-confirmation-design.md`

## Global Constraints

- Un commit par tâche, poussé sur `main` directement (pas de worktree).
- `npm test` et `npm run build` doivent passer avant chaque commit de code.
- L'envoi email ne doit jamais faire échouer `finalizeCheckoutSession`.

## Task 1 : dépendance + variables d'environnement

- `npm install resend`.
- `.env.example` : ajouter `RESEND_API_KEY`, `EMAIL_FROM`,
  `ADMIN_NOTIFICATION_EMAIL` avec commentaires (mêmes conventions que les
  blocs Stripe/session existants).

## Task 2 : `lib/email.js` (TDD)

- Écrire `lib/email.test.js` d'abord : réservation fictive complète →
  `buildBookingConfirmationEmail` renvoie un sujet contenant la référence,
  un texte contenant l'adresse et le total, une mention de caution
  seulement si `depositAmount > 0` ; `buildAdminNotificationEmail` inclut en
  plus les coordonnées du client.
- Implémenter `lib/email.js` : les deux builders (fonctions pures) +
  `sendBookingConfirmationEmail` (effet de bord, Resend, try/catch,
  no-op sans `RESEND_API_KEY`).
- `npm test` doit passer.

## Task 3 : branchement sur `finalizeCheckoutSession`

- Dans `lib/stripe.js`, après la mise à jour du statut à `PENDING`, recharger
  la réservation avec `include: { product, customer, address, deliveries }`
  et appeler `sendBookingConfirmationEmail`.
- Vérifier l'idempotence existante (le statut ne repasse par `AWAITING_PAYMENT`
  qu'une fois) : pas de double envoi si le webhook et la page de confirmation
  appellent tous les deux la fonction.

## Task 4 : documentation

- README : nouvelle section « 📧 Emails de confirmation » (sur le modèle de
  la section Stripe) — créer un compte Resend, vérifier le domaine
  `lootaclim.fr` (sinon Resend limite l'envoi à l'adresse du compte, pas aux
  vrais clients), récupérer la clé API, configurer `EMAIL_FROM` et
  `ADMIN_NOTIFICATION_EMAIL`.
- Cocher la partie "emails automatiques" de l'étape 5 dans la feuille de
  route (les factures PDF restent à faire, donc la case reste à préciser).

## Task 5 : vérification manuelle (bloquée sans compte Resend d'Hugo)

- Créer un compte Resend, vérifier le domaine, coller la clé dans `.env`.
- Faire une réservation de test avec paiement Stripe test → vérifier
  réception de l'email client ET de l'email admin (contenu correct,
  référence correspondante).
- Couper `RESEND_API_KEY` → vérifier que le paiement continue de fonctionner
  sans erreur (juste un log dans le terminal).
