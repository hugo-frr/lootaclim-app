# Fusion du catalogue dans la page d'accueil

## Objectif

Éliminer la redondance entre `/` (qui montre déjà les 3 modèles) et
`/catalogue` (qui les montre à nouveau, en plus détaillé). Un seul site à
une page : l'accueil devient LE catalogue complet, `/catalogue` disparaît.

## Décisions validées

- **Pas de vraies photos aujourd'hui** — Hugo compte fournir des visuels
  détourés des machines plus tard. La section produits doit être **prête à
  les recevoir sans retouche de code** : chaque modèle affiche déjà
  `p.images[0]` (relation Prisma existante, déjà exploitable depuis le
  formulaire "Nouveau modèle" du back-office) s'il existe, sinon un
  bloc "photo à venir" clairement identifiable comme provisoire.
- **Fusion complète, pas juste un aperçu allégé** — la section "Nos
  modèles" de l'accueil remplace la grille compacte actuelle par les
  fiches complètes (nom, description, caractéristiques, prix, stock,
  bouton Réserver conditionnel) qui vivaient jusqu'ici sur `/catalogue`.
- **Mise en page validée via le compagnon visuel** (2 options comparées) :
  **rangées pleine largeur en quinconce** — une rangée par modèle, photo à
  gauche puis à droite en alternance, plus éditorial que la grille à 3
  colonnes actuelle.
- **`/catalogue` redirige (301) vers `/#modeles`** — la route disparaît
  (`app/catalogue/page.js` supprimé), mais aucun lien externe ou favori ne
  casse. Redirection au niveau de `next.config.js` (`redirects()`), pas
  un composant React qui redirige.
- **Tous les liens internes vers `/catalogue` sont mis à jour** pour
  pointer directement vers la nouvelle section (`/#modeles` depuis une
  autre page, `#modeles` depuis l'accueil elle-même) : menu (`app/layout.js`),
  boutons "Voir les climatiseurs" de l'accueil, page de confirmation de
  réservation, page de réservation d'un modèle indisponible.
- **Défaut de scope inchangé** : cette passe ne touche que l'accueil et ces
  liens — pas le tunnel de réservation, pas le back-office.

## Détails techniques

- **Requête produits** (`app/page.js`) : ajoute `images: { orderBy: {
  position: "asc" } }` à la requête existante (déjà utilisée telle quelle
  par `app/catalogue/page.js`), en plus de `units` déjà présent.
- **Bouton "Réserver" conditionnel** : identique à la règle actuelle du
  catalogue — visible seulement si
  `p.units.some((u) => !["RETIRED", "MAINTENANCE"].includes(u.status))`.
- **`#modeles`** : ancre posée sur le conteneur de la section, avec
  `scroll-margin-top` en CSS pour que le menu fixe (`position: fixed`) ne
  cache pas le haut de la section au moment du saut.
- **Défilement doux** : `scroll-behavior: smooth` sur `html`, activé
  uniquement sous `@media (prefers-reduced-motion: no-preference)` —
  cohérent avec le respect de `prefers-reduced-motion` déjà en place sur
  cette page (spec du 20/07, page d'accueil vitrine).
- **Correction connexe repérée en préparant cette spec** :
  `app/admin/actions.js` appelle `revalidatePath("/catalogue")` après
  modification/création d'un modèle (`updateProduct`, `createProduct`) —
  route qui va disparaître. À remplacer par `revalidatePath("/")` pour que
  les changements de prix/description soient bien reflétés immédiatement
  sur l'accueil.

## Hors périmètre

- Édition d'image sur un modèle *existant* depuis le back-office (le champ
  `imageUrl` n'existe aujourd'hui qu'à la création d'un modèle,
  `createProduct`) — pas demandé ici, à traiter séparément le jour où de
  vraies photos arrivent si besoin.
- Tunnel de réservation, back-office, autres pages.
- Vraies photos détourées elles-mêmes (pas encore disponibles).

## Vérification

Page presentationnelle (comme la précédente spec accueil) : `npm run
build` + `npm test` (74/74, aucune régression attendue sur `lib/`) +
vérification manuelle dans le navigateur (accueil complète, ancre
`#modeles`, redirection `/catalogue`, liens mis à jour). Pas de nouveau
`*.test.js`.
