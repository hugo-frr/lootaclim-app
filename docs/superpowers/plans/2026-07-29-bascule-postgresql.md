# Bascule SQLite → PostgreSQL — plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Faire tourner LOOTACLIM sur PostgreSQL au lieu de SQLite, condition sans laquelle les réservations disparaîtraient à chaque déploiement sur Vercel.

**Architecture :** Le schéma Prisma change de connecteur et lit désormais son adresse dans l'environnement. L'historique des six migrations SQLite est supprimé et remplacé par une migration initiale PostgreSQL — il n'existe aucune base en production dont il faudrait préserver l'historique. Les données locales sont intégralement reproductibles par `npm run db:seed`.

**Tech Stack :** Prisma 5.22, PostgreSQL hébergé chez Vercel Postgres, Next.js 14.

**Ce document tient lieu de spec et de plan.** Les décisions ont été prises avec Hugo et sont consignées ci-dessous ; la migration est mécanique et ne justifiait pas deux documents séparés.

## Décisions

| Sujet | Décision | Raison |
|---|---|---|
| Hébergeur | **Vercel Postgres** | Le projet est déployé sur Vercel : les variables de connexion y sont injectées automatiquement, rien à recopier |
| Nombre de bases | **Deux** — `lootaclim-dev` et `lootaclim-prod` | Développer contre la base des vrais clients expose à effacer leurs réservations d'un `npm run db:seed` malencontreux |
| Historique des migrations | **Supprimé et régénéré** | Aucune base en production : cet historique ne protège rien. Le rejouer sur PostgreSQL exposerait à des incompatibilités de dialecte pour zéro bénéfice |
| Données existantes | **Non migrées** | Les 8 machines (`SEI-001`…`TRO-002`), 3 modèles et 4 kits sont exactement ce que produit `prisma/seed.js`. Les 2 réservations sont des tests |
| Base locale | **PostgreSQL également** | Prisma n'accepte qu'un connecteur par schéma. Le développement local pointe donc sur `lootaclim-dev` |

## Global Constraints

- **Aucune dépendance npm ajoutée.** `@prisma/client` et `prisma` sont déjà là.
- **Aucun secret dans un fichier versionné.** `.env` est ignoré par git ; `.env.example` ne contient que des noms de variables et des valeurs vides.
- **Aucun changement de comportement fonctionnel.** Le schéma décrit exactement les mêmes tables, colonnes et contraintes. Seul le connecteur change.
- **Les 122 tests existants doivent rester verts** — ils portent sur `lib/` et ne touchent pas la base.
- **Commentaires et documentation en français.**

## Prérequis, à faire par Hugo avant de commencer

Sans ces trois éléments, la tâche 1 ne peut pas démarrer :

1. Un compte Vercel, connecté à GitHub.
2. Deux bases créées depuis *Storage → Create Database → Postgres* :
   `lootaclim-dev` et `lootaclim-prod`, région Paris (`cdg1`).
3. Dans le `.env` local, les deux variables de la base **dev**, copiées depuis
   l'onglet `.env.local` de `lootaclim-dev` :

   ```
   POSTGRES_PRISMA_URL="postgres://...?pgbouncer=true&connect_timeout=15"
   POSTGRES_URL_NON_POOLING="postgres://..."
   ```

---

### Task 1 : basculer le schéma et régénérer la migration

**Files:**
- Modify: `prisma/schema.prisma` (bloc `datasource`)
- Delete: `prisma/migrations/` (les 6 migrations SQLite et `migration_lock.toml`)
- Create: `prisma/migrations/<horodatage>_init/` (généré par Prisma)
- Modify: `.env.example`

**Interfaces:**
- Consumes: les deux variables d'environnement fournies par Hugo.
- Produces: une base `lootaclim-dev` peuplée, sur laquelle les tâches 2 et 3 s'appuient.

- [ ] **Step 1 : vérifier que la connexion fonctionne avant de rien casser**

```bash
grep -c "^POSTGRES_PRISMA_URL=.\|^POSTGRES_URL_NON_POOLING=." .env
```

Expected: `2`. Si le compte n'est pas à 2, **s'arrêter** : les deux variables ne
sont pas dans `.env`, ou l'une d'elles est vide. Rien de ce qui suit ne
fonctionnera.

- [ ] **Step 2 : changer le connecteur**

Dans `prisma/schema.prisma`, remplacer le bloc `datasource` par :

