# Emails de confirmation de réservation

## Objectif

Le client doit recevoir un email récapitulatif dès que son paiement est
confirmé, même s'il ferme l'onglet avant de voir la page de confirmation.
L'admin doit être notifié par email de chaque nouvelle réservation payée,
sans avoir à surveiller le back-office en continu.

## Décisions validées

- **Déclencheur : le webhook Stripe (`finalizeCheckoutSession`)**, pas le
  clic du client — c'est déjà la source de vérité pour le paiement (voir
  spec étape 4), donc l'email suit la même logique et le même filet de
  sécurité (page de confirmation) que la mise à jour du statut.
- **Portée : un seul type d'email** — le récapitulatif de commande (même
  contenu que la page `/reserver/confirmation/<réf>`), envoyé au client et,
  séparément, à l'admin en notification. Pas d'email à l'étape "confirmée
  par l'admin" (`PENDING → CONFIRMED`) ni de facture PDF — hors périmètre,
  cf. feuille de route du README (étape 5 : "emails automatiques + factures
  PDF" — les factures restent à faire).
- **Service : [Resend](https://resend.com)**. Choix standard pour un projet
  Next.js : API simple, un seul appel HTTP, 3 000 emails/mois gratuits (largement
  suffisant), pas de serveur SMTP à gérer.
- **Pas de compte client** — on ne crée pas d'espace "mon compte" avec mot
  de passe. L'email EST la trace de la commande pour le client, comme pour
  la grande majorité des sites de réservation/location.
- **Ne doit jamais faire échouer la confirmation du paiement.** La base de
  données reste la source de vérité : si Resend est en panne ou mal
  configuré, la réservation passe quand même à `PENDING`, l'erreur d'envoi
  est seulement journalisée (`console.error`).
- **Sans `RESEND_API_KEY` configurée, l'envoi est silencieusement ignoré**
  (comme le paiement Stripe sans `STRIPE_SECRET_KEY`) — le reste du site
  continue de fonctionner en local sans compte Resend.

## Contenu de l'email

Identique au récapitulatif déjà affiché sur la page de confirmation :
référence, modèle, date/créneau de livraison, date/créneau de reprise,
adresse, total payé, et mention de la caution si applicable. L'email admin
ajoute les coordonnées du client (nom, email, téléphone) en tête.

## Fonctions (`lib/email.js`)

- `buildBookingConfirmationEmail(booking)` — fonction pure (sujet + HTML +
  texte), testée sans réseau.
- `buildAdminNotificationEmail(booking)` — idem, réutilise la précédente.
- `sendBookingConfirmationEmail(booking)` — effectue les deux envois via
  Resend, avale les erreurs (try/catch + log), ne fait rien si
  `RESEND_API_KEY` absente.

`booking` est chargé avec ses relations (`product`, `customer`, `address`,
`deliveries`) — même forme que dans la page de confirmation.

## Hors périmètre

- Email à la confirmation admin (`PENDING → CONFIRMED`).
- Facture PDF.
- Vérification d'email du client à la réservation (déjà notée comme
  manquante avant mise en ligne réelle, indépendante de cette étape).
- Templates HTML avancés (logo, mise en page riche) — texte + tableau simple
  suffisent pour l'instant, cohérent avec le reste du site qui est encore
  minimal visuellement.

## Tests

`lib/email.test.js` : contenu généré par `buildBookingConfirmationEmail` et
`buildAdminNotificationEmail` à partir d'une réservation fictive complète
(sujet correct, référence/total/adresse présents dans le texte, caution
mentionnée seulement si `depositAmount > 0`). Pas de test réseau — l'envoi
réel Resend est vérifié manuellement (voir plan, dernière tâche).
