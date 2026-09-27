# LOOTACLIM — Application de location (Phase 2)

Site + back-office de location de climatiseurs. Next.js + Prisma + SQLite (PostgreSQL en production).

## 🚀 Installation (première fois)

1. **Installer Node.js** (version 20 ou plus) : https://nodejs.org → bouton "LTS".
   Vérifiez dans un terminal : `node --version`

2. **Ouvrir ce dossier dans VS Code** : Fichier → Ouvrir le dossier → `lootaclim-app`

3. **Ouvrir le terminal intégré** : menu Terminal → Nouveau terminal, puis taper :

```bash
npm install          # télécharge les dépendances (2-3 min)
npm run db:migrate   # crée la base de données (répondre "init" au nom de migration)
npm run db:seed      # remplit la base : 3 modèles, 8 machines, 1 réservation démo
npm run dev          # démarre le site
```

4. Ouvrir http://localhost:3000 dans votre navigateur. 🎉

## 📄 Les pages

| URL | Description |
|---|---|
| `/` | Accueil — vitrine complète (hero, comment ça marche, catalogue des modèles avec disponibilité en temps réel sous `#modeles`, réassurance) |
| `/catalogue` | N'existe plus — redirige (308) vers `/#modeles` |
| `/reserver/<modèle>` | Tunnel de réservation : calendrier de disponibilité, coordonnées, récapitulatif |
| `/reserver/confirmation/<réf>` | Confirmation d'une demande de réservation, une fois le paiement Stripe validé |
| `/admin` | Back-office (protégé par mot de passe) : demandes, livraisons, parc machines |
| `/admin/produits` | Édition des modèles : descriptions, prix, visibilité |

## 🗄️ Voir et modifier la base de données

```bash
npm run db:studio
```

Ouvre une interface visuelle (Prisma Studio) pour ajouter/modifier des produits, machines, clients… sans écrire de code. C'est votre outil d'administration en attendant les formulaires du back-office.

## 🧪 Tests

```bash
npm test
```

Vérifie la logique métier (disponibilité, battement d'un jour entre deux
locations, prix dégressif, validation du formulaire) sans toucher à la base.
Les demandes de réservation arrivent dans `/admin` en statut « En attente » —
la validation manuelle (boutons de confirmation) arrive à l'étape 3.

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

⚠️ **Limite connue** : les banques ne conservent le blocage d'une caution
(« empreinte ») que 7 jours environ. Pour une location de plus d'une
semaine, la caution posée avant la livraison peut donc avoir expiré au
moment de la reprise — la libération ou l'encaissement échoueraient alors
avec une erreur Stripe. Pour l'instant, c'est une limite du fonctionnement
par blocage de carte ; en attendant une solution (nouveau blocage à
mi-location, par exemple), soyez attentif avec les locations longues et
vérifiez la caution manuellement si besoin.

## 📧 Emails de confirmation

Deux emails automatiques, envoyés via la boîte mail `lootaclim.fr` créée
chez votre hébergeur (LWS) en SMTP direct (pas de service tiers) :

- **Au paiement** : le client reçoit un récapitulatif de sa réservation
  (même contenu que la page de confirmation) et vous recevez une
  notification avec ses coordonnées.
- **À la confirmation** (bouton "Confirmer" dans `/admin`) : le client
  reçoit un court email lui confirmant que sa machine est bien réservée,
  avec un rappel de la date de livraison.

À la première installation :

1. Sur le Panel Client LWS, créez une adresse email si ce n'est pas déjà
   fait (ex. `reservations@lootaclim.fr`) et notez son mot de passe.
2. Dans `.env`, renseignez :
   - `SMTP_HOST=mail.lootaclim.fr`
   - `SMTP_PORT=465`
   - `SMTP_USER=` votre adresse email complète
   - `SMTP_PASSWORD=` son mot de passe
3. Remplacez `EMAIL_FROM` par cette même adresse, par ex.
   `LOOTACLIM <reservations@lootaclim.fr>` — la plupart des serveurs SMTP
   rejettent ou marquent comme suspect un email envoyé "au nom" d'une autre
   adresse que celle authentifiée.
4. Renseignez `ADMIN_NOTIFICATION_EMAIL` avec l'adresse email où vous
   voulez recevoir une notification à chaque nouvelle réservation payée
   (peut être la même adresse, ou une autre que vous consultez déjà).

Tant que `SMTP_HOST`/`SMTP_USER`/`SMTP_PASSWORD` ne sont pas tous les trois
configurés, le reste du site continue de fonctionner normalement — l'envoi
d'email est simplement ignoré (un message s'affiche dans le terminal en cas
d'erreur d'envoi, mais la réservation du client n'est jamais bloquée par un
problème d'email).

## 📁 Structure du projet

