# Manuel : mettre à jour lootaclim.fr

Comment publier une modification, et quoi faire quand ça se passe mal.

---

## Le cycle normal

Tu ne « déploies » jamais à la main. **Vercel publie automatiquement tout ce qui
arrive sur la branche `main` de GitHub.** Ton travail s'arrête à `git push`.

```bash
# 1. Voir le site en local, avec tes modifications
npm run dev
#    → http://localhost:3000

# 2. Une fois satisfait, arrêter le serveur (Ctrl+C) et vérifier
npm test          # la logique métier est-elle toujours correcte ?
npm run build     # le site compile-t-il ?

# 3. Publier
git add .
git commit -m "décris ce que tu as changé"
git push
```

Vercel démarre alors tout seul. Compte **2 à 3 minutes**. Tu suis l'avancement
dans l'onglet **Deployments** de ton projet.

> ⚠️ **Ne lance jamais `npm run build` pendant que `npm run dev` tourne.** Les
> deux écrivent dans le même dossier `.next/`, et ton serveur local se met à
> renvoyer des erreurs 500 incompréhensibles. Arrête toujours `npm run dev`
> avant de compiler. Si ça t'arrive : `Ctrl+C`, puis relance `npm run dev`.

---

## Avant de pousser : les deux questions à se poser

**1. Est-ce que `npm test` passe ?**
122 tests vérifient les calculs de prix, les disponibilités, les dates et la
validation du formulaire. S'ils échouent, **ne pousse pas** : tu casserais des
réservations.

**2. Est-ce que `npm run build` réussit ?**
Si la compilation échoue chez toi, elle échouera chez Vercel. Autant le
découvrir en 30 secondes plutôt qu'en 3 minutes.

---

## Quand le déploiement échoue

Vercel affiche le déploiement en **rouge**. **Le site en ligne ne change pas** :
l'ancienne version reste servie. Tu n'as rien cassé pour tes visiteurs.

1. Clique sur le déploiement rouge → onglet **Building** ou **Logs**.
2. Descends jusqu'à la **première ligne rouge** — les suivantes n'en sont que
   les conséquences.
3. Copie ce journal et envoie-le-moi. C'est comme ça qu'on a trouvé les deux
   pannes précédentes en une ligne chacune.

Les deux erreurs les plus fréquentes :

| Message | Cause |
|---|---|
| `Environment variable not found` | Une variable manque dans Vercel → *Settings* → *Environment Variables* |
| `Module not found` | Un fichier importé n'existe pas, ou son nom a une majuscule différente |

---

## Revenir en arrière (le filet de sécurité)

Tu as publié quelque chose de cassé, et le site en ligne est abîmé. **Ne
cherche pas à corriger dans l'urgence.**

Vercel → **Deployments** → trouve le dernier déploiement qui marchait →
menu `…` → **Promote to Production**.

Le site revient à cette version en **quelques secondes**. Tu corriges ensuite
tranquillement.

> ⚠️ **Une exception majeure.** Revenir en arrière sur le code **ne défait pas
> une migration de base de données**. Si ta modification a supprimé une colonne,
> l'ancienne version du code ne la retrouvera pas. C'est la seule opération
> vraiment irréversible du projet — voir la section suivante.

---

## Les cas particuliers

### Tu as modifié `prisma/schema.prisma`

C'est le cas le plus délicat : tu changes la **structure** de la base.

```bash
npx prisma migrate dev --name decris_le_changement
```

Cela crée un fichier de migration et l'applique à ta base locale. **Commite ce
fichier** avec ton code : c'est lui qui appliquera le changement en production.

En production, les migrations s'appliquent **automatiquement** au déploiement,
via `scripts/migrate-production.mjs`. Elles ne s'appliquent qu'à la vraie
production, jamais depuis une branche d'essai.

