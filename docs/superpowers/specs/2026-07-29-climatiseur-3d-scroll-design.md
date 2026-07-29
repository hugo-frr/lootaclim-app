# Climatiseur 3D animé au défilement

**Date :** 2026-07-29
**Statut :** validé, prêt pour le plan d'implémentation
**Remplace partiellement :** `2026-07-27-accueil-fond-3d-design.md` (le fond de givre est conservé, mais déplacé dans la scène Three.js)

## Objectif

Faire du climatiseur le fil conducteur visuel de la page d'accueil : un objet 3D
qui reste à l'écran et se transforme section après section pendant que le texte
défile, sur le principe des pages produit d'Apple. Il tourne, se met en marche,
souffle de l'air, puis s'ouvre en vue éclatée pour expliquer son fonctionnement.

## Décisions de conception

| Sujet | Décision | Alternative écartée |
|---|---|---|
| Technique | Three.js, 3D temps réel | Séquence d'images pré-rendue (trajet figé, 3–8 Mo) ; climatiseur sculpté dans le shader (pas reconnaissable) |
| Origine du modèle | Construit en code à partir de primitives | Génération IA depuis photo ; modèle libre téléchargé — les deux produisent un bloc soudé, sans hélice animable ni façade ouvrable |
| Mise en scène | Vedette fixée à l'écran, se transforme au fil des sections | Décor discret en arrière-plan ; scène unique dans le hero |
| Explication | Vue éclatée avec étiquettes de texte | Carrosserie translucide sans texte ; pas de vue interne |

**Renversement assumé d'une décision antérieure.** Le spec du 27/07 écartait
Three.js pour son poids. La demande a changé : une hélice qui tourne et une
façade qui s'ouvre ne sont réalisables ni avec un shader, ni avec un modèle
importé. Le coût en poids est accepté en connaissance de cause.

## Architecture

### Un seul contexte WebGL

Aujourd'hui `app/Backdrop3D.js` occupe un canvas pour le fond de givre. Faire
cohabiter un second canvas Three.js doublerait le coût de rendu par image.

Le fond de givre devient donc l'arrière-plan de la scène Three.js : le même
fragment shader, appliqué à un quad plein écran rendu en premier, sans test de
profondeur. Un seul canvas, un seul contexte.

- Le code GLSL déménage de `app/Backdrop3D.js` vers `lib/frostShader.js`, d'où
  il est importé par la scène. Aucune ligne de shader n'est réécrite.