```prisma
datasource db {
  provider = "postgresql"
  // Adresse groupée, utilisée par l'application à chaque requête.
  url      = env("POSTGRES_PRISMA_URL")
  // Adresse directe, exigée par "prisma migrate" : les migrations ne
  // supportent pas le regroupement de connexions.
  directUrl = env("POSTGRES_URL_NON_POOLING")
}
```

Ces noms sont ceux que Vercel injecte automatiquement dans le projet : aucune
variable à recopier à la main au moment du déploiement.

- [ ] **Step 3 : supprimer l'historique des migrations SQLite**

```bash
rm -rf prisma/migrations
```

Ces six migrations sont écrites en dialecte SQLite et ne rejoueraient pas sur
PostgreSQL. Aucune base en production ne s'appuie dessus : leur historique ne
protège rien.

- [ ] **Step 4 : créer la migration initiale PostgreSQL**

```bash
npx prisma migrate dev --name init
```

Expected: Prisma crée `prisma/migrations/<horodatage>_init/migration.sql`,
l'applique à `lootaclim-dev` et régénère le client. Aucune erreur.

En cas d'échec sur un type, **s'arrêter et le signaler** : le schéma
n'utilise que `String`, `Int`, `Float`, `Boolean` et `DateTime`, tous portables
— une erreur ici signalerait autre chose qu'un problème de dialecte.

- [ ] **Step 5 : peupler la base**

```bash
npm run db:seed
```

Expected: 3 modèles, 8 machines, 4 kits et la réservation de démonstration.

- [ ] **Step 6 : vérifier le contenu**

```bash
node --input-type=module -e "
import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();
for (const t of ['product','unit','kit','booking']) {
  console.log(t, await p[t].count());
}
await p.\$disconnect();
"
```

Expected: `product 3`, `unit 8`, `kit 4`, `booking 1`.

- [ ] **Step 7 : compléter `.env.example`**

Ajouter en tête de `.env.example`, avant `ADMIN_PASSWORD` :

```
# Base de données PostgreSQL (Vercel Postgres).
# Ces deux valeurs se copient depuis l'onglet ".env.local" de la base, dans
# le tableau de bord Vercel. En production, Vercel les injecte tout seul.
POSTGRES_PRISMA_URL=
POSTGRES_URL_NON_POOLING=
```

**Vérifier ensuite que `.env.example` ne contient aucune vraie valeur** :

```bash
grep -E "=(.+)" .env.example | grep -vE "=$|=\"?(mail\.lootaclim\.fr|465|LOOTACLIM <votre-adresse@lootaclim\.fr>)\"?$"
```

Expected: aucune ligne. Toute ligne affichée est un secret qui ne doit pas être
commité.

- [ ] **Step 8 : commit**

```bash
git add prisma/schema.prisma prisma/migrations .env.example
git commit -m "feat(base): basculer de SQLite vers PostgreSQL"
```

---

### Task 2 : vérifier le parcours complet sur PostgreSQL

Rien ne doit avoir changé du point de vue de l'utilisateur. Cette tâche le prouve.

**Files:** aucun, sauf correctif rendu nécessaire par un échec.

**Interfaces:**
- Consumes: la base `lootaclim-dev` peuplée en Task 1.
- Produces: rien.

- [ ] **Step 1 : tests et compilation**

```bash
npm test && npm run build
```

Expected: **122 tests au vert**, compilation sans erreur ni avertissement.

- [ ] **Step 2 : les pages répondent**

```bash
npx next dev -p 3007 &
sleep 12
for u in / /qui-sommes-nous /reserver/seine /admin/connexion; do
  printf "%-24s %s\n" "$u" "$(curl -s -o /dev/null -w '%{http_code}' -L http://localhost:3007$u)"
done
```

Expected: `200` partout. La page d'accueil et `/reserver/seine` lisent la base :
un `500` signalerait un problème de connexion.

**Rappel :** ne pas lancer `npm run build` pendant qu'un `next dev` tourne, les
deux écrivent dans `.next/` et le serveur de développement se met alors à
renvoyer des `500 MODULE_NOT_FOUND`.

- [ ] **Step 3 : la disponibilité se calcule correctement**

```bash
curl -s http://localhost:3007/ | grep -oE "[0-9]+ disponibles?" | sort -u
```

Expected: des nombres cohérents avec les 8 machines du parc, pas
« Indisponible actuellement » partout — ce qui trahirait une requête cassée.

- [ ] **Step 4 : parcours de réservation, à faire dans le navigateur**

Sur `http://localhost:3007/reserver/seine` :
- Le calendrier s'affiche et propose des dates.
- Un devis se calcule quand on choisit deux dates.
- Le formulaire accepte des coordonnées et mène au paiement Stripe (mode test,
  carte `4242 4242 4242 4242`).
