# Étape 3 — Authentification et actions du back-office

**Date** : 12 juillet 2026
**Statut** : validé avec Hugo (voir décisions ci-dessous)

## Objectif

Protéger `/admin` par mot de passe et permettre de gérer l'activité sans Prisma
Studio : confirmer/annuler les demandes, affecter les machines, suivre les
livraisons, gérer le parc et éditer les modèles. Plus un kit de durcissement
léger issu des revues de l'étape 2.

## Décisions validées

| Sujet | Décision |
|---|---|
| Authentification | Mot de passe unique dans `.env` (`ADMIN_PASSWORD`) + cookie de session signé (`SESSION_SECRET`). Pas de librairie d'auth. |
| Session | Cookie signé HMAC-SHA256, httpOnly, valide 7 jours. Bouton « Se déconnecter ». |
| Protection | Middleware Next.js sur `/admin/*` (redirection vers `/admin/connexion`) + re-vérification dans chaque Server Action admin (défense en profondeur). |
| Sécurité par défaut | Sans `ADMIN_PASSWORD` configuré, l'admin est fermé avec un message explicatif — jamais ouvert par défaut. |
| Anti-force-brute | Après 5 échecs, chaque essai attend 3 s (compteur en mémoire par IP, fenêtre 15 min). |
| Périmètre back-office | Demandes (confirmer/annuler/affecter), livraisons (effectuée/échec), parc (statut + notes), modèles (description/prix/actif sur `/admin/produits`). |
| Interface | Colonne « Actions » dans les tableaux existants du `/admin` ; une seule nouvelle page (`/admin/produits`). Server Actions + revalidation. |
| Kit durcissement | `app/error.js` en français ; plafond de 3 demandes « En attente » par email dans le tunnel public. |
| Schéma de base | Aucun changement (les statuts existants suffisent). |

## 1. Session — `lib/session.js` (fonctions pures, Web Crypto)

Utilise l'API Web Crypto (`globalThis.crypto.subtle`), disponible à la fois dans
Node 20 (tests, actions) et dans le runtime edge du middleware.

- `signSession(expiresAtMs, secret)` → jeton `"<expiresAtMs>.<hmac hex>"`.
- `verifySession(token, secret, nowMs)` → `true` si la signature correspond ET
  que l'expiration n'est pas passée ; `false` pour tout le reste (jeton malformé,
  falsifié, expiré). Comparaison en temps constant.
- Cookie : nom `lc_admin`, `httpOnly`, `sameSite: "lax"`, `path: "/"`,
  `secure` en production, durée 7 jours.

## 2. Connexion — `/admin/connexion`

- Page avec un seul champ mot de passe (et un paramètre `?suivant=` pour revenir
  à la page demandée après connexion — validé : doit commencer par `/admin`,
  sinon ignoré, pour éviter toute redirection ouverte).
- Server Action `login` :
  1. Si `ADMIN_PASSWORD` ou `SESSION_SECRET` manquent dans l'environnement →
     message « Administration non configurée : voir la section Connexion du
     README » (fail closed).
  2. Anti-force-brute : compteur en mémoire par IP `{ tentatives, depuis }`,
     fenêtre glissante de 15 min ; à partir de 5 échecs, `await` de 3 s avant de
     répondre. (Limite assumée : compteur perdu au redémarrage, par instance —
     suffisant pour un site mono-instance.)
  3. Comparaison du mot de passe en temps constant.
  4. Succès → pose du cookie signé (expiration à J+7) puis `redirect(suivant)`.
     Échec → `{ error: "Mot de passe incorrect." }`.
- Server Action `logout` : suppression du cookie, redirection vers
  `/admin/connexion`. Bouton « Se déconnecter » dans l'en-tête du back-office.

## 3. Middleware — `middleware.js` (racine du projet)

- `matcher: ["/admin/:path*"]`.
- Laisse passer `/admin/connexion`.
- Lit le cookie `lc_admin`, le vérifie avec `verifySession` ; invalide ou absent
  → redirection `302` vers `/admin/connexion?suivant=<chemin demandé>`.
- Les Server Actions des pages `/admin` passent aussi par le middleware (ce sont
  des POST sur ces routes), et chaque action admin appelle en plus un helper
  `requireAdmin()` qui relit le cookie côté serveur et jette si invalide —
  double verrou volontaire.

## 4. Transitions — `lib/transitions.js` (fonctions pures, testées)

Le cycle de vie et ses garde-fous. Chaque fonction renvoie `null` (autorisé) ou
un message d'erreur en français ; `deliveryDoneEffects` renvoie les effets à
appliquer.

- `confirmError(booking)` : autorisé seulement depuis `PENDING`.
- `cancelError(booking)` : autorisé depuis `PENDING` ou `CONFIRMED` (jamais
  après livraison).
- `deliveryDoneEffects(delivery, booking)` :
  - livraison `DROPOFF` : exige livraison `SCHEDULED`, réservation `CONFIRMED`
    et machine affectée → effets `{ booking: "DELIVERED", unit: "RENTED" }` ;
  - reprise `PICKUP` : exige livraison `SCHEDULED` et réservation `DELIVERED`
    → effets `{ booking: "RETURNED", unit: "AVAILABLE" }`.
