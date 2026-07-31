# Comptes utilisateurs et rôles — conception

**Date :** 2026-07-31
**Statut :** en attente de validation

## Pourquoi

Aujourd'hui, **un seul mot de passe** ouvre tout `/admin` : le chiffre
d'affaires, les cautions, les remboursements Stripe, les prix. Le jour où un
livreur doit marquer une livraison, il faut lui donner ce mot de passe — et il
voit tout.

Deuxième effet : `UnitEvent` enregistre **quand** et **quoi**, jamais **qui**.
La traçabilité demandée est donc incomplète.

## Les trois rôles

| Rôle | Ce qu'il peut faire | Ce qu'il ne voit pas |
|---|---|---|
| **ADMIN** | Tout | — |
| **MAGASINIER** | Stock, machines, kits, étiquettes, scan, réceptions | Chiffre d'affaires, prix de vente, cautions, remboursements, enquête |
| **LIVREUR** | Scan, marquer livrée ou récupérée, voir ses tournées du jour avec adresses et téléphones | Tout le reste : stock, prix, argent, clients hors tournée |

Le point qui compte vraiment : **un livreur ne doit jamais pouvoir encaisser
une caution, rembourser, ni consulter le chiffre d'affaires.**

## Schéma

```prisma
model User {
  id           String   @id @default(cuid())
  name         String
  email        String   @unique
  passwordHash String   // PBKDF2-SHA256 : "iterations.sel.empreinte"
  role         String   // ADMIN | MAGASINIER | LIVREUR
  active       Boolean  @default(true)
  createdAt    DateTime @default(now())
  lastLoginAt  DateTime?
  events       UnitEvent[]
}
```

Et sur l'existant :

```prisma
model UnitEvent {
  // …champs actuels
  user   User?   @relation(fields: [userId], references: [id], onDelete: SetNull)
  userId String? // null pour les événements antérieurs aux comptes
}
```

`onDelete: SetNull` : supprimer un compte ne doit **jamais** effacer
l'historique des machines. On garde la trace, on perd seulement le nom.

## Mots de passe

**PBKDF2-SHA256 via l'API Web Crypto**, comme `lib/session.js` le fait déjà
pour signer les sessions. Aucune dépendance ajoutée, et ça fonctionne aussi
bien dans Node que dans le runtime edge du middleware.

Stockage : `iterations.sel.empreinte`, en hexadécimal. Jamais le mot de passe
en clair, évidemment.

## Sessions

Le jeton passe de `expiration.signature` à `identifiant.expiration.signature`.

Répartition des contrôles :

- **Le middleware** (runtime edge, sans accès à la base) vérifie seulement que
  la session est **valide et non expirée**.
- **Les pages et actions** (runtime Node) relisent le rôle **en base** à chaque
  requête.

Conséquence voulue : retirer un rôle à quelqu'un prend effet **immédiatement**,
sans attendre l'expiration de sa session. Un rôle gravé dans le jeton resterait
valable sept jours.

## ⚠️ Garde-fou anti-enfermement

Basculer l'authentification sur une base de comptes comporte un risque réel :
si la création du premier compte échoue en production, **plus personne ne peut
entrer**.

`ADMIN_PASSWORD` est donc **conservée** comme accès de secours : se connecter
sans email, avec ce seul mot de passe, ouvre une session administrateur. C'est
volontaire, documenté, et ça garantit qu'Hugo ne peut jamais être verrouillé
hors de son propre système.

## Architecture

| Fichier | Rôle |
|---|---|
| `lib/password.js` + tests | Hachage et vérification PBKDF2. Pur, testable |
| `lib/roles.js` + tests | Matrice des permissions : `can(role, action)`. Pur, testable |
| `lib/session.js` | Étendu pour porter l'identifiant utilisateur |
| `app/admin/auth.js` | `requireRole(...)` en plus de `requireAdmin()` |
| `app/admin/equipe/page.js` | Gestion des comptes : créer, changer le rôle, désactiver |
| `app/admin/AdminHeader.js` | N'affiche que les liens permis |
| `middleware.js` | Inchangé dans son principe |

## Étapes

1. `lib/password.js` et `lib/roles.js`, en TDD
2. Le modèle `User`, la migration, et le lien vers `UnitEvent`
3. Session étendue, `requireRole`, connexion par email
4. Page de gestion de l'équipe
5. Application des permissions sur chaque page et chaque action
6. Recette : chaque rôle voit ce qu'il doit voir, et rien d'autre

## Hors périmètre

- Réinitialisation de mot de passe par email — à ajouter si l'équipe grandit.
- Journal des connexions.
- Authentification à deux facteurs.
