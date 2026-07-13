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
| `/reserver/confirmation/<réf>` | Confirmation d'une demande de réservation |
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
- [ ] Étape 4 : paiement Stripe + caution par empreinte
- [ ] Étape 5 : emails automatiques + factures PDF
- [ ] Étape 6 : intégration de la vitrine 3D + déploiement (Vercel + PostgreSQL)

## ⚠️ Notes importantes

- La base locale est un fichier `prisma/dev.db` (SQLite). En production on passera
  sur PostgreSQL en changeant 2 lignes dans `schema.prisma`.
- **Avant toute mise en ligne** : le back-office est désormais protégé et le
  tunnel plafonné à 3 demandes en attente par client, mais il manque encore la
  vérification d'email des clients, des références de réservation non
  devinables et le paiement (étapes 4-5).
- Après toute modification de `schema.prisma`, relancer `npm run db:migrate`.