```
lootaclim-app/
├── app/                  ← les pages du site
│   ├── page.js           ← accueil = catalogue complet (section #modeles)
│   ├── Reveal.js         ← apparition au scroll (accueil)
│   ├── ModelPhoto.js     ← photo produit avec repli "photo à venir"
│   ├── reserver/         ← tunnel de réservation (calendrier, formulaire,
│   │                        server action, page de confirmation)
│   ├── admin/            ← back-office
│   ├── layout.js         ← navigation commune
│   └── globals.css       ← styles (palette LOOTACLIM)
├── next.config.js        ← redirection /catalogue → /#modeles
├── lib/
│   ├── prisma.js         ← connexion à la base
│   ├── constants.js      ← statuts, créneaux et libellés français
│   ├── dates.js          ← jours civils "AAAA-MM-JJ", heure de Paris
│   ├── pricing.js        ← calcul du devis (dégressif, livraison)
│   ├── availability.js   ← disponibilité par dates (battement d'1 jour)
│   ├── validation.js     ← validation serveur du formulaire
│   ├── email.js          ← email de confirmation (client + notification admin)
│   └── *.test.js         ← tests de la logique métier (npm test)
├── prisma/
│   ├── schema.prisma     ← LE fichier clé : structure de la base
│   └── seed.js           ← données de départ
└── package.json          ← dépendances et commandes
```

## 🚚 Tournées des livreurs

Page **`/admin/tournees`** (c'est là qu'arrive un livreur qui se connecte).

- **Admin** : choisir le jour, cocher les livreurs qui travaillent, cliquer
  « Calculer les tournées ». L'application répartit les livraisons et reprises
  entre eux, dans le meilleur ordre, en respectant les créneaux clients et la
  place dans les véhicules. « Donner à… » passe un arrêt à un autre livreur.
- **Livreur** : sa tournée sur une carte, « Commencer ma tournée » (recalcule
  l'ordre depuis sa position), « Y aller » ouvre Google Maps ou Waze,
  « Livrée » / « Récupérée » passe à l'arrêt suivant.

**Tester avec de fausses commandes** (30 vraies adresses à Paris et autour,
aujourd'hui et demain, 3 livreurs de test) :

```bash
npm run db:demo-tournees              # crée (ou recrée) les données de test
npm run db:demo-tournees -- --effacer # les retire toutes
```

Le script affiche les emails et le mot de passe des livreurs de test. Il refuse
de tourner sur une base qui ressemble à la production, et ne touche qu'à ce
qu'il a créé (emails `@test.lootaclim.fr`, références `TEST-…`).

**Réglages** dans `lib/tournees/config.js` : temps sur place, capacité d'un
véhicule, horaires. ⚠️ **L'adresse de l'entrepôt y est provisoire** (12 rue de
Rivoli) : à remplacer, coordonnées GPS comprises.

**Temps de trajet réels (facultatif)** : créer une clé gratuite sur
[openrouteservice.org](https://openrouteservice.org/dev/#/signup), la mettre
dans `.env` (`ORS_API_KEY=…`) et dans les variables d'environnement Vercel.
Sans clé, les temps sont estimés à vol d'oiseau et la carte relie les arrêts
en pointillés : tout fonctionne, en un peu moins précis.

**Limites connues** : un seul chargement par jour et par véhicule (6 machines),
pas de suivi en direct des livreurs sur la carte admin.

## 🗺️ Feuille de route

- [x] Étape 1 : fondations — base de données, catalogue, back-office (lecture)
- [x] Étape 2 : tunnel de réservation avec calendrier de disponibilité par dates
- [x] Étape 3 : authentification (protéger /admin) + formulaires d'édition
- [x] Étape 4 : paiement Stripe + caution par empreinte
- [x] Étape 5a : email de confirmation automatique (client + notification admin)
- [ ] Étape 5b : factures PDF
- [ ] Étape 6 : intégration de la vitrine 3D + déploiement (Vercel + PostgreSQL)

## ⚠️ Notes importantes

- La base locale est un fichier `prisma/dev.db` (SQLite). En production on passera
  sur PostgreSQL en changeant 2 lignes dans `schema.prisma`.
- **Avant toute mise en ligne** : le back-office est protégé, le tunnel plafonné
  à 3 demandes en attente par client, et le paiement + la caution passent par
  Stripe. Il manque encore la vérification d'email des clients et des
  références de réservation non devinables (étapes suivantes).
- Après toute modification de `schema.prisma`, relancer `npm run db:migrate`.
- `/api/stripe/webhook` et `/api/cron/deposits` sont des routes techniques
  (pas des pages) : la première reçoit les notifications de paiement Stripe,
  la seconde pose automatiquement les cautions chaque jour.
- ⚠️ **Photos de modèles (`lib/productImages.js`)** : le glisser-déposer
  dans `/admin/produits` enregistre les images directement dans
  `public/images/` sur le disque local. Ça fonctionne en local et sur un
  serveur Node classique, mais **pas sur Vercel** (système de fichiers non
  modifiable à l'exécution une fois déployé) — avant la mise en ligne
  réelle (étape 6), il faudra basculer vers un vrai service de stockage
  (type Vercel Blob).
