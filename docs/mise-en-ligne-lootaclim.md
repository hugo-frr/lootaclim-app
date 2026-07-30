# Mettre LOOTACLIM en ligne sur lootaclim.fr

Parcours complet, dans l'ordre. Écrit le 30/07/2026.

**🧑 = tu le fais** (comptes, clics, informations que je n'ai pas)
**🤖 = je le fais** (code)

À la fin de l'étape 5, le site est **visible sur lootaclim.fr**. L'étape 6 est ce
qu'il faut en plus pour **encaisser légalement de l'argent**.

---

## Étape 1 🧑 — Créer la base de données (~10 min)

Ton site stocke ses réservations dans un fichier local (SQLite). Sur un
hébergement comme Vercel, ce fichier est effacé à chaque mise à jour : **les
réservations disparaîtraient**. Il faut donc une vraie base, hébergée ailleurs.

1. Crée un compte sur **[vercel.com](https://vercel.com)** → *Continue with GitHub*.
2. Dans le tableau de bord, onglet **Storage** → **Create Database**.
3. Choisis **Neon** (« Serverless Postgres ») → **Create**.
   > *Neon est ce qu'est devenue l'offre Postgres de Vercel. C'est du PostgreSQL
   > standard : si tu changes d'hébergeur un jour, la base se déplace sans
   > réécrire une ligne de code.*
4. Nomme-la **`lootaclim`**, région **Paris (cdg1)** ou Francfort.
5. Une fois créée, ouvre-la → onglet **`.env.local`** (ou *Quickstart*).

**Ce que tu me donnes :** la **liste des noms** de variables affichés
(`DATABASE_URL`, `POSTGRES_PRISMA_URL`, `POSTGRES_URL_NON_POOLING`…).
**Pas les valeurs** — elles contiennent un mot de passe.

**Ce que tu fais des valeurs :** tu les copies toi-même dans le fichier `.env`
à la racine du projet, à la fin.

---

## Étape 2 🤖 — Basculer le code sur PostgreSQL (~10 min)

Dès que tu m'as donné les noms de variables :

- Je change le connecteur dans `prisma/schema.prisma`.
- Je remplace les 6 migrations écrites pour SQLite par une migration neuve pour
  PostgreSQL. *(Aucune base en production n'existe : cet historique ne protège
  rien, et le rejouer exposerait à des incompatibilités pour zéro bénéfice.)*
- Je peuple la base : 3 modèles, 8 machines, 4 kits.
- Je vérifie : 122 tests, compilation, et une réservation de bout en bout avec
  la carte de test Stripe `4242 4242 4242 4242`.

Rien ne change pour toi visuellement. Plan détaillé :
`docs/superpowers/plans/2026-07-29-bascule-postgresql.md`

---

## Étape 3 🤖 — Envoyer le code sur GitHub (~1 min)

**49 commits n'ont jamais été envoyés.** Vercel déploie depuis GitHub : sans
cette étape, il n'a rien à publier.

```bash
git push -u origin main
```

Le dépôt existe déjà : `github.com/hugo-frr/lootaclim-app`.

> ⚠️ **Vérifie que le dépôt est privé** avant de pousser. Il ne contient aucun
> mot de passe (`.env` est exclu), mais ton code commercial n'a pas à être
> public. GitHub → *Settings* → *Danger Zone* → *Change visibility*.

---

## Étape 4 🧑 — Créer le projet Vercel et déployer (~10 min)

1. Sur Vercel : **Add New** → **Project** → importe `hugo-frr/lootaclim-app`.
2. Next.js est reconnu tout seul. **Ne touche à aucun réglage de compilation.**
3. Avant de cliquer *Deploy*, ouvre **Environment Variables** et saisis :

| Variable | Où la trouver |
|---|---|
| `ADMIN_PASSWORD` | ton `.env` |
| `SESSION_SECRET` | ton `.env` |
| `STRIPE_SECRET_KEY` | ton `.env` (clé de test pour l'instant) |
| `STRIPE_WEBHOOK_SECRET` | à refaire à l'étape 6 |
| `CRON_SECRET` | ton `.env` |
| `SMTP_HOST` `SMTP_PORT` `SMTP_USER` `SMTP_PASSWORD` | ton `.env` |
| `EMAIL_FROM` | ton `.env` |
| `ADMIN_NOTIFICATION_EMAIL` | ton adresse |

Les variables de la base sont déjà là : Vercel les a ajoutées tout seul en
créant Neon.

4. **Deploy.** Deux à trois minutes.
5. Le site est en ligne sur une adresse en `…vercel.app`. **Ouvre-la et
   vérifie** avant de brancher ton domaine.

> **Coût :** le forfait gratuit de Vercel **interdit l'usage commercial**. Pour
> un site qui encaisse des paiements, il faut le forfait **Pro, ~20 €/mois**.

---

## Étape 5 🧑 — Brancher lootaclim.fr (~15 min + propagation)

1. Sur Vercel : projet → **Settings** → **Domains** → ajoute `lootaclim.fr`
   **et** `www.lootaclim.fr`. Vercel affiche les valeurs DNS exactes à recopier.
2. Va dans le **LWS Panel** → **Nom de domaine** → **Zone DNS**.
3. **Modifie uniquement** :
   - l'enregistrement **`A`** de `@` (ou `lootaclim.fr`) → l'adresse IP donnée par Vercel
   - l'enregistrement **`CNAME`** de `www` → la valeur donnée par Vercel

### ⛔ Les trois enregistrements à ne surtout pas toucher

| Enregistrement | Valeur actuelle |
|---|---|
| `MX` | `mail.lootaclim.fr` |
| `A` de `mail` | `193.203.239.99` |
| `TXT` (SPF) | `v=spf1 mx:lootaclim.fr a:mail.lootaclim.fr a:mailphp.lws-hosting.com -all` |

Ce sont eux qui font marcher ta messagerie. **En supprimer un coupe les emails
de confirmation** — et tu ne t'en apercevrais qu'en perdant un client. Ils sont
indépendants du site : le site part chez Vercel, les mails restent chez LWS.

Comme tu continues d'envoyer par le SMTP de LWS, ton SPF reste valide. Rien à
refaire de ce côté.

4. Compte de 15 minutes à quelques heures de propagation. Le certificat HTTPS
   est délivré automatiquement par Vercel.

**✅ À ce stade, ton site est accessible sur https://lootaclim.fr.**

---

## Étape 6 — Avant d'encaisser le premier euro

Le site est visible, mais **il ne doit pas encore prendre de vraie réservation**.

### 6a 🧑🤖 Pages légales — obligatoires

Trois pages sont légalement exigées en France pour un site commercial :

| Page | Ce qu'il me faut de toi |
|---|---|
| Mentions légales | Forme juridique, **SIRET**, adresse du siège, responsable de publication |
| CGV / conditions de location | Un modèle relu (LegalPlace, Captain Contrat) |
| Confidentialité (RGPD) | Rien — je la rédige d'après les données réellement collectées |

Je peux écrire la politique de confidentialité de façon quasi complète : je sais
exactement ce que ton application enregistre (nom, prénom, email, téléphone,
adresse, étage, code d'accès, dates, référence de paiement Stripe).

Pour les **CGV**, je peux écrire la structure et y injecter tes vraies règles
telles qu'elles sont codées — 29 € de livraison et reprise, tarif dégressif,
caution par empreinte bancaire, battement d'un jour entre deux locations. Mais
**je n'inventerai pas les clauses juridiques** sur la casse, le retard de
restitution ou la responsabilité : une clause qui a l'air sérieuse mais qui est
fausse te nuirait plus que son absence.

### 6b 🧑 Passer Stripe en réel

1. Dans Stripe, quitte le **mode test**. Le passage en réel demande ton SIRET et
   un IBAN.
2. Récupère la clé `sk_live_…` et remplace `STRIPE_SECRET_KEY` dans Vercel.
3. Crée un **nouveau webhook** vers `https://lootaclim.fr/api/stripe/webhook`,
   récupère son secret `whsec_…` et mets-le dans `STRIPE_WEBHOOK_SECRET`.
4. La pose automatique des cautions est déjà déclarée dans `vercel.json`
   (`/api/cron/deposits`, chaque jour à 5 h), protégée par `CRON_SECRET`.

### 6c 🧑 Les photos produit

Tes 3 photos actuelles sont **le même fichier**, et il porte le logo **RAKS**
d'un fabricant. Tes trois modèles se ressemblent donc, et la photo ne
t'appartient pas.

Photographie tes vraies machines (fond clair, lumière du jour), puis dépose-les
dans `public/images/`. Le dossier n'est pas encore versionné, je m'en occupe.

> **À savoir :** le glisser-déposer d'image du back-office **ne marchera pas en
> ligne** — il écrit sur le disque, que Vercel efface. Vu que tu as trois
> modèles et que tu changes rarement leurs photos, le plus simple est de les
> déposer dans `public/images/` et de les versionner. Installer un service de
> stockage dédié serait disproportionné pour ce besoin.

---

## Recette finale 🧑

Avant d'annoncer le site :

- [ ] Une réservation complète avec une **vraie carte**, puis remboursement
      depuis Stripe
- [ ] Les deux emails arrivent (client + notification), y compris vers Gmail —
      vérifier qu'ils ne tombent pas en indésirables
- [ ] `/admin` accessible avec le mot de passe, refusé sans
- [ ] L'accueil sur un vrai téléphone : vidéo fluide, texte lisible
- [ ] Les trois modèles affichent chacun leur photo
- [ ] Les liens légaux répondent en pied de page

---

## Limite connue à surveiller

Les blocages de caution Stripe (empreintes bancaires) **expirent après environ
7 jours**. Pour une location de plus d'une semaine, la caution posée avant
livraison peut avoir expiré à la reprise, et sa libération ou son encaissement
échouera. Surveille manuellement les locations longues tant que ce n'est pas
traité.
