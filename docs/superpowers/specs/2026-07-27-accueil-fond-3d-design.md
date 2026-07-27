# Page d'accueil : fond 3D animé et sections pleine largeur

**Date :** 2026-07-27
**Statut :** validé, prêt pour le plan d'implémentation

## Objectif

Donner à la page d'accueil un fond 3D vivant et une mise en page pleine largeur
inspirée des pages produit Apple, sans changer le thème bleu glacé existant et
sans toucher aux pages réservation et back-office.

## Problèmes actuels

1. **La page est serrée.** `main { max-width: 1080px }` dans `app/globals.css`
   s'applique à toutes les pages. L'accueil ne respire pas sur un grand écran.
2. **Le hero est vide.** `app/HeroMedia.js` référence `/images/hero-appartement.jpg`
   et `/videos/hero-ambiance.mp4`, absents de `public/`. Le composant se replie
   sur « rien afficher », laissant un trou à droite du titre.
3. **Le fond est statique.** Un dégradé CSS fixe, sans profondeur ni mouvement.

## Décisions de conception

| Sujet | Décision | Alternative écartée |
|---|---|---|
| Technique 3D | WebGL écrit à la main (shader) | Three.js / React Three Fiber (~600 Ko, 4 packages) ; CSS pur (pas assez 3D) |
| Portée | Accueil entière en sections pleine largeur | Hero seul ; tout le site |
| Interaction | Animation continue + parallaxe au scroll + suivi souris | Animation seule ; scénarisation forte au scroll |
| Composition du hero | Titre centré pleine hauteur, arguments en bandeau | 2 colonnes actuelles ; photo de Paris en fond |

## Architecture

### 1. `app/Backdrop3D.js` — le fond animé (nouveau)

Composant client autonome, monté une seule fois depuis `app/page.js`.

**Rendu**

- Un `<canvas>` en `position: fixed; inset: 0; z-index: -1; pointer-events: none`,
  donc immobile pendant que le contenu défile devant — c'est ce décalage qui
  produit la sensation de profondeur.
- Contexte `webgl`, un quad plein écran, un fragment shader.
- Trois nappes de bruit fractal (fbm) superposées, chacune à sa propre échelle,
  vitesse de dérive et facteur de parallaxe. Plus un halo lumineux mobile en
  partie haute.
- Palette dérivée du thème : fond `#dff2fa → #eaf6fb → #f6fbfd`, accents
  `--frost #bfe7f5` et `--cool #3fb6e0` à faible opacité. Aucune couleur
  nouvelle n'est introduite.
- Le contraste du fond reste faible pour que le texte `--navy` conserve un ratio
  de contraste supérieur à 7:1 partout.

**Uniforms**

| Nom | Contenu |
|---|---|
| `u_time` | Secondes écoulées depuis le montage |
| `u_res` | Largeur et hauteur du canvas en pixels |
| `u_scroll` | Progression de défilement de la page, normalisée 0→1 |
| `u_mouse` | Position du pointeur normalisée, lissée par interpolation |

**Performance et robustesse**

- `devicePixelRatio` plafonné à 1.5 sur ordinateur, 1.25 sur pointeur grossier.
- Boucle `requestAnimationFrame`, arrêtée sur `visibilitychange` quand l'onglet
  passe en arrière-plan, relancée au retour.
- Le suivi souris est désactivé si `(pointer: coarse)`.
- Le canvas est redimensionné via `ResizeObserver`, avec anti-rebond.
- Si `getContext("webgl")` renvoie `null` ou si la compilation du shader échoue,
  le composant ne rend rien : le dégradé CSS du `body` reste visible et la page
  fonctionne normalement.
- `prefers-reduced-motion: reduce` : une seule image est rendue au montage,
  aucune boucle d'animation, aucun écouteur de scroll ni de souris.
- Aucune dépendance npm ajoutée. Environ 200 lignes, ~6 Ko.

### 2. Pleine largeur sans régression

`main` conserve sa contrainte à 1080 px, qui reste correcte pour le tunnel de
réservation et le back-office. Les sections de l'accueil en sortent via une
classe dédiée :

