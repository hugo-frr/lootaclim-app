# Mettre LOOTACLIM en ligne sur lootaclim.fr

État vérifié le 29/07/2026. À suivre dans l'ordre : chaque phase suppose la
précédente terminée.

---

## Ce qui bloque aujourd'hui

| # | Blocage | Conséquence si on ignore |
|---|---|---|
| 1 | `prisma/schema.prisma` est figé sur SQLite (`file:./dev.db`) | **Les réservations disparaissent à chaque déploiement.** Le disque de Vercel est effacé et n'est pas partagé entre serveurs |
| 2 | `lib/productImages.js` écrit dans `public/images/` à l'exécution | Toute photo envoyée depuis le back-office est perdue |
| 3 | `STRIPE_SECRET_KEY` est une clé `sk_test` | Aucun paiement réel n'est encaissé |
| 4 | Aucune page légale | Mentions légales **obligatoires en France** pour un site commercial ; CGV nécessaires pour vendre à des particuliers |
| 5 | 44 commits jamais poussés sur GitHub | Vercel n'a rien à déployer |
| 6 | `public/images/` n'est pas versionné | Aucune photo produit en ligne |
| 7 | Les 3 photos produit sont le même fichier, avec le logo RAKS | Les 3 modèles se ressemblent, et la photo appartient à un fabricant |

---

## Phase 1 — La base de données (le gros morceau)

Sans ça, rien d'autre ne sert.

1. **Créer une base PostgreSQL.** Le plus simple : dans le tableau de bord
   Vercel, onglet *Storage* → *Create Database* → *Postgres*. Une formule
   gratuite existe et suffit largement au démarrage.

2. **Changer le connecteur** dans `prisma/schema.prisma` :

   ```prisma
   datasource db {
     provider = "postgresql"
     url      = env("DATABASE_URL")
   }
   ```

3. **Ajouter `DATABASE_URL`** dans `.env` (valeur locale) et dans les variables
   d'environnement du projet Vercel (valeur de production).

4. **Rejouer les migrations** sur la nouvelle base :
   `npx prisma migrate deploy`

5. **Réinjecter les données de départ** : `npm run db:seed`, puis recréer le
   parc réel (machines, numéros de série, kits) via `npm run db:studio` ou le
   back-office.

> ⚠️ Les migrations existantes ont été écrites pour SQLite. Certaines peuvent
> échouer sur PostgreSQL, dont les types sont plus stricts. Prévoir de les
> reprendre — c'est le point le plus incertain de toute la mise en ligne.

---

## Phase 2 — Le stockage des photos

`lib/productImages.js` écrit sur le disque local. Sur Vercel c'est impossible.

Deux options :

- **Vercel Blob** — s'installe en quelques lignes, formule gratuite au
  démarrage. À privilégier.
- **Rien changer** et déposer les photos à la main dans `public/images/` avant
  chaque déploiement. Gratuit, mais le glisser-déposer du back-office ne
  marchera plus en ligne.

Dans les deux cas, **régler d'abord le problème des photos identiques** : les
5 fichiers de `public/images/` ont la même empreinte, et affichent le logo
RAKS d'un fabricant. Photographier les vraies machines (fond clair, lumière du
jour) comme le recommande le guide de lancement.

Puis versionner le dossier : `git add public/images/`

---

## Phase 3 — Pages légales

Obligatoires avant d'encaisser le moindre euro.

| Page | Contenu | Où |
|---|---|---|
| Mentions légales | Identité de l'entreprise, SIRET, hébergeur, contact | `/mentions-legales` |
| CGV / CGL | Caution, casse, annulation, retard de restitution | `/cgv` |
| Confidentialité (RGPD) | Données collectées, durée, droits | `/confidentialite` |

Partir d'un modèle (LegalPlace, Captain Contrat) et faire relire. Ajouter les
trois liens dans le pied de page (`app/layout.js`).

---

## Phase 4 — Envoyer le code et créer le projet

```bash
git push -u origin main
```

Puis sur **vercel.com** : *Add New* → *Project* → importer
`hugo-frr/lootaclim-app`. Next.js est détecté automatiquement, aucun réglage
de build à toucher.

**Variables d'environnement à saisir dans Vercel** (onglet *Settings* →
*Environment Variables*) — les mêmes que le `.env` local, plus `DATABASE_URL` :

```
DATABASE_URL          ADMIN_PASSWORD        SESSION_SECRET
STRIPE_SECRET_KEY     STRIPE_WEBHOOK_SECRET CRON_SECRET
SMTP_HOST             SMTP_PORT             SMTP_USER
SMTP_PASSWORD         EMAIL_FROM            ADMIN_NOTIFICATION_EMAIL
```

> **Coût** : le plan gratuit de Vercel interdit l'usage commercial. Pour un
> site qui encaisse des paiements, il faut le plan Pro, environ 20 €/mois.

---

## Phase 5 — Brancher le domaine

1. Dans Vercel : *Settings* → *Domains* → ajouter `lootaclim.fr` et
   `www.lootaclim.fr`. Vercel affiche les valeurs DNS exactes à recopier.
2. Dans le Panel Client **LWS** : *Nom de domaine* → *Zone DNS*.
   - Un enregistrement **A** sur `@` vers l'adresse IP donnée par Vercel
   - Un enregistrement **CNAME** sur `www` vers l'adresse donnée par Vercel
3. **Ne pas toucher aux enregistrements MX** : ce sont eux qui font marcher ta
   boîte mail `mail.lootaclim.fr`. Les supprimer couperait les emails de
   confirmation.
4. Compter de 15 minutes à quelques heures de propagation. Le certificat HTTPS
   est délivré automatiquement par Vercel.

---

## Phase 6 — Passer en paiement réel

1. Dans Stripe, quitter le **mode test** (bouton en haut à droite). Le passage
   en réel demande le SIRET et un IBAN.
2. Récupérer la clé `sk_live_...` et remplacer `STRIPE_SECRET_KEY` dans Vercel.
3. Créer un **nouveau webhook** pointant sur
   `https://lootaclim.fr/api/stripe/webhook`, récupérer son secret `whsec_...`
   et le mettre dans `STRIPE_WEBHOOK_SECRET`.
4. Vérifier que la tâche planifiée de pose des cautions tourne : elle est déjà
   déclarée dans `vercel.json` (`/api/cron/deposits`, tous les jours à 5 h) et
   protégée par `CRON_SECRET`.

---

## Phase 7 — Recette en ligne

Avant d'annoncer le site :

- [ ] Une réservation complète avec une **vraie carte**, puis remboursement
      depuis Stripe
- [ ] Les deux emails arrivent (client + notification admin), y compris vers
      une adresse Gmail ou Outlook — vérifier qu'ils ne tombent pas en
      indésirables
- [ ] `/admin` accessible avec le mot de passe, inaccessible sans
- [ ] La page d'accueil sur un vrai téléphone : vidéo fluide, texte lisible
- [ ] Les trois modèles affichent leur propre photo
- [ ] Les liens légaux répondent dans le pied de page

---

## Limite connue à surveiller

Les blocages de caution Stripe (empreintes bancaires) **expirent après environ
7 jours**. Pour une location de plus d'une semaine, la caution posée avant la
livraison peut avoir expiré au moment de la reprise, et sa libération ou son
encaissement échouera. Surveiller manuellement les locations longues tant que
ce n'est pas traité.