- La réservation apparaît ensuite dans `/admin`.

Expected: identique au comportement sous SQLite.

- [ ] **Step 5 : back-office**

Sur `http://localhost:3007/admin`, après connexion :
- Le tableau des réservations s'affiche, trié par urgence.
- Confirmer une réservation en attente fonctionne et affecte une machine.

- [ ] **Step 6 : commit si un correctif a été nécessaire**

Si tout est passé sans correction, ne rien committer et le signaler.

---

### Task 3 : mettre la documentation à jour

Le README décrit encore une installation SQLite. Un lecteur qui le suivrait
aujourd'hui créerait une base locale inutilisable.

**Files:**
- Modify: `README.md`
- Modify: `docs/mise-en-ligne-lootaclim.md`

**Interfaces:**
- Consumes: rien.
- Produces: rien.

- [ ] **Step 1 : corriger l'installation dans le README**

Remplacer, dans la section « 🚀 Installation » :

```bash
npm install          # télécharge les dépendances (2-3 min)
npm run db:migrate   # crée la base de données (répondre "init" au nom de migration)
npm run db:seed      # remplit la base : 3 modèles, 8 machines, 1 réservation démo
npm run dev          # démarre le site
```

par :

```bash
npm install          # télécharge les dépendances (2-3 min)
# Renseigner POSTGRES_PRISMA_URL et POSTGRES_URL_NON_POOLING dans .env
# (onglet ".env.local" de la base lootaclim-dev, tableau de bord Vercel)
npx prisma migrate deploy   # applique les migrations à la base
npm run db:seed             # remplit la base : 3 modèles, 8 machines, 1 réservation démo
npm run dev                 # démarre le site
```

- [ ] **Step 2 : corriger la note de bas de README**

Remplacer :

> La base locale est un fichier `prisma/dev.db` (SQLite). En production on passera
> sur PostgreSQL en changeant 2 lignes dans `schema.prisma`.

par :

> La base est PostgreSQL, hébergée chez Vercel Postgres. Deux bases existent :
> `lootaclim-dev` pour le développement et `lootaclim-prod` pour les vrais
> clients. **Ne jamais faire pointer `.env` sur `lootaclim-prod`** : un
> `npm run db:seed` effacerait les réservations des clients.

- [ ] **Step 3 : corriger le guide de mise en ligne**

Dans `docs/mise-en-ligne-lootaclim.md`, la Phase 1 est désormais faite.
Remplacer l'avertissement sur les migrations, qui s'est révélé infondé :

> ⚠️ Les migrations existantes ont été écrites pour SQLite. Certaines peuvent
> échouer sur PostgreSQL, dont les types sont plus stricts. Prévoir de les
> reprendre — c'est le point le plus incertain de toute la mise en ligne.

par :

> ✅ Fait le 29/07/2026. L'historique SQLite a été remplacé par une migration
> initiale PostgreSQL, sans difficulté : le schéma n'utilise que des types
> portables et aucune base en production n'avait d'historique à préserver.

Mettre également à jour le tableau des blocages en tête de fichier : la ligne 1
(base SQLite) n'a plus lieu d'être.

- [ ] **Step 4 : commit**

```bash
git add README.md docs/mise-en-ligne-lootaclim.md
git commit -m "docs: la base est desormais PostgreSQL"
```

---

## Récapitulatif des fichiers

| Fichier | Action |
|---|---|
| `prisma/schema.prisma` | Connecteur `postgresql`, adresses lues dans l'environnement |
| `prisma/migrations/` | 6 migrations SQLite supprimées, une migration initiale PostgreSQL créée |
| `.env` | Deux variables ajoutées par Hugo (jamais versionné) |
| `.env.example` | Les deux noms de variables ajoutés, valeurs vides |
| `README.md` | Installation et note de bas de page corrigées |
| `docs/mise-en-ligne-lootaclim.md` | Phase 1 marquée comme faite, avertissement infondé retiré |

## Ce que ce plan ne couvre pas

- Le **stockage des photos produit** (`lib/productImages.js` écrit sur le
  disque, impossible sur Vercel) — chantier distinct, Phase 2 du guide.
- Les **pages légales**, le passage de **Stripe en réel**, le **branchement du
  domaine** — Phases 3 à 6 du guide.
- La **base `lootaclim-prod`** : elle est créée mais reste vide. Elle sera
  migrée et peuplée au moment du premier déploiement.