> ⚠️ **Une migration ne se rembobine pas.** Réfléchis à deux fois avant de
> supprimer une colonne ou une table : les données qu'elle contient sont
> perdues définitivement. En cas de doute, demande-moi.

### Tu as ajouté une variable d'environnement

1. Ajoute-la dans ton `.env` local.
2. Ajoute-la aussi dans Vercel → *Settings* → *Environment Variables*.
3. **Redéploie.** Une variable ajoutée ne s'applique **pas** au site déjà en
   ligne : elle est figée au moment de la compilation. Onglet *Deployments* →
   le dernier → `…` → **Redeploy**.

### Tu as ajouté des photos

Dépose-les dans `public/images/`, puis :

```bash
git add public/images/
git commit -m "photos : ..."
git push
```

**Vercel ne sert que ce qui est dans le dépôt.** Une photo posée sur ton disque
sans être commitée n'existera jamais en ligne.

Pour lier une photo à un modèle, passe par `/admin/produits`. Attention : le
glisser-déposer **ne fonctionne pas en ligne** (Vercel efface les fichiers
écrits pendant l'exécution). Dépose les photos par git, comme ci-dessus.

### Tu veux changer la vidéo d'accueil

Ne remplace **jamais** `public/videos/hero-clim.mp4` directement : elle est
réencodée spécialement pour le défilement. La marche à suivre est dans
`public/videos/LISEZMOI.md`.

---

## Les quatre choses à ne jamais faire

### 1. `npm run db:seed` maintenant que le site est en ligne

Cette commande **efface tout et remet les données de démonstration**. Lancée
aujourd'hui, elle supprimerait les réservations de tes vrais clients.

Ta base locale et ta base de production sont **la même**. Tant que ce n'est pas
séparé, considère cette commande comme interdite.

### 2. Toucher aux enregistrements mail dans la zone DNS de LWS

| Type | Nom | Valeur |
|---|---|---|
| `MX` | `@` | `10 mail.lootaclim.fr` |
| `A` | `mail` | `193.203.239.99` |
| `TXT` | `@` | `v=spf1 mx:lootaclim.fr a:mail.lootaclim.fr a:mailphp.lws-hosting.com -all` |

En supprimer un coupe les emails de confirmation — et **ça ne se voit pas** :
le site continue de fonctionner, mais tes clients ne reçoivent plus rien.

### 3. Modifier des fichiers directement sur GitHub

L'interface de GitHub permet d'éditer un fichier dans le navigateur. Ça part
directement en production **sans que rien ne soit testé**. Passe toujours par
ton ordinateur.

### 4. Committer le fichier `.env`

Il contient tes mots de passe, tes clés Stripe et l'accès à ta base. Il est
déjà exclu par `.gitignore` — ne l'en sors jamais. Le fichier `.env.example`
existe pour documenter les variables **sans leurs valeurs**.

---

## Aide-mémoire

| Je veux… | Commande |
|---|---|
| Voir le site en local | `npm run dev` |
| Vérifier la logique métier | `npm test` |
| Vérifier que ça compile | `npm run build` |
| Voir / corriger les données | `npm run db:studio` |
| Publier | `git add .` puis `git commit -m "..."` puis `git push` |
| Voir ce que je m'apprête à publier | `git status` |
| Annuler mes modifications non commitées | `git checkout -- .` |

**Adresses utiles**

- Le site : https://www.lootaclim.fr
- Déploiements : tableau de bord Vercel → *Deployments*
- Base de données : console Neon → *Data Editor*
- Back-office : https://www.lootaclim.fr/admin

---

## En cas de doute

Le site en ligne ne change **que** quand tu fais `git push`. Tant que tu n'as
pas poussé, tu peux tout casser en local sans aucun risque pour tes clients.

Et si quelque chose part de travers en production, la première chose à faire
n'est jamais de corriger dans l'urgence : c'est de **remettre la version
précédente** (voir plus haut). Tu répares ensuite, calmement.
