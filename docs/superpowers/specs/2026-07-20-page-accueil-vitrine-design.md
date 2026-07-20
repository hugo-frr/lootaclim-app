# Page d'accueil — vitrine animée

## Objectif

Remplacer le placeholder actuel de `/` ("la vitrine 3D animée sera intégrée
ici…") par une vraie page d'accueil complète, avec un effet de profondeur
("3D-style") au niveau du hero, dans le style déjà en place sur le reste du
site (palette bleu glacier/navy, cartes en verre dépoli, `Space Grotesk` +
`Inter`).

## Décisions validées

- **Pas de vraies photos pour l'instant** — aucune photo produit n'existe
  dans le projet (`public/` est vide, le catalogue affiche un 📷 en
  attendant). Le design repose entièrement sur des formes/couleurs/cartes,
  pas sur de l'illustration produit. Le jour où de vraies photos arrivent,
  elles s'intègrent ailleurs (catalogue) sans remettre en cause cette page.
- **Pas de vrai rendu 3D (WebGL)** — irréaliste sans modèles 3D des vraies
  machines. L'effet "3D" vient de la superposition de cartes avec ombres
  portées et d'un mouvement de flottement doux, pas d'une scène 3D.
- **Style validé via le compagnon visuel** (3 maquettes comparées) :
  **cartes en apesanteur** — pas d'icône de climatiseur, le hero affiche le
  titre + 3 petites cartes (livraison 24h, prix dès 12€, sans engagement)
  empilées avec une légère rotation et des ombres, qui donnent l'impression
  de flotter au-dessus du fond.
- **Page complète**, 5 sections (voir ci-dessous), pas juste le hero.
- **Animations : rester simple** — flottement continu léger (CSS) + apparition
  en fondu/glissement au scroll (IntersectionObserver). **Pas** d'effet
  "cartes qui suivent la souris" (retenu comme option, écarté : plus de code
  pour un gain visuel jugé marginal par Hugo).
- **Aucune nouvelle dépendance npm** — CSS + un petit composant client pour
  le scroll-reveal, cohérent avec le reste du projet (déjà zéro librairie UI).
- **Respect de `prefers-reduced-motion`** — flottement et fondu désactivés
  si l'utilisateur l'a demandé au niveau système.

## Structure de la page (`app/page.js`)

1. **Hero** — titre actuel ("L'été à Paris, enfin frais.") + sous-texte +
   bouton "Voir les climatiseurs" (inchangés dans l'esprit), avec les 3
   cartes flottantes en arrière-plan/à côté :
   - 🚚 Livraison 24h — Paris & petite couronne
   - 💶 dès 12€ / jour — dégressif
   - ✓ Sans engagement — caution simple
2. **Comment ça marche** — 3 étapes numérotées (réutilise `.step-num`, déjà
   dans `globals.css`, utilisé par le tunnel de réservation) : Choisissez
   votre modèle → Livraison en 24h → On reprend en fin de location.
3. **Aperçu des modèles** — les 3 produits actifs, requête Prisma allégée
   (nom, prix, surface max, stock disponible, slug — même logique que
   `/catalogue` mais sans description/images), mini-cartes cliquables vers
   `/reserver/<slug>`.
4. **Réassurance** — bandeau de 4 arguments courts (Paris & petite
   couronne, sans travaux, caution simple, annulation flexible).
5. **CTA final** — rappel + bouton vers `/catalogue`.

## Technique

- `app/page.js` reste un Server Component (récupère les données produits
  directement, comme `/catalogue`).
- Nouveau petit composant client `app/Reveal.js` : wrapper générique
  (`"use client"`) qui ajoute une classe CSS quand la section entre dans le
  viewport (`IntersectionObserver`), utilisé autour de chaque section 2 à 5.
  Le hero n'en a pas besoin (visible dès le chargement).
- Nouvelles classes CSS dans `app/globals.css` : cartes flottantes du hero
  (`@keyframes float`, translateY oscillant, délais décalés par carte),
  classes `.reveal` / `.reveal.visible` (opacity + translateY avec
  transition), bandeau réassurance, grille "comment ça marche".
- `@media (prefers-reduced-motion: reduce)` désactive `animation` et
  `transition` sur ces éléments.

## Hors périmètre

- Vraies photos produits (catalogue existant, pas cette page).
- Rendu 3D WebGL.
- Effet de parallax à la souris (écarté, voir Décisions validées).
- Modification du contenu de `/catalogue` ou du tunnel de réservation.

## Vérification

Pas de logique métier ici (page presque entièrement présentationnelle) :
`npm run build` doit passer, et vérification visuelle manuelle dans le
navigateur (démarrer `npm run dev`, ouvrir `/`) — pas de nouveaux tests
`lib/*.test.js`, cohérent avec le reste du projet (les pages ne sont pas
couvertes par `npm test`, seule la logique métier dans `lib/` l'est).
