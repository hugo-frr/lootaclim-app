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
| `/` | Accueil (la vitrine 3D sera intégrée ici plus tard) |
| `/catalogue` | Catalogue avec disponibilité en temps réel depuis la base |
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

## 📁 Structure du projet

```
lootaclim-app/
├── app/                  ← les pages du site
│   ├── page.js           ← accueil
│   ├── catalogue/        ← catalogue public
│   ├── reserver/         ← tunnel de réservation (calendrier, formulaire,
│   │                        server action, page de confirmation)
│   ├── admin/            ← back-office
│   ├── layout.js         ← navigation commune
│   └── globals.css       ← styles (palette LOOTACLIM)
├── lib/
│   ├── prisma.js         ← connexion à la base
│   ├── constants.js      ← statuts, créneaux et libellés français
│   ├── dates.js          ← jours civils "AAAA-MM-JJ", heure de Paris
│   ├── pricing.js        ← calcul du devis (dégressif, livraison)
│   ├── availability.js   ← disponibilité par dates (battement d'1 jour)
│   ├── validation.js     ← validation serveur du formulaire
│   └── *.test.js         ← tests de la logique métier (npm test)
├── prisma/
│   ├── schema.prisma     ← LE fichier clé : structure de la base
│   └── seed.js           ← données de départ
└── package.json          ← dépendances et commandes
```

## 🗺️ Feuille de route

- [x] Étape 1 : fondations — base de données, catalogue, back-office (lecture)
- [x] Étape 2 : tunnel de réservation avec calendrier de disponibilité par dates
- [x] Étape 3 : authentification (protéger /admin) + formulaires d'édition
- [x] Étape 4 : paiement Stripe + caution par empreinte
- [ ] Étape 5 : emails automatiques + factures PDF
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