- Livraison « Échec » : `SCHEDULED → FAILED`, aucun effet de bord (l'opérateur
  replanifie à la main pour l'instant).
- `unitAssignmentError(booking, unit, unitBookings)` — affectation d'une machine :
  - réservation en `PENDING` ou `CONFIRMED` ;
  - `unit.productId === booking.productId` (l'invariant noté à l'étape 2) ;
  - machine ni `RETIRED` ni `MAINTENANCE` ;
  - aucun chevauchement avec les autres réservations bloquantes déjà affectées
    à cette machine — même modèle d'occupation qu'à l'étape 2 : les fenêtres
    `[début, fin + 1 jour de battement]` ne doivent pas se croiser.
- `unitStatusChangeError(unit, newStatus)` — changement manuel de statut du
  parc : uniquement entre `AVAILABLE`, `MAINTENANCE` et `RETIRED` (les statuts
  `RENTED`/`IN_TRANSIT` sont pilotés par les livraisons ; une machine en
  location doit d'abord être reprise).

## 5. Actions admin — `app/admin/actions.js`

Toutes commencent par `requireAdmin()`, s'exécutent dans une transaction quand
plusieurs lignes changent, recalculent leurs préconditions EN transaction
(mêmes réflexes qu'à l'étape 2), et terminent par `revalidatePath("/admin")`.

- `confirmBooking(id)` / `cancelBooking(id)` — via `confirmError`/`cancelError`.
- `assignUnit(bookingId, unitId)` — re-vérifie `unitAssignmentError` en
  transaction (les réservations de la machine sont relues) ; enregistre
  `booking.unitId`.
- `markDelivery(id, résultat)` — `résultat ∈ {DONE, FAILED}` ; pour `DONE`,
  applique atomiquement les effets de `deliveryDoneEffects` (livraison +
  réservation + machine).
- `setUnitStatus(unitId, statut)` et `saveUnitNotes(unitId, notes)` — via
  `unitStatusChangeError` ; notes limitées à 500 caractères.
- `updateProduct(id, champs)` — description (10 à 500 caractères), prix saisi
  en euros (converti en centimes, entre 1 € et 500 €/jour), actif (booléen).
  Le slug et le nom ne sont pas éditables (ils structurent les URLs et le seed).

Les erreurs de validation reviennent au formulaire concerné (même patron
`useFormState`/`{ error }` que le tunnel).

## 6. Interface

- **Tableau réservations** (`/admin`) : colonne Actions — pour `PENDING` :
  boutons Confirmer et Annuler ; pour `PENDING`/`CONFIRMED` sans machine : un
  `<select>` des machines affectables (options calculées côté serveur par
  réservation : bon modèle, libres sur les dates) + bouton Affecter ; pour
  `CONFIRMED` : Annuler. L'annulation passe par un petit composant client de
  confirmation (« Annuler la réservation LC-… ? »).
- **Tableau livraisons** : boutons Effectuée / Échec sur chaque ligne
  `SCHEDULED`. Une livraison non actionnable (préconditions non remplies, ex.
  livraison sans machine affectée) affiche l'explication renvoyée par l'action.
- **Tableau parc** : `<select>` de statut (3 valeurs manuelles) + champ notes
  + bouton Enregistrer par ligne.
- **`/admin/produits`** : un formulaire par modèle (description, prix €/jour,
  case Actif), lien « Modèles & prix » dans l'en-tête du back-office, à côté de
  « Se déconnecter ».
- L'en-tête admin (liens + déconnexion) apparaît sur `/admin` et
  `/admin/produits`, pas sur la page de connexion.

## 7. Kit de durcissement

- `app/error.js` — page d'erreur client en français (« Une erreur inattendue
  est survenue »), bouton « Réessayer » (le `reset()` de Next), lien accueil.
- Plafond de demandes : dans `createBooking` (tunnel public), en transaction :
  3 réservations `PENDING` maximum par email → au-delà,
  `BookingError` « Vous avez déjà 3 demandes en attente. Attendez leur
  confirmation ou contactez-nous. »

## 8. Configuration et documentation

- `.env.example` committé (placeholders + commentaires) ; `.env` réel local et
  ignoré. `SESSION_SECRET` : 64 caractères hexadécimaux aléatoires (commande
  fournie dans le README).
- README : section « 🔐 Connexion au back-office » (créer `.env`, choisir le
  mot de passe, générer le secret), feuille de route étape 3 cochée, note sur
  le plafond de demandes.

## 9. Tests

- `lib/session.test.js` : aller-retour signature/vérification, jeton falsifié,
  jeton expiré, jeton malformé, comparaison insensible au timing (forme).
- `lib/transitions.test.js` : chaque transition autorisée et refusée,
  effets de livraison/reprise, affectation (mauvais modèle, machine en
  maintenance, chevauchement avec battement, cas valide), statuts manuels du
  parc.
- Vérification HTTP de bout en bout à l'implémentation : `/admin` sans cookie →
  redirection ; connexion avec mauvais puis bon mot de passe ; action admin ;
  déconnexion ; plafond de 3 demandes dans le tunnel.

## Hors périmètre (étapes suivantes)

- Comptes multiples, rôles.
- Vérification d'email des clients, références non devinables (étapes 4-5,
  toujours bloquants avant mise en ligne publique).
- Paiement Stripe (étape 4), emails automatiques (étape 5).
- Replanification d'une livraison échouée (à la main via Prisma Studio pour
  l'instant).