- `app/Backdrop3D.js` est **supprimé** (il est commité, donc récupérable dans
  l'historique git).
- `lib/backdrop.js` est **conservé** : `renderScale`, `scrollProgress`, `lerp`
  et `pointerToUv` restent utilisés par la nouvelle scène, qui garde la réaction
  du fond au défilement et à la souris. En revanche `createProgram` devient
  inutile — Three.js compile ses propres programmes — et est retiré avec ses
  quatre tests.
- Repli si Three.js ne se charge pas ou si WebGL est indisponible : le dégradé
  CSS du `body`, comme aujourd'hui.

### Découpage des fichiers

| Fichier | Responsabilité |
|---|---|
| `lib/acTimeline.js` | **Cœur testable.** Défilement → état de la scène. Fonctions pures, aucune dépendance à Three.js ni au DOM. |
| `lib/acTimeline.test.js` | Tests `node:test` du précédent |
| `lib/frostShader.js` | Sources GLSL du fond de givre, extraites de `Backdrop3D.js` |
| `lib/acModel.js` | Construction de la géométrie du climatiseur, pièce par pièce. Reçoit `THREE` en argument pour ne pas imposer l'import à `lib/`. |
| `app/AcScene.js` | Composant client : canvas, chargement différé de Three.js, boucle de rendu, écouteurs |
| `app/AcLabels.js` | Les étiquettes de la vue éclatée |

### `lib/acTimeline.js` — l'état de la scène

Le découpage en étapes est calé sur la position réelle des sections, mesurée au
montage et à chaque redimensionnement, et non sur une fraction arbitraire de la
hauteur totale : le nombre de modèles au catalogue fait varier la longueur de la
page.

```
stageAt(scrollY, boundaries) -> { stage: number, local: number }
```

`boundaries` est le tableau croissant des `offsetTop` des cinq sections.
`local` est la progression 0→1 à l'intérieur de l'étape courante.

```
sceneState(stage, local, { coarsePointer }) -> {
  x, y,            // position ; 0 = centre de l'écran, ±1 = bord gauche/droit
  scale,
  spin,            // rotation propre additionnelle, en tours
  explode,         // 0 fermé, 1 éclaté
  fanSpeed,        // 0 à 1
  airflow,         // débit d'émission des particules, 0 à 1
  hoseDeploy,      // 0 gaine repliée, 1 déployée vers la fenêtre
  labels,          // opacité des étiquettes, 0 à 1
  dim              // effacement au profit du texte, 0 à 1
}
```

```
timelineState(scrollY, boundaries, options)   // composition des deux
particleCount(coarsePointer) -> number        // 900 sur ordinateur, 300 sur mobile
easeInOut(t) -> number
```

### Le scénario

| Étape | Section | État |
|---|---|---|
| 0 | Hero | Centrée, échelle pleine, rotation lente continue. Éteinte : `fanSpeed` et `airflow` à 0. |
| 1 | Comment ça marche | Démarrage : `fanSpeed` et `airflow` montent de 0 à 1, `hoseDeploy` de 0 à 1. |
| 2 | Nos modèles | Glisse vers la gauche (`x` → −0.55), `scale` → 0.75, `dim` → 0.45. Continue de tourner et de souffler à mi-régime. |
| 3 | Réassurance | Se recentre, `explode` 0 → 1, `labels` 0 → 1, `fanSpeed` retombe à 0.4. |
| 4 | CTA final | `explode` et `labels` reviennent à 0, recentrage complet, dernier souffle (`airflow` bref à 1). |

Sur pointeur grossier (mobile), `x` reste à 0 à toutes les étapes et `dim` est
relevé : la machine passe derrière le texte au lieu de se déplacer à côté.

### `lib/acModel.js` — la machine

Signature : `buildAcUnit(THREE) -> { root, parts, anchors }`.

- `root` : le `Group` à ajouter à la scène
- `parts` : références nommées aux pièces animables — `shell`, `frontPanel`,
  `grille`, `fan`, `panel`, `hose`, `wheels`
- `anchors` : quatre points d'accroche des étiquettes, en coordonnées locales —
  `{ id, position: Vector3 }` avec les identifiants `intake`, `circuit`,
  `output` et `exhaust`

Pièces et méthode de construction :

| Pièce | Construction |
|---|---|
| Caisson | `Shape` à coins arrondis, `ExtrudeGeometry` avec biseau |
| Façade | Même profil, plus fine — c'est elle qui s'écarte en vue éclatée |
| Grille | Lamelles fines en `InstancedMesh` |
| Hélice | 5 pales extrudées sur un moyeu cylindrique, rotation sur son axe |
| Panneau de commande | Petit rectangle arrondi sombre, diode en matériau émissif |
| Roulettes | 4 cylindres aux angles inférieurs |
| Gaine | `TubeGeometry` le long d'une `CatmullRomCurve3` ; le déploiement interpole les points de contrôle |

Matériaux : `MeshPhysicalMaterial` blanc laqué avec `clearcoat` pour la
carrosserie, gris anthracite mat pour la grille et le panneau.

Éclairage par environnement procédural : `buildStudioEnvironment(THREE)`
construit une petite scène de panneaux émissifs — un studio photo miniature —
que `PMREMGenerator.fromScene()` transforme en carte d'environnement. C'est le
rendu « photo produit » sans aucun fichier de texture à télécharger. On
n'utilise **pas** `RoomEnvironment` de `three/examples/jsm` : le chemin
d'import et la signature de cet utilitaire ont changé entre versions de Three,
alors que le noyau de `three` est stable. `transmission` (verre réel) est
écarté : trop coûteux sur mobile.

### Le souffle d'air

Un `THREE.Points` de `particleCount()` particules, positions et durées de vie
dans des `Float32Array` mis à jour sur le processeur. Les particules naissent
devant la grille, dérivent vers le haut en s'évasant, puis s'éteignent. Le débit
d'émission suit `airflow`. Couleur `--cool #3fb6e0` en transparence additive.

### Les étiquettes

Trois textes courts : *air chaud aspiré*, *refroidi par le circuit*, *soufflé
frais*, plus *air chaud évacué par la fenêtre* sur la gaine.

Ce sont de **vrais éléments HTML**, jamais des textures : ils restent nets à
tout niveau de zoom et sont lus par les lecteurs d'écran.

`app/AcLabels.js` rend une liste `<ul>` placée dans la section réassurance.
Deux régimes :

- **Scène 3D active** : la liste passe en positionnement absolu, chaque élément
  étant placé à chaque image par projection de son point d'accroche 3D vers les
  coordonnées écran, avec l'opacité `labels`.
- **Scène absente** (WebGL indisponible, Three.js non chargé, animations
  réduites) : la liste reste dans le flux normal et s'affiche comme une liste
  ordinaire. L'information n'est jamais perdue.

## Performance

- `three` est chargé par `import()` dynamique **dans l'effet**, après le premier
  affichage. Le texte du hero, rendu côté serveur, reste lisible immédiatement ;
  la 3D apparaît en fondu une fraction de seconde plus tard.
- Résolution de rendu plafonnée en réutilisant `renderScale` de
  `lib/backdrop.js` (1.5 sur ordinateur, 1.25 sur mobile).
- Boucle arrêtée quand l'onglet passe en arrière-plan.
- Sur mobile : 300 particules au lieu de 900, `clearcoat` désactivé, ombres
  absentes (aucune ombre portée n'est utilisée, sur aucune plateforme).
- `antialias` activé sur ordinateur uniquement.

### Piège de nettoyage — à ne pas reproduire

Le composant précédent appelait `WEBGL_lose_context.loseContext()` au
démontage. En mode strict de React, actif en développement, le composant est
démonté puis remonté aussitôt, et le remontage récupérait un contexte mort
(voir le correctif `eaf0836`).

La scène Three.js doit donc, au démontage : arrêter la boucle, retirer les
écouteurs, appeler `dispose()` sur les géométries, les matériaux, la cible de
rendu PMREM et le `WebGLRenderer` — mais **jamais** `renderer.forceContextLoss()`.

## Accessibilité

- Le canvas porte `aria-hidden="true"` et `pointer-events: none`.
- Les étiquettes sont du texte réel, présent dans le DOM dans les deux régimes.
- `prefers-reduced-motion: reduce` : une seule image est rendue — machine fermée,
  de trois-quarts, immobile — sans boucle, sans particules, sans écouteur de
  défilement. Les étiquettes s'affichent en liste dans le flux normal.
- Le contraste du texte de la page reste vérifié : la machine s'efface (`dim`)
  sous les blocs de texte au lieu de passer derrière à pleine opacité.

## Vérification

1. `npm run build` passe, et la taille de `First Load JS` de la route `/` est
   relevée avant/après pour mesurer le coût réel de Three.js.
2. `npm test` passe, tests de `lib/acTimeline.js` compris.
3. Contrôle visuel sur ordinateur (~1440 px) : les cinq scènes s'enchaînent sans
   à-coup, le texte reste lisible à tout moment du défilement.
4. Contrôle visuel sur mobile (~390 px) : machine centrée derrière le texte,
   défilement fluide, pas de surchauffe perceptible.
5. Avec « Réduire les animations » : image fixe, étiquettes en liste, rien ne
   bouge.
6. Les pages `/reserver/*` et `/admin/*` restent inchangées.
7. Le composant survit à un démontage/remontage (mode strict de React) sans
   erreur en console.

## Hors périmètre

- La mise en page pleine largeur de l'accueil, déjà livrée le 27/07.
- Les pages réservation et back-office.
- La mise en ligne sur `lootaclim.fr` (base PostgreSQL, stockage des images,
  variables d'environnement) — chantier distinct.
- Toute ressemblance photoréaliste avec un modèle de machine précis : la
  représentation est stylisée et générique.

## Dépendance ajoutée

`three` (0.185.1 au moment de la rédaction), en dépendance de production. C'est
la seule. `@react-three/fiber` est écarté : pour une scène unique pilotée par le
défilement, il ajoute un réconciliateur React sans bénéfice.