```css
.bleed { width: 100vw; margin-left: calc(50% - 50vw); }
.bleed-inner { max-width: 1240px; margin: 0 auto; padding: 0 clamp(20px, 4vw, 48px); }
```

`body { overflow-x: clip }` empêche l'apparition d'une barre de défilement
horizontale. On utilise `clip` et non `hidden` : `hidden` créerait un conteneur
de défilement qui casserait le `position: sticky` du récapitulatif de la page
réservation (`.recap`, `globals.css`).

Aucune des 6 autres pages n'est modifiée.

### 3. Structure de l'accueil

| Section | Traitement |
|---|---|
| Hero | `min-height: 100svh`, contenu centré. Eyebrow, titre `clamp(44px, 9vw, 108px)`, sous-titre, bouton principal « Voir les climatiseurs » + lien secondaire « Comment ça marche », bandeau des 3 arguments, indicateur de défilement |
| Comment ça marche | Pleine largeur, les 3 étapes existantes sur une bande de verre dépoli |
| Nos modèles | Contenu et logique inchangés (alternance gauche/droite, stock, bouton Réserver), largeur portée à 1240 px |
| Réassurance | Bandeau 4 colonnes pleine largeur |
| CTA final | Centré, espacements généreux |

`100svh` et non `100vh` : sur Safari iPhone, `100vh` inclut la barre d'URL et
provoque un saut de mise en page au premier défilement.

Le composant `Reveal` existant est réutilisé pour les apparitions en
fondu-montée. Aucune nouvelle mécanique d'animation d'entrée.

### 4. Changements sur `app/page.js`

- Ajout de `<Backdrop3D />`.
- Le hero passe en composition centrée ; l'appel à `<HeroMedia />` est retiré et
  les 3 `div.hero-card` flottantes deviennent le bandeau d'arguments.
- Les sections reçoivent les classes `.bleed` / `.bleed-inner`.
- La requête Prisma, le calcul de disponibilité et les liens de réservation sont
  inchangés.

`app/HeroMedia.js` n'est plus importé. Le fichier n'est pas suivi par git : il
est **conservé sur le disque** plutôt que supprimé, car une suppression serait
irréversible. Sa suppression pourra être décidée séparément.

## Responsive

| Largeur | Comportement |
|---|---|
| ≥ 1200 px | Sections pleine largeur, contenu ramené à 1240 px, effet souris actif |
| 820 – 1200 px | Grilles fluides, contenu fluide, effet souris actif |
| < 820 px | 1 colonne partout, titre hero réduit, hero en `100svh`, pas d'effet souris, résolution du canvas réduite |

Toutes les tailles de police et tous les espacements verticaux du hero et des
titres de section sont exprimés en `clamp()`.

## Accessibilité

- `prefers-reduced-motion: reduce` respecté par le fond et par `Reveal`.
- Le canvas porte `aria-hidden="true"` et `pointer-events: none` : il est
  invisible pour les lecteurs d'écran et n'intercepte aucun clic.
- Contraste texte/fond vérifié sur les zones les plus claires et les plus
  sombres de l'animation.
- Le hero reste entièrement navigable au clavier ; les styles `:focus-visible`
  existants s'appliquent aux deux boutons.

## Vérification

1. `npm run build` passe.
2. `npm run test` passe (les tests portent sur `lib/`, non touché).
3. Contrôle visuel sur ordinateur (~1440 px) et sur mobile (~390 px) :
   pas de barre de défilement horizontale, hero plein écran sans saut au
   premier défilement, fond animé fluide.
4. Les pages `/reserver/[slug]`, `/reserver/confirmation/[reference]`,
   `/admin` et `/admin/produits` conservent leur largeur et leur mise en page.
5. Avec « Réduire les animations » activé : le fond est fixe, rien ne bouge.

## Hors périmètre

- Les pages réservation et back-office.
- Le contenu rédactionnel (textes des étapes, de la réassurance, du hero).
- Les photos produits et leur gestion.
- Toute nouvelle dépendance npm.
