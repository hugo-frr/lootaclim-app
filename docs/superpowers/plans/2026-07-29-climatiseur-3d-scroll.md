# Climatiseur 3D animé au défilement — plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Faire du climatiseur un objet 3D fixé à l'écran qui se transforme section après section — il tourne, démarre, souffle, puis s'ouvre en vue éclatée avec des étiquettes explicatives.

**Architecture :** Toute la logique « défilement → état de la scène » vit dans `lib/acTimeline.js`, pure et testée avec `node:test`. La géométrie est construite pièce par pièce dans `lib/acModel.js`, qui reçoit `THREE` en argument pour rester importable en test. Le composant client `app/AcScene.js` ne fait que charger Three.js en différé, tenir la boucle de rendu et appliquer l'état. Le fond de givre existant devient l'arrière-plan de cette même scène : un seul canvas, un seul contexte WebGL.

**Tech Stack :** Next.js 14 (App Router), React 18, `three` 0.185.x (seule dépendance ajoutée), tests `node --test lib/`.

**Spec de référence :** `docs/superpowers/specs/2026-07-29-climatiseur-3d-scroll-design.md`

## Global Constraints

- **Une seule dépendance ajoutée : `three`.** Pas de `@react-three/fiber`, pas de `@react-three/drei`, pas de chargeur de modèle.
- **Aucun fichier 3D, aucune texture, aucun HDR.** Toute la géométrie et tout l'éclairage sont construits en code.
- **Aucun import depuis `three/examples/jsm` ni `three/addons`.** Uniquement le noyau `three` : ces chemins et leurs signatures changent entre versions.
- **Jamais `renderer.forceContextLoss()` au démontage.** En mode strict de React (actif en développement) le composant est démonté puis remonté ; un contexte perdu rend le canvas définitivement inutilisable. C'est exactement le bug corrigé par le commit `eaf0836`.
- **Aucune couleur hors thème** : `--navy #0a1f33`, `--ice #eaf6fb`, `--frost #bfe7f5`, `--cool #3fb6e0`, `--deep #1273a6`, `--sun #ff8a5c`, plus le dégradé `#dff2fa` / `#eaf6fb` / `#f6fbfd`.
- **`three` est chargé par `import()` dynamique à l'intérieur de l'effet**, jamais en import statique en tête de fichier : le texte du hero doit rester lisible sans attendre le téléchargement.
- **Aucune modification des pages `/reserver/*` et `/admin/*`.**
- **`prefers-reduced-motion: reduce` respecté** : une seule image, aucune boucle, aucun écouteur de défilement.
- **Commentaires et textes d'interface en français.**

---

### Task 1 : installer `three` et extraire le shader de givre

Étape préparatoire sans changement visible : on installe la dépendance, on vérifie qu'elle s'importe aussi bien dans le bundler que dans les tests, et on sort le GLSL de `Backdrop3D.js` pour qu'il soit réutilisable par la future scène.

**Files:**
- Modify: `package.json` (ajout de `three`)
- Create: `lib/frostShader.js`
- Modify: `app/Backdrop3D.js` (importe désormais le shader depuis `lib/`)

**Interfaces:**
- Consumes: rien.
- Produces:
  - `FROST_FRAGMENT: string` — le fragment shader du fond de givre, **sans** bloc `precision` (Three.js préfixe le sien ; le nôtre ferait doublon).
  - `FROST_VERTEX_RAW: string` — vertex shader pour WebGL brut, avec `attribute vec2 a_pos`. Utilisé par `Backdrop3D.js` jusqu'à sa suppression en Task 5.
  - `FROST_VERTEX_THREE: string` — vertex shader pour un `ShaderMaterial` Three.js, qui utilise l'attribut `position` fourni automatiquement.
  - `FROST_PRECISION: string` — le bloc `precision`, que `Backdrop3D.js` doit reconcaténer devant `FROST_FRAGMENT`.

- [ ] **Step 1 : installer la dépendance**

```bash
npm install three@^0.185.1
```

- [ ] **Step 2 : vérifier que `three` s'importe bien dans l'environnement de test**

Le reste du plan suppose que `lib/acModel.js` est testable avec `node --test`. On le vérifie tout de suite plutôt qu'en Task 3.

```bash
node --input-type=module -e "
import * as THREE from 'three';
const g = new THREE.BoxGeometry(1, 1, 1);
g.computeBoundingBox();
console.log('three', THREE.REVISION, 'boite', g.boundingBox.max.toArray().join(','));
"
```

Expected: affiche le numéro de révision et `0.5,0.5,0.5`. Si l'import échoue, **s'arrêter et le signaler** : le découpage des tâches 3 et 4 repose dessus.

- [ ] **Step 3 : créer `lib/frostShader.js`**

Reprendre **mot pour mot** les chaînes `VERTEX_SRC` et `FRAGMENT_SRC` de `app/Backdrop3D.js`, réparties ainsi :

```js
// Shader du fond de givre : trois nappes de bruit fractal superposées qui
// dérivent à des profondeurs différentes. Extrait de app/Backdrop3D.js pour
// être partagé entre le rendu WebGL brut et la scène Three.js.

// Three.js préfixe lui-même la précision à ses shaders : le bloc est isolé ici
// pour que seul le rendu WebGL brut le reconcatène, sans doublon côté Three.
export const FROST_PRECISION = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
`;

// WebGL brut : l'attribut est déclaré par nos soins.
export const FROST_VERTEX_RAW = `
attribute vec2 a_pos;
void main() {
  gl_Position = vec4(a_pos, 0.0, 1.0);
}
`;

// Three.js fournit déjà l'attribut "position" : on s'en sert tel quel pour
// couvrir l'écran, sans matrice de projection.
export const FROST_VERTEX_THREE = `
void main() {
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

export const FROST_FRAGMENT = `
uniform vec2 u_res;
uniform float u_time;
uniform float u_scroll;
uniform vec2 u_mouse;

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(hash(i + vec2(0.0, 0.0)), hash(i + vec2(1.0, 0.0)), u.x),
    mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x),
    u.y
  );
}

float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 4; i++) {
    v += a * noise(p);
    p *= 2.02;
    a *= 0.5;
  }
  return v;
}

// Une nappe : plus "depth" est grand, plus elle réagit au scroll et à la
// souris. C'est cet écart de réaction entre nappes qui donne la profondeur.
float layer(vec2 uv, float scale, float speed, float depth) {
  vec2 p = uv * scale;
  p += vec2(u_time * speed, -u_time * speed * 0.6);
  p += (u_mouse - 0.5) * depth * 0.6;
  p.y += u_scroll * depth * 1.4;
  return fbm(p);
}

void main() {
  vec2 uv = gl_FragCoord.xy / u_res;
  float aspect = u_res.x / u_res.y;
  vec2 auv = vec2(uv.x * aspect, uv.y);

  // Dégradé vertical repris à l'identique du body (#dff2fa -> #eaf6fb -> #f6fbfd)
  float t = 1.0 - uv.y;
  vec3 top    = vec3(0.875, 0.949, 0.980);
  vec3 mid    = vec3(0.918, 0.965, 0.984);
  vec3 bottom = vec3(0.965, 0.984, 0.992);
  vec3 col = mix(top, mid, smoothstep(0.0, 0.45, t));
  col = mix(col, bottom, smoothstep(0.45, 1.0, t));

  vec3 frost = vec3(0.749, 0.906, 0.961); // --frost #bfe7f5
  vec3 cool  = vec3(0.247, 0.714, 0.878); // --cool  #3fb6e0

  float l1 = layer(auv,        2.0, 0.010, 0.20);
  float l2 = layer(auv + 3.7,  3.4, 0.017, 0.45);
  float l3 = layer(auv + 8.1,  5.6, 0.026, 0.85);

  col = mix(col, frost, smoothstep(0.42, 0.78, l1) * 0.55);
  col = mix(col, frost, smoothstep(0.48, 0.85, l2) * 0.30);
  col = mix(col, cool,  smoothstep(0.58, 0.92, l3) * 0.12);

  // Halo de lumière froide qui dérive en haut de l'écran
  vec2 halo = vec2(
    aspect * (0.5 + sin(u_time * 0.07) * 0.30),
    1.02 - u_scroll * 0.25
  );
  col += vec3(0.10, 0.14, 0.16) * smoothstep(0.95, 0.0, distance(auv, halo));

  // Grain très léger : évite les cercles de banding sur les grands aplats
  col += (hash(gl_FragCoord.xy) - 0.5) * 0.006;

  gl_FragColor = vec4(col, 1.0);
}
`;
```

- [ ] **Step 4 : brancher `Backdrop3D.js` sur le shader extrait**

Dans `app/Backdrop3D.js`, supprimer les constantes `VERTEX_SRC` et `FRAGMENT_SRC`, et ajouter en tête, après l'import de `../lib/backdrop` :

```js
import {
  FROST_PRECISION,
  FROST_VERTEX_RAW,
  FROST_FRAGMENT,
} from "../lib/frostShader";
```

Puis remplacer l'appel à `createProgram` :

```js
    const program = createProgram(
      gl,
      FROST_VERTEX_RAW,
      FROST_PRECISION + FROST_FRAGMENT
    );
    if (!program) return;
```

- [ ] **Step 5 : vérifier que rien n'a bougé**

```bash
npm run build && npm test
```

Expected: compilation réussie, 92 tests au vert. La page d'accueil doit s'afficher exactement comme avant — c'est un déplacement de code, pas un changement de comportement.

- [ ] **Step 6 : commit**

```bash
git add package.json package-lock.json lib/frostShader.js app/Backdrop3D.js
git commit -m "refactor(accueil): extraire le shader de givre et installer three"
```

---

### Task 2 : `lib/acTimeline.js` — le scénario, en pur calcul

**Files:**
- Create: `lib/acTimeline.js`
- Test: `lib/acTimeline.test.js`

**Interfaces:**
- Consumes: rien.
- Produces:
  - `easeInOut(t: number) => number` — lissage, borné à [0,1]
  - `stageAt(scrollY: number, boundaries: number[]) => { stage: number, local: number }`
  - `sceneState(stage: number, local: number, options: { coarsePointer: boolean }) => SceneState`
  - `timelineState(scrollY: number, boundaries: number[], options) => SceneState`
  - `particleCount(coarsePointer: boolean) => number`

  `SceneState` = `{ x, y, scale, spin, explode, fanSpeed, airflow, hoseDeploy, labels, dim }`, tous des nombres.

- [ ] **Step 1 : écrire les tests qui échouent**

Créer `lib/acTimeline.test.js` :

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  easeInOut,
  stageAt,
  sceneState,
  timelineState,
  particleCount,
} from "./acTimeline.js";

// Cinq sections : hero, étapes, modèles, réassurance, CTA.
const BOUNDS = [0, 1000, 2000, 3000, 4000];

test("easeInOut : bornes et milieu", () => {
  assert.equal(easeInOut(0), 0);
  assert.equal(easeInOut(1), 1);
  assert.equal(easeInOut(0.5), 0.5);
});

test("easeInOut : borné hors de [0,1]", () => {
  assert.equal(easeInOut(-3), 0);
  assert.equal(easeInOut(4), 1);
});

test("easeInOut : démarre et finit plus lentement qu'une droite", () => {
  assert.ok(easeInOut(0.25) < 0.25);
  assert.ok(easeInOut(0.75) > 0.75);
});

test("stageAt : trouve l'étape et la progression locale", () => {
  assert.deepEqual(stageAt(0, BOUNDS), { stage: 0, local: 0 });
  assert.deepEqual(stageAt(500, BOUNDS), { stage: 0, local: 0.5 });
  assert.deepEqual(stageAt(1000, BOUNDS), { stage: 1, local: 0 });
  assert.deepEqual(stageAt(3500, BOUNDS), { stage: 3, local: 0.5 });
});

test("stageAt : au-delà de la dernière borne, dernière étape achevée", () => {
  assert.deepEqual(stageAt(4000, BOUNDS), { stage: 4, local: 1 });
  assert.deepEqual(stageAt(99999, BOUNDS), { stage: 4, local: 1 });
});

test("stageAt : avant la première borne, début de la première étape", () => {
  assert.deepEqual(stageAt(-500, BOUNDS), { stage: 0, local: 0 });
});

test("stageAt : bornes absentes ou dégénérées ne plantent pas", () => {
  assert.deepEqual(stageAt(500, []), { stage: 0, local: 0 });
  assert.deepEqual(stageAt(500, [0]), { stage: 0, local: 1 });
  // Deux sections au même offset : pas de division par zéro
  assert.deepEqual(stageAt(500, [0, 0, 1000]), { stage: 1, local: 0.5 });
});

test("sceneState : dans le hero, la machine est éteinte et centrée", () => {
  const s = sceneState(0, 0, { coarsePointer: false });
  assert.equal(s.x, 0);
  assert.equal(s.fanSpeed, 0);
  assert.equal(s.airflow, 0);
  assert.equal(s.explode, 0);
  assert.equal(s.labels, 0);
  assert.equal(s.scale, 1);
});

test("sceneState : à l'étape 1, elle démarre et déploie la gaine", () => {
  const debut = sceneState(1, 0, { coarsePointer: false });
  const fin = sceneState(1, 1, { coarsePointer: false });
  assert.equal(debut.fanSpeed, 0);
  assert.equal(fin.fanSpeed, 1);
  assert.equal(fin.airflow, 1);
  assert.equal(fin.hoseDeploy, 1);
});

test("sceneState : à l'étape 2, elle se décale à gauche et s'efface", () => {
  const fin = sceneState(2, 1, { coarsePointer: false });
  assert.ok(fin.x < -0.5, `x attendu très à gauche, reçu ${fin.x}`);
  assert.ok(fin.scale < 1);
  assert.ok(fin.dim > 0);
});

test("sceneState : sur mobile, elle reste centrée et s'efface davantage", () => {
  const bureau = sceneState(2, 1, { coarsePointer: false });
  const mobile = sceneState(2, 1, { coarsePointer: true });
  assert.equal(mobile.x, 0);
  assert.ok(mobile.dim > bureau.dim);
});

test("sceneState : à l'étape 3, vue éclatée et étiquettes visibles", () => {
  const fin = sceneState(3, 1, { coarsePointer: false });
  assert.equal(fin.explode, 1);
  assert.equal(fin.labels, 1);
  assert.equal(fin.x, 0, "elle doit s'être recentrée");
});

test("sceneState : à l'étape 4, tout se referme", () => {
  const fin = sceneState(4, 1, { coarsePointer: false });
  assert.equal(fin.explode, 0);
  assert.equal(fin.labels, 0);
  assert.equal(fin.x, 0);
  assert.equal(fin.scale, 1);
});

test("sceneState : aucune valeur ne sort de ses bornes, à aucun moment", () => {
  for (let stage = 0; stage <= 4; stage++) {
    for (let i = 0; i <= 10; i++) {
      for (const coarsePointer of [false, true]) {
        const s = sceneState(stage, i / 10, { coarsePointer });
        for (const clef of ["explode", "fanSpeed", "airflow", "hoseDeploy", "labels", "dim"]) {
          assert.ok(
            s[clef] >= 0 && s[clef] <= 1,
            `${clef} hors bornes à l'étape ${stage}/${i / 10} : ${s[clef]}`
          );
        }
        assert.ok(s.x >= -1 && s.x <= 1, `x hors bornes : ${s.x}`);
        assert.ok(s.scale > 0, `échelle nulle ou négative : ${s.scale}`);
      }
    }
  }
});

test("sceneState : la rotation propre ne recule jamais", () => {
  let precedent = -Infinity;
  for (let stage = 0; stage <= 4; stage++) {
    for (let i = 0; i <= 10; i++) {
      const { spin } = sceneState(stage, i / 10, { coarsePointer: false });
      assert.ok(spin >= precedent, `la rotation recule à l'étape ${stage}`);
      precedent = spin;
    }
  }
});

test("timelineState : compose stageAt et sceneState", () => {
  const attendu = sceneState(2, 0.5, { coarsePointer: false });
  const obtenu = timelineState(2500, BOUNDS, { coarsePointer: false });
  assert.deepEqual(obtenu, attendu);
});

test("particleCount : moins de particules sur mobile", () => {
  assert.equal(particleCount(false), 900);
  assert.equal(particleCount(true), 300);
});
```

- [ ] **Step 2 : lancer les tests pour vérifier qu'ils échouent**

Run: `npm test`
Expected: ÉCHEC — `Cannot find module '.../lib/acTimeline.js'`

- [ ] **Step 3 : écrire l'implémentation**

Créer `lib/acTimeline.js` :

```js
// Scénario du climatiseur 3D : traduit la position de défilement en état de
// scène. Volontairement pur — aucun accès au DOM, aucune dépendance à Three.js
// — pour rester testable sans navigateur.

// Lissage doux au départ et à l'arrivée. Borné : appelé avec des progressions
// qui peuvent déborder pendant un rebond élastique de défilement.
export function easeInOut(t) {
  const c = Math.min(1, Math.max(0, t));
  return c * c * (3 - 2 * c);
}

// Les extrémités sont renvoyées telles quelles plutôt que calculées : sans
// cette précaution, melange(0.92, 1, 1) vaut 1.0000000000000002 en virgule
// flottante, et une étape censée se terminer sur une valeur ronde ne l'atteint
// jamais exactement.
function melange(depuis, vers, t) {
  if (t <= 0) return depuis;
  if (t >= 1) return vers;
  return depuis + (vers - depuis) * t;
}

// Repère l'étape courante et la progression à l'intérieur de celle-ci.
// "boundaries" est la liste croissante des offsetTop des cinq sections.
export function stageAt(scrollY, boundaries) {
  if (!Array.isArray(boundaries) || boundaries.length === 0) {
    return { stage: 0, local: 0 };
  }
  if (boundaries.length === 1) {
    return { stage: 0, local: scrollY >= boundaries[0] ? 1 : 0 };
  }
  const dernier = boundaries.length - 1;
  if (scrollY >= boundaries[dernier]) return { stage: dernier, local: 1 };

  for (let i = dernier - 1; i >= 0; i--) {
    if (scrollY >= boundaries[i]) {
      const etendue = boundaries[i + 1] - boundaries[i];
      // Deux sections au même offset : la progression n'a pas de sens, on
      // considère l'étape terminée plutôt que de diviser par zéro.
      const local = etendue > 0 ? (scrollY - boundaries[i]) / etendue : 1;
      return { stage: i, local: Math.min(1, Math.max(0, local)) };
    }
  }
  return { stage: 0, local: 0 };
}

// Nombre de particules du souffle d'air. Réduit sur mobile : c'est la boucle
// la plus coûteuse côté processeur.
export function particleCount(coarsePointer) {
  return coarsePointer ? 300 : 900;
}

// Rotation propre cumulée, en tours. Croissante d'un bout à l'autre de la page
// pour que la machine ne reparte jamais en arrière quand on remonte puis
// redescend.
function spinAt(stage, t) {
  const PAR_ETAPE = [0.35, 0.3, 0.45, 0.25, 0.3];
  let total = 0;
  for (let i = 0; i < stage; i++) total += PAR_ETAPE[i];
  return total + PAR_ETAPE[stage] * t;
}

// État complet de la scène pour une étape et une progression données.
export function sceneState(stage, local, { coarsePointer = false } = {}) {
  const t = easeInOut(local);
  const spin = spinAt(stage, Math.min(1, Math.max(0, local)));

  // Sur mobile la machine ne se décale jamais : elle reste centrée derrière le
  // texte, et c'est l'effacement qui préserve la lisibilité.
  const decalage = coarsePointer ? 0 : -0.55;
  const effacementModeles = coarsePointer ? 0.68 : 0.45;

  const base = {
    x: 0,
    y: 0,
    scale: 1,
    spin,
    explode: 0,
    fanSpeed: 0,
    airflow: 0,
    hoseDeploy: 0,
    labels: 0,
    dim: coarsePointer ? 0.25 : 0,
  };

  switch (stage) {
    // Hero : posée, éteinte, elle tourne lentement.
    case 0:
      return base;

    // Comment ça marche : elle démarre, souffle, la gaine se déploie.
    case 1:
      return {
        ...base,
        fanSpeed: t,
        airflow: t,
        hoseDeploy: t,
      };

    // Nos modèles : elle s'écarte et s'efface pour laisser lire les fiches.
    case 2:
      return {
        ...base,
        x: melange(0, decalage, t),
        scale: melange(1, 0.75, t),
        dim: melange(base.dim, effacementModeles, t),
        fanSpeed: melange(1, 0.6, t),
        airflow: melange(1, 0.5, t),
        hoseDeploy: 1,
      };

    // Réassurance : elle se recentre et s'ouvre, les étiquettes apparaissent.
    case 3:
      return {
        ...base,
        x: melange(decalage, 0, t),
        scale: melange(0.75, 0.92, t),
        dim: melange(effacementModeles, base.dim, t),
        explode: t,
        labels: t,
        fanSpeed: melange(0.6, 0.4, t),
        airflow: melange(0.5, 0.3, t),
        hoseDeploy: 1,
      };

    // CTA : tout se referme, dernier souffle.
    case 4:
      return {
        ...base,
        scale: melange(0.92, 1, t),
        explode: 1 - t,
        labels: 1 - t,
        fanSpeed: melange(0.4, 1, t),
        // Souffle final : monte puis redescend au fil de l'étape.
        airflow: melange(0.3, 1, Math.sin(Math.min(1, Math.max(0, local)) * Math.PI)),
        hoseDeploy: 1,
      };

    default:
      return base;
  }
}

// Composition : position de défilement -> état de scène.
export function timelineState(scrollY, boundaries, options) {
  const { stage, local } = stageAt(scrollY, boundaries);
  return sceneState(stage, local, options);
}
```

- [ ] **Step 4 : lancer les tests pour vérifier qu'ils passent**

Run: `npm test`
Expected: SUCCÈS — les 17 nouveaux tests passent, les 92 existants restent verts (109 au total).

- [ ] **Step 5 : commit**

```bash
git add lib/acTimeline.js lib/acTimeline.test.js
git commit -m "feat(accueil): scenario du climatiseur 3D en calcul pur"
```

---

### Task 3 : `lib/acModel.js` — la machine, pièce par pièce

**Files:**
- Create: `lib/acModel.js`
- Test: `lib/acModel.test.js`

**Interfaces:**
- Consumes: `three`, reçu en argument (jamais importé par ce fichier).
- Produces:
  - `buildAcUnit(THREE) => { root, parts, anchors, materials }`
    - `root` : `THREE.Group`, à ajouter à la scène
    - `parts` : `{ shell, frontPanel, grille, fan, panel, hose, wheels }`
    - `anchors` : `[{ id, position }]` — quatre entrées, identifiants `intake`, `circuit`, `output`, `exhaust`
    - `materials` : tableau de tous les matériaux, pour l'effacement (`dim`) et la libération au démontage
  - `buildStudioEnvironment(THREE) => THREE.Scene` — studio photo miniature, source de la carte d'environnement
  - `AC_SIZE = { width: 0.45, height: 0.75, depth: 0.4 }` — dimensions en mètres, pour cadrer la caméra

- [ ] **Step 1 : écrire les tests qui échouent**

Créer `lib/acModel.test.js` :

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { buildAcUnit, buildStudioEnvironment, AC_SIZE } from "./acModel.js";

test("buildAcUnit : livre toutes les pièces animables", () => {
  const { parts } = buildAcUnit(THREE);
  for (const clef of ["shell", "frontPanel", "grille", "fan", "panel", "hose", "wheels"]) {
    assert.ok(parts[clef], `pièce manquante : ${clef}`);
  }
});

test("buildAcUnit : toutes les pièces sont rattachées au groupe racine", () => {
  const { root, parts } = buildAcUnit(THREE);
  for (const [clef, piece] of Object.entries(parts)) {
    let noeud = piece;
    while (noeud && noeud !== root) noeud = noeud.parent;
    assert.equal(noeud, root, `${clef} n'est pas rattachée à la racine`);
  }
});

test("buildAcUnit : quatre points d'accroche identifiés", () => {
  const { anchors } = buildAcUnit(THREE);
  assert.equal(anchors.length, 4);
  assert.deepEqual(
    anchors.map((a) => a.id).sort(),
    ["circuit", "exhaust", "intake", "output"]
  );
  for (const a of anchors) {
    assert.ok(a.position.isVector3, `${a.id} : position doit être un Vector3`);
  }
});

test("buildAcUnit : l'encombrement correspond aux dimensions annoncées", () => {
  const { root } = buildAcUnit(THREE);
  const boite = new THREE.Box3().setFromObject(root);
  const taille = boite.getSize(new THREE.Vector3());
  // La gaine dépasse du caisson : on vérifie que le caisson n'est ni minuscule
  // ni démesuré par rapport aux dimensions déclarées.
  assert.ok(taille.y >= AC_SIZE.height * 0.9, `hauteur trop faible : ${taille.y}`);
  assert.ok(taille.y <= AC_SIZE.height * 2, `hauteur démesurée : ${taille.y}`);
  assert.ok(taille.x >= AC_SIZE.width * 0.9, `largeur trop faible : ${taille.x}`);
});

test("buildAcUnit : l'hélice tourne autour de son propre axe, centrée", () => {
  const { parts } = buildAcUnit(THREE);
  const boite = new THREE.Box3().setFromObject(parts.fan);
  const centre = boite.getCenter(new THREE.Vector3());
  assert.ok(Math.abs(centre.x) < 0.02, `hélice décentrée en x : ${centre.x}`);
});

test("buildAcUnit : la gaine est indexée, pour un déploiement par setDrawRange", () => {
  const { parts } = buildAcUnit(THREE);
  assert.ok(parts.hose.geometry.index, "la géométrie de la gaine doit être indexée");
  assert.ok(parts.hose.geometry.index.count > 0);
});

test("buildAcUnit : tous les matériaux sont recensés pour l'effacement", () => {
  const { root, materials } = buildAcUnit(THREE);
  const vus = new Set();
  root.traverse((o) => {
    if (o.material) vus.add(o.material);
  });
  for (const m of vus) {
    assert.ok(materials.includes(m), "un matériau de la scène n'est pas recensé");
  }
  assert.ok(materials.every((m) => m.transparent), "les matériaux doivent être transparents pour dim");
});

test("buildStudioEnvironment : renvoie une scène non vide", () => {
  const studio = buildStudioEnvironment(THREE);
  assert.ok(studio.isScene);
  assert.ok(studio.children.length >= 3, "un studio a besoin de plusieurs sources");
});
```

- [ ] **Step 2 : lancer les tests pour vérifier qu'ils échouent**

Run: `npm test`
Expected: ÉCHEC — `Cannot find module '.../lib/acModel.js'`

- [ ] **Step 3 : écrire l'implémentation**

Créer `lib/acModel.js` :

```js
// Construction du climatiseur mobile, pièce par pièce, à partir de primitives.
// Aucun fichier 3D, aucune texture : tout est géométrie et matériaux.
//
// THREE est reçu en argument et jamais importé ici : le composant qui appelle
// cette fonction charge Three.js en différé, et ce fichier reste importable
// dans les tests sans imposer ce choix.

export const AC_SIZE = { width: 0.45, height: 0.75, depth: 0.4 };

// Rectangle à coins arrondis, base du caisson et de la façade.
function profilArrondi(THREE, largeur, hauteur, rayon) {
  const s = new THREE.Shape();
  const l = largeur / 2;
  const h = hauteur / 2;
  s.moveTo(-l + rayon, -h);
  s.lineTo(l - rayon, -h);
  s.quadraticCurveTo(l, -h, l, -h + rayon);
  s.lineTo(l, h - rayon);
  s.quadraticCurveTo(l, h, l - rayon, h);
  s.lineTo(-l + rayon, h);
  s.quadraticCurveTo(-l, h, -l, h - rayon);
  s.lineTo(-l, -h + rayon);
  s.quadraticCurveTo(-l, -h, -l + rayon, -h);
  return s;
}

function extruderProfil(THREE, shape, profondeur, biseau) {
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: profondeur,
    bevelEnabled: true,
    bevelThickness: biseau,
    bevelSize: biseau,
    bevelSegments: 3,
    curveSegments: 12,
  });
  geo.center();
  return geo;
}

// Une pale : profil allongé, légèrement pincé, extrudé finement.
function profilPale(THREE) {
  const s = new THREE.Shape();
  s.moveTo(0.012, 0);
  s.quadraticCurveTo(0.05, 0.02, 0.085, 0.012);
  s.quadraticCurveTo(0.095, 0, 0.085, -0.012);
  s.quadraticCurveTo(0.05, -0.02, 0.012, 0);
  return s;
}

export function buildAcUnit(THREE) {
  const { width: L, height: H, depth: P } = AC_SIZE;

  // Tous les matériaux sont transparents dès le départ : l'effacement (dim)
  // fait varier leur opacité, et basculer transparent en cours de route
  // forcerait une recompilation du shader à l'exécution.
  const laque = new THREE.MeshPhysicalMaterial({
    color: 0xf4f9fc,
    roughness: 0.32,
    metalness: 0,
    clearcoat: 1,
    clearcoatRoughness: 0.22,
    transparent: true,
    opacity: 1,
  });
  const anthracite = new THREE.MeshStandardMaterial({
    color: 0x2b3d4c,
    roughness: 0.62,
    metalness: 0.1,
    transparent: true,
    opacity: 1,
  });
  const froid = new THREE.MeshStandardMaterial({
    color: 0x3fb6e0,
    roughness: 0.4,
    metalness: 0.15,
    emissive: 0x1273a6,
    emissiveIntensity: 0.35,
    transparent: true,
    opacity: 1,
  });
  const caoutchouc = new THREE.MeshStandardMaterial({
    color: 0x1b2a36,
    roughness: 0.9,
    metalness: 0,
    transparent: true,
    opacity: 1,
  });
  const materials = [laque, anthracite, froid, caoutchouc];

  const root = new THREE.Group();

  // --- Caisson ---
  const shell = new THREE.Mesh(
    extruderProfil(THREE, profilArrondi(THREE, L, H, 0.06), P * 0.9, 0.012),
    laque
  );
  root.add(shell);

  // --- Façade : c'est elle qui s'écarte en vue éclatée ---
  const frontPanel = new THREE.Mesh(
    extruderProfil(THREE, profilArrondi(THREE, L * 0.92, H * 0.5, 0.05), 0.02, 0.006),
    laque
  );
  frontPanel.position.set(0, H * 0.18, P * 0.47);
  root.add(frontPanel);

  // --- Grille de soufflage : lamelles répétées ---
  const NB_LAMELLES = 14;
  const grille = new THREE.InstancedMesh(
    new THREE.BoxGeometry(L * 0.78, 0.007, 0.012),
    anthracite,
    NB_LAMELLES
  );
  const repere = new THREE.Object3D();
  for (let i = 0; i < NB_LAMELLES; i++) {
    repere.position.set(0, (i - (NB_LAMELLES - 1) / 2) * 0.016, 0);
    repere.rotation.x = -0.35;
    repere.updateMatrix();
    grille.setMatrixAt(i, repere.matrix);
  }
  grille.instanceMatrix.needsUpdate = true;
  grille.position.set(0, H * 0.18, P * 0.44);
  root.add(grille);

  // --- Hélice : moyeu + 5 pales, tourne autour de l'axe Z ---
  const fan = new THREE.Group();
  const moyeu = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.028, 0.03, 20), anthracite);
  moyeu.rotation.x = Math.PI / 2;
  fan.add(moyeu);
  const geoPale = new THREE.ExtrudeGeometry(profilPale(THREE), {
    depth: 0.006,
    bevelEnabled: false,
    curveSegments: 8,
  });
  for (let i = 0; i < 5; i++) {
    const pale = new THREE.Mesh(geoPale, froid);
    pale.rotation.z = (i / 5) * Math.PI * 2;
    fan.add(pale);
  }
  fan.position.set(0, H * 0.18, P * 0.3);
  root.add(fan);

  // --- Panneau de commande ---
  const panel = new THREE.Group();
  const ardoise = new THREE.Mesh(
    extruderProfil(THREE, profilArrondi(THREE, L * 0.5, 0.07, 0.02), 0.012, 0.004),
    anthracite
  );
  panel.add(ardoise);
  const diode = new THREE.Mesh(new THREE.SphereGeometry(0.008, 12, 12), froid);
  diode.position.set(L * 0.17, 0, 0.012);
  panel.add(diode);
  panel.position.set(0, H * 0.42, P * 0.45);
  root.add(panel);

  // --- Roulettes ---
  const wheels = new THREE.Group();
  const geoRoue = new THREE.CylinderGeometry(0.026, 0.026, 0.016, 16);
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const roue = new THREE.Mesh(geoRoue, caoutchouc);
      roue.rotation.z = Math.PI / 2;
      roue.position.set(sx * L * 0.36, -H / 2 - 0.012, sz * P * 0.3);
      wheels.add(roue);
    }
  }
  root.add(wheels);

  // --- Gaine d'évacuation, du dos de la machine vers la fenêtre ---
  const trajet = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, H * 0.3, -P * 0.45),
    new THREE.Vector3(0.16, H * 0.42, -P * 0.75),
    new THREE.Vector3(0.38, H * 0.6, -P * 0.95),
    new THREE.Vector3(0.6, H * 0.78, -P * 1.0),
  ]);
  const hose = new THREE.Mesh(
    new THREE.TubeGeometry(trajet, 48, 0.05, 12, false),
    anthracite
  );
  root.add(hose);

  // --- Points d'accroche des étiquettes, en coordonnées locales ---
  const anchors = [
    { id: "intake", position: new THREE.Vector3(-L * 0.5, -H * 0.22, P * 0.2) },
    { id: "circuit", position: new THREE.Vector3(0, -H * 0.02, P * 0.5) },
    { id: "output", position: new THREE.Vector3(0, H * 0.2, P * 0.55) },
    { id: "exhaust", position: new THREE.Vector3(0.55, H * 0.74, -P * 0.95) },
  ];

  return { root, parts: { shell, frontPanel, grille, fan, panel, hose, wheels }, anchors, materials };
}

// Studio photo miniature : quelques panneaux lumineux dont PMREMGenerator tire
// une carte d'environnement. C'est ce qui donne les reflets doux d'une photo
// produit, sans le moindre fichier HDR à télécharger.
export function buildStudioEnvironment(THREE) {
  const studio = new THREE.Scene();
  const panneau = new THREE.PlaneGeometry(1, 1);

  const sources = [
    // [couleur, intensité, position, échelle, cible du regard]
    [0xffffff, 2.4, [0, 2.4, 0], [4, 4, 1], [0, 0, 0]],
    [0xdff2fa, 1.6, [-2.2, 0.6, 1.6], [3, 3, 1], [0, 0, 0]],
    [0xbfe7f5, 1.1, [2.4, 0.2, -1.4], [3, 3, 1], [0, 0, 0]],
    [0xf6fbfd, 0.7, [0, -1.8, 1.2], [4, 2, 1], [0, 0, 0]],
  ];

  for (const [couleur, intensite, position, echelle, cible] of sources) {
    const materiau = new THREE.MeshBasicMaterial({ color: couleur });
    materiau.color.multiplyScalar(intensite);
    const maille = new THREE.Mesh(panneau, materiau);
    maille.position.set(...position);
    maille.scale.set(...echelle);
    maille.lookAt(...cible);
    studio.add(maille);
  }

  return studio;
}
```

- [ ] **Step 4 : lancer les tests pour vérifier qu'ils passent**

Run: `npm test`
Expected: SUCCÈS — 8 nouveaux tests, 117 au total.

- [ ] **Step 5 : commit**

```bash
git add lib/acModel.js lib/acModel.test.js
git commit -m "feat(accueil): geometrie du climatiseur construite en code"
```

---

### Task 4 : `app/AcScene.js` — la scène et sa boucle

C'est la tâche qui rend le climatiseur visible. À la fin de celle-ci, `Backdrop3D.js` a disparu et `createProgram` avec lui.

**Files:**
- Create: `app/AcScene.js`
- Modify: `app/globals.css` (règle `.ac-scene`, suppression de `.backdrop3d`)
- Modify: `app/page.js` (remplacer `<Backdrop3D />` par `<AcScene />`, poser les identifiants de section)
- Delete: `app/Backdrop3D.js`
- Modify: `lib/backdrop.js` (retrait de `createProgram` et de `compile`)
- Modify: `lib/backdrop.test.js` (retrait des 4 tests de `createProgram` et du faux contexte)

**Interfaces:**
- Consumes: `timelineState`, `particleCount` (Task 2) ; `buildAcUnit`, `buildStudioEnvironment`, `AC_SIZE` (Task 3) ; `FROST_VERTEX_THREE`, `FROST_FRAGMENT` (Task 1) ; `renderScale`, `scrollProgress`, `pointerToUv`, `lerp` (`lib/backdrop.js`).
- Produces: composant `<AcScene sectionIds={string[]} labelsRef={ref} />`. `sectionIds` donne les identifiants DOM des cinq sections, dans l'ordre, servant à calculer les bornes. `labelsRef` est facultatif en Task 4 et branché en Task 5.

- [ ] **Step 1 : créer le composant**

Créer `app/AcScene.js` :

```jsx
"use client";

import { useEffect, useRef } from "react";
import { renderScale, scrollProgress, lerp, pointerToUv } from "../lib/backdrop";
import { timelineState, particleCount } from "../lib/acTimeline";
import { buildAcUnit, buildStudioEnvironment, AC_SIZE } from "../lib/acModel";
import { FROST_VERTEX_THREE, FROST_FRAGMENT } from "../lib/frostShader";

// Scène 3D de la page d'accueil : le fond de givre en arrière-plan et le
// climatiseur devant, tous deux dans le même canvas — donc un seul contexte
// WebGL. Three.js est chargé en différé pour ne pas retarder l'affichage du
// texte du hero.

export default function AcScene({ sectionIds, labelsRef }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let annule = false;
    let nettoyer = null;

    (async () => {
      const THREE = await import("three");
      if (annule || !canvasRef.current) return;

      const coarse = window.matchMedia("(pointer: coarse)").matches;
      const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

      let renderer;
      try {
        renderer = new THREE.WebGLRenderer({
          canvas,
          alpha: false,
          antialias: !coarse,
          powerPreference: "low-power",
        });
      } catch {
        return; // WebGL indisponible : le dégradé CSS du body reste visible
      }
      renderer.setPixelRatio(renderScale(window.devicePixelRatio, coarse));
      renderer.autoClear = false;

      // --- Arrière-plan : le shader de givre sur un quad plein écran ---
      const bgScene = new THREE.Scene();
      const bgCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
      const bgUniforms = {
        u_res: { value: new THREE.Vector2(1, 1) },
        u_time: { value: 0 },
        u_scroll: { value: 0 },
        u_mouse: { value: new THREE.Vector2(0.5, 0.5) },
      };
      const bgMat = new THREE.ShaderMaterial({
        vertexShader: FROST_VERTEX_THREE,
        fragmentShader: FROST_FRAGMENT,
        uniforms: bgUniforms,
        depthTest: false,
        depthWrite: false,
      });
      const bgGeo = new THREE.PlaneGeometry(2, 2);
      bgScene.add(new THREE.Mesh(bgGeo, bgMat));

      // --- Scène principale ---
      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 20);
      camera.position.set(0, 0, 2.6);

      const pmrem = new THREE.PMREMGenerator(renderer);
      const studio = buildStudioEnvironment(THREE);
      const envRT = pmrem.fromScene(studio, 0.04);
      scene.environment = envRT.texture;

      const { root, parts, anchors, materials } = buildAcUnit(THREE);
      root.rotation.x = 0.08;
      scene.add(root);

      // Positions de repos des pièces, pour l'écartement en vue éclatée.
      const repos = new Map();
      for (const piece of [parts.frontPanel, parts.grille, parts.fan, parts.panel]) {
        repos.set(piece, piece.position.clone());
      }
      const ECARTEMENT = new Map([
        [parts.frontPanel, new THREE.Vector3(0, 0.1, 0.42)],
        [parts.grille, new THREE.Vector3(0, 0.02, 0.24)],
        [parts.fan, new THREE.Vector3(0, -0.06, 0.1)],
        [parts.panel, new THREE.Vector3(0.26, 0.12, 0.18)],
      ]);

      // --- Souffle d'air : nuage de particules mis à jour côté processeur ---
      const NB = particleCount(coarse);
      const positions = new Float32Array(NB * 3);
      const vies = new Float32Array(NB);
      const vitesses = new Float32Array(NB * 3);
      const geoAir = new THREE.BufferGeometry();
      geoAir.setAttribute("position", new THREE.BufferAttribute(positions, 3));
      const matAir = new THREE.PointsMaterial({
        color: 0x3fb6e0,
        size: 0.02,
        sizeAttenuation: true,
        transparent: true,
        opacity: 0.55,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const air = new THREE.Points(geoAir, matAir);
      root.add(air);

      function naitre(i) {
        positions[i * 3] = (Math.random() - 0.5) * AC_SIZE.width * 0.7;
        positions[i * 3 + 1] = AC_SIZE.height * 0.18 + (Math.random() - 0.5) * 0.06;
        positions[i * 3 + 2] = AC_SIZE.depth * 0.45;
        vitesses[i * 3] = (Math.random() - 0.5) * 0.12;
        vitesses[i * 3 + 1] = 0.15 + Math.random() * 0.25;
        vitesses[i * 3 + 2] = 0.25 + Math.random() * 0.35;
        vies[i] = 0.6 + Math.random() * 0.9;
      }
      for (let i = 0; i < NB; i++) {
        naitre(i);
        vies[i] = 0; // toutes éteintes au départ
      }

      // --- Bornes des sections, mesurées dans le document ---
      let bornes = [];
      function mesurerBornes() {
        // getBoundingClientRect + scrollY plutôt que offsetTop : offsetTop est
        // relatif au premier ancêtre positionné, et la section du hero est en
        // position:relative — les bornes ne seraient pas toutes dans le même
        // repère.
        const y = window.scrollY;
        bornes = (sectionIds || [])
          .map((id) => document.getElementById(id))
          .filter(Boolean)
          .map((el) => Math.round(el.getBoundingClientRect().top + y));
      }

      // --- Dimensionnement ---
      function redimensionner() {
        const l = window.innerWidth;
        const h = window.innerHeight;
        renderer.setSize(l, h, false);
        camera.aspect = l / h;
        camera.updateProjectionMatrix();
        const tampon = new THREE.Vector2();
        renderer.getDrawingBufferSize(tampon);
        bgUniforms.u_res.value.copy(tampon);
        mesurerBornes();
      }

      // Demi-dimensions visibles à la profondeur de l'objet : convertit le x
      // normalisé du scénario (0 centre, ±1 bord) en unités du monde 3D.
      function demiVisible() {
        const vFov = (camera.fov * Math.PI) / 180;
        const h = Math.tan(vFov / 2) * camera.position.z;
        return { h, l: h * camera.aspect };
      }

      let sourisCible = { x: 0.5, y: 0.5 };
      let souris = { x: 0.5, y: 0.5 };
      let ecoule = 0;
      let dernier = performance.now();
      let image = null;

      function appliquer(etat, dt) {
        const { h, l } = demiVisible();
        root.position.x = etat.x * l;
        root.position.y = etat.y * h;
        root.scale.setScalar(etat.scale);
        root.rotation.y = etat.spin * Math.PI * 2 + ecoule * 0.12;

        for (const [piece, offset] of ECARTEMENT) {
          const base = repos.get(piece);
          piece.position.copy(base).addScaledVector(offset, etat.explode);
        }

        parts.fan.rotation.z += etat.fanSpeed * dt * 22;

        const total = parts.hose.geometry.index.count;
        parts.hose.geometry.setDrawRange(0, Math.max(6, Math.floor(total * etat.hoseDeploy)));

        const opacite = 1 - etat.dim;
        for (const m of materials) m.opacity = opacite;
        matAir.opacity = 0.55 * opacite * (0.3 + 0.7 * etat.airflow);

        // Particules : naissance proportionnelle au débit, puis dérive.
        const aNaitre = Math.floor(NB * 0.02 * etat.airflow);
        let nees = 0;
        for (let i = 0; i < NB; i++) {
          if (vies[i] <= 0) {
            if (nees < aNaitre) {
              naitre(i);
              nees++;
            } else {
              positions[i * 3 + 1] = 9999; // parquée hors champ
            }
            continue;
          }
          vies[i] -= dt;
          positions[i * 3] += vitesses[i * 3] * dt;
          positions[i * 3 + 1] += vitesses[i * 3 + 1] * dt;
          positions[i * 3 + 2] += vitesses[i * 3 + 2] * dt;
        }
        geoAir.attributes.position.needsUpdate = true;
      }

      function positionnerEtiquettes(etat) {
        const conteneur = labelsRef?.current;
        if (!conteneur) return;
        conteneur.style.opacity = String(etat.labels);
        conteneur.style.pointerEvents = etat.labels > 0.5 ? "auto" : "none";
        const l = window.innerWidth;
        const h = window.innerHeight;
        root.updateMatrixWorld();
        for (const ancre of anchors) {
          const noeud = conteneur.querySelector(`[data-ac-label="${ancre.id}"]`);
          if (!noeud) continue;
          const v = ancre.position.clone().applyMatrix4(root.matrixWorld).project(camera);
          noeud.style.transform =
            `translate(${(v.x * 0.5 + 0.5) * l}px, ${(-v.y * 0.5 + 0.5) * h}px)`;
        }
      }

      function dessiner(dt) {
        const etat = timelineState(window.scrollY, bornes, { coarsePointer: coarse });
        appliquer(etat, dt);
        positionnerEtiquettes(etat);
        bgUniforms.u_time.value = ecoule;
        bgUniforms.u_scroll.value = scrollProgress(
          window.scrollY,
          document.documentElement.scrollHeight,
          window.innerHeight
        );
        bgUniforms.u_mouse.value.set(souris.x, souris.y);
        renderer.clear();
        renderer.render(bgScene, bgCam);
        renderer.render(scene, camera);
      }

      function liberer() {
        if (image !== null) cancelAnimationFrame(image);
        scene.traverse((o) => {
          if (o.geometry) o.geometry.dispose();
        });
        for (const m of materials) m.dispose();
        matAir.dispose();
        geoAir.dispose();
        bgGeo.dispose();
        bgMat.dispose();
        envRT.dispose();
        pmrem.dispose();
        // Surtout PAS renderer.forceContextLoss() : en mode strict de React le
        // composant est remonté aussitôt et récupérerait un contexte mort.
        renderer.dispose();
      }

      redimensionner();
      canvas.style.opacity = "1";

      if (reduced) {
        dessiner(0);
        const surRedim = () => {
          redimensionner();
          dessiner(0);
        };
        window.addEventListener("resize", surRedim);
        nettoyer = () => {
          window.removeEventListener("resize", surRedim);
          liberer();
        };
        return;
      }

      function boucle() {
        const maintenant = performance.now();
        const dt = Math.min((maintenant - dernier) / 1000, 0.05);
        dernier = maintenant;
        ecoule += dt;
        souris.x = lerp(souris.x, sourisCible.x, 0.045);
        souris.y = lerp(souris.y, sourisCible.y, 0.045);
        dessiner(dt);
        image = requestAnimationFrame(boucle);
      }

      const surRedim = () => redimensionner();
      const surPointeur = (e) => {
        sourisCible = pointerToUv(e.clientX, e.clientY, window.innerWidth, window.innerHeight);
      };
      const surVisibilite = () => {
        if (document.hidden) {
          if (image !== null) cancelAnimationFrame(image);
          image = null;
        } else if (image === null) {
          dernier = performance.now();
          image = requestAnimationFrame(boucle);
        }
      };

      window.addEventListener("resize", surRedim);
      document.addEventListener("visibilitychange", surVisibilite);
      if (!coarse) window.addEventListener("pointermove", surPointeur, { passive: true });

      image = requestAnimationFrame(boucle);

      nettoyer = () => {
        window.removeEventListener("resize", surRedim);
        document.removeEventListener("visibilitychange", surVisibilite);
        window.removeEventListener("pointermove", surPointeur);
        liberer();
      };
    })();

    return () => {
      annule = true;
      if (nettoyer) nettoyer();
    };
  }, [sectionIds, labelsRef]);

  return <canvas ref={canvasRef} className="ac-scene" aria-hidden="true" />;
}
```

- [ ] **Step 2 : remplacer la règle CSS du canvas**

Dans `app/globals.css`, remplacer tout le bloc `/* ---- Fond animé de la page d'accueil ---- */` et sa règle `.backdrop3d` par :

```css
/* ---- Scène 3D de la page d'accueil ---- */
/* Canvas fixe en z-index négatif : au-dessus du dégradé du body (qui reste le
   repli si WebGL ou Three.js sont indisponibles) mais sous tout le contenu.
   L'opacité part de 0 et passe à 1 quand la scène est prête, pour éviter un
   aplat blanc pendant le chargement différé de Three.js. */
.ac-scene {
  position: fixed;
  inset: 0;
  z-index: -1;
  display: block;
  width: 100%;
  height: 100%;
  pointer-events: none;
  opacity: 0;
  transition: opacity 0.6s var(--ease);
}
```

- [ ] **Step 3 : brancher la scène dans `app/page.js`**

Remplacer l'import :

```js
import AcScene from "./AcScene";
```

Ajouter, après la constante `HERO_FACTS` :

```js
// Identifiants des cinq sections, dans l'ordre : ils donnent à la scène 3D les
// positions de bascule d'une étape du scénario à la suivante.
const SECTION_IDS = ["hero", "etapes", "modeles", "reassurance", "cta"];
```

Remplacer `<Backdrop3D />` par :

```jsx
      <AcScene sectionIds={SECTION_IDS} />
```

Poser les identifiants manquants sur les sections : ajouter `id="hero"` au `<section className="hero bleed">`, `id="reassurance"` à la section réassurance et `id="cta"` à la section du CTA final. Les sections `etapes` et `modeles` ont déjà le leur.

- [ ] **Step 4 : supprimer le code devenu mort**

```bash
git rm app/Backdrop3D.js
```

Dans `lib/backdrop.js`, supprimer la fonction `compile` et la fonction exportée `createProgram` — Three.js compile ses propres programmes. Conserver `renderScale`, `scrollProgress`, `lerp` et `pointerToUv`, toujours utilisés par la scène.

Dans `lib/backdrop.test.js`, supprimer l'import de `createProgram`, la fabrique `fakeGl` et les quatre tests `createProgram : ...`.

- [ ] **Step 5 : vérifier la compilation et les tests**

```bash
npm run build && npm test
```

Expected: compilation réussie ; 113 tests au vert (117 moins les 4 tests de `createProgram`). **Relever la ligne `┌ ƒ /` du tableau de tailles** : c'est la mesure du coût réel de Three.js, à comparer aux 3,17 kB / 99,1 kB d'avant.

- [ ] **Step 6 : vérifier visuellement**

Run: `npm run dev`, ouvrir `http://localhost:3000`
Expected : le climatiseur apparaît en fondu peu après le chargement, tourne lentement dans le hero. En défilant : il démarre et souffle, glisse à gauche sur les modèles, s'ouvre en vue éclatée sur la réassurance, se referme sur le CTA. Le fond de givre est toujours là, derrière.

Vérifier aussi la console : **aucune erreur au rechargement** (c'est le test du mode strict de React).

- [ ] **Step 7 : commit**

```bash
git add -A app/ lib/ package.json
git commit -m "feat(accueil): climatiseur 3D pilote par le defilement"
```

---

### Task 5 : `app/AcLabels.js` — les étiquettes de la vue éclatée

**Files:**
- Create: `app/AcLabels.js`
- Create: `app/AcStage.js` (porte la ref partagée entre la scène et les étiquettes)
- Modify: `app/AcScene.js` (une ligne : le recentrage des étiquettes)
- Modify: `app/globals.css` (styles `.ac-labels`)
- Modify: `app/page.js` (monte `AcStage` à la place de `AcScene`)

**Interfaces:**
- Consumes: le positionnement par projection déjà écrit dans `AcScene` (`positionnerEtiquettes`), qui cherche les éléments par `[data-ac-label="<id>"]` et pilote l'opacité du conteneur.
- Produces: composant `<AcLabels />` avec `forwardRef`, rendant un `<ul>` de quatre `<li>` portant les attributs `data-ac-label` `intake`, `circuit`, `output`, `exhaust`.

- [ ] **Step 1 : créer le composant**

Créer `app/AcLabels.js` :

```jsx
"use client";

import { forwardRef, useEffect, useState } from "react";

// Étiquettes de la vue éclatée. Ce sont de vrais textes HTML, jamais des
// textures : ils restent nets à tout zoom et sont lus par les lecteurs d'écran.
//
// Deux régimes. Quand la scène 3D tourne, AcScene place chaque étiquette au
// bon endroit à l'écran par projection et pilote l'opacité du conteneur.
// Sinon — animations réduites, WebGL absent, Three.js non chargé — la liste
// reste dans le flux normal de la page : l'information n'est jamais perdue.

const ETIQUETTES = [
  { id: "intake", texte: "Air chaud aspiré" },
  { id: "circuit", texte: "Refroidi par le circuit" },
  { id: "output", texte: "Soufflé frais" },
  { id: "exhaust", texte: "Air chaud évacué par la fenêtre" },
];

const AcLabels = forwardRef(function AcLabels(props, ref) {
  const [flottant, setFlottant] = useState(false);

  useEffect(() => {
    // Le positionnement flottant n'a de sens que si la scène peut tourner.
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) return;
    const test = document.createElement("canvas");
    const gl = test.getContext("webgl");
    if (gl) setFlottant(true);
  }, []);

  return (
    <ul ref={ref} className={`ac-labels ${flottant ? "floating" : ""}`}>
      {ETIQUETTES.map((e) => (
        <li key={e.id} data-ac-label={e.id}>
          {e.texte}
        </li>
      ))}
    </ul>
  );
});

export default AcLabels;
```

- [ ] **Step 2 : ajouter les styles**

Dans `app/globals.css`, à la suite de la règle `.ac-scene` :

```css
/* ---- Étiquettes de la vue éclatée ---- */
/* Régime par défaut (pas de 3D) : une liste ordinaire dans le flux. */
.ac-labels {
  list-style: none;
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 10px;
  margin-top: clamp(20px, 3vh, 34px);
}
.ac-labels li {
  background: rgba(255, 255, 255, 0.78);
  backdrop-filter: blur(10px);
  border: 1px solid rgba(63, 182, 224, 0.25);
  border-radius: 100px;
  padding: 8px 16px;
  font-size: 13px;
  font-weight: 600;
  color: var(--navy);
  white-space: nowrap;
}

/* Régime 3D : AcScene place chaque étiquette par projection. Le conteneur
   sort du flux, et translate(-50%, -50%) recentre chaque pastille sur son
   point d'accroche — le transform de position est posé par le script. */
.ac-labels.floating {
  position: fixed;
  inset: 0;
  z-index: 2;
  display: block;
  margin: 0;
  opacity: 0;
  pointer-events: none;
}
.ac-labels.floating li {
  position: absolute;
  top: 0;
  left: 0;
  box-shadow: 0 10px 26px rgba(18, 115, 166, 0.16);
}

@media (max-width: 820px) {
  .ac-labels li { font-size: 12px; padding: 7px 13px; white-space: normal; }
}
```

**Attention au conflit de `transform`** : `AcScene` écrit `element.style.transform = translate(x, y)`. Le recentrage sur le point d'accroche ne peut donc pas passer par un second `transform`. Il est obtenu par `translate(-50%, -50%)` **inclus dans la chaîne écrite par le script** — modifier la ligne correspondante de `app/AcScene.js` :

```js
          noeud.style.transform =
            `translate(${(v.x * 0.5 + 0.5) * l}px, ${(-v.y * 0.5 + 0.5) * h}px) translate(-50%, -50%)`;
```

- [ ] **Step 3 : brancher dans `app/page.js`**

`app/page.js` est un composant serveur : il ne peut pas créer de `ref`. Le lien entre la scène et les étiquettes se fait donc dans un petit composant client qui possède les deux.

Créer `app/AcStage.js` :

```jsx
"use client";

import { useRef } from "react";
import AcScene from "./AcScene";
import AcLabels from "./AcLabels";

// Réunit la scène 3D et ses étiquettes : c'est ici que vit la ref partagée,
// impossible à créer depuis app/page.js qui est un composant serveur.
export default function AcStage({ sectionIds }) {
  const labelsRef = useRef(null);
  return (
    <>
      <AcScene sectionIds={sectionIds} labelsRef={labelsRef} />
      <AcLabels ref={labelsRef} />
    </>
  );
}
```

Dans `app/page.js`, remplacer l'import `AcScene` par :

```js
import AcStage from "./AcStage";
```

et la balise `<AcScene sectionIds={SECTION_IDS} />` par :

```jsx
      <AcStage sectionIds={SECTION_IDS} />
```

- [ ] **Step 4 : vérifier la compilation et les tests**

```bash
npm run build && npm test
```

Expected: compilation réussie, 113 tests au vert.

- [ ] **Step 5 : vérifier visuellement**

Run: `npm run dev`, ouvrir `http://localhost:3000`
Expected : en arrivant sur la section réassurance, les quatre étiquettes apparaissent en fondu, accrochées aux bons endroits de la machine ouverte, et suivent les pièces quand elle tourne. Elles disparaissent en arrivant sur le CTA.

Avec « Réduire les animations » activé : les quatre étiquettes s'affichent en pastilles alignées dans la page, sans positionnement flottant.

- [ ] **Step 6 : commit**

```bash
git add app/AcLabels.js app/AcStage.js app/AcScene.js app/globals.css app/page.js
git commit -m "feat(accueil): etiquettes explicatives de la vue eclatee"
```

---

### Task 6 : recette et réglages

**Files:**
- Modify: `lib/acTimeline.js`, `lib/acModel.js`, `app/globals.css` — seulement si un défaut est constaté

**Interfaces:**
- Consumes: tout ce qui précède.
- Produces: rien.

- [ ] **Step 1 : suite complète et mesure du poids**

```bash
npm run build && npm test
```

Expected: compilation sans erreur ni avertissement, 113 tests au vert.

Relever la ligne `┌ ƒ /` et la comparer à l'état d'avant Three.js (3,17 kB / 99,1 kB de `First Load JS`). **Si le `First Load JS` de `/` a augmenté de plus de 20 kB, c'est que Three.js s'est retrouvé dans le paquet initial au lieu d'être chargé en différé** : vérifier que l'import de `three` dans `app/AcScene.js` est bien un `await import("three")` à l'intérieur de l'effet, et non un import statique en tête de fichier.

- [ ] **Step 2 : ordinateur**

`npm run dev`, ouvrir `http://localhost:3000` en 1440×900.
Expected :
- Le texte du hero est lisible immédiatement, avant même l'apparition de la machine.
- Les cinq scènes s'enchaînent sans à-coup en défilant, dans les deux sens.
- Le texte reste lisible à tout moment : la machine ne passe jamais à pleine opacité derrière un paragraphe.
- Aucune barre de défilement horizontale.

Si la machine gêne la lecture sur la section des modèles, augmenter `effacementModeles` dans `lib/acTimeline.js` (0.45 → 0.6).

- [ ] **Step 3 : mobile**

Émuler un iPhone (390×844, `pointer: coarse`).
Expected :
- La machine reste centrée derrière le texte, nettement effacée.
- Le défilement reste fluide, sans saccade ni chauffe.
- Les étiquettes tiennent sur l'écran sans déborder.

Si ça saccade, dans l'ordre : réduire `particleCount(true)` de 300 à 150 dans `lib/acTimeline.js` ; puis passer `clearcoat` à 0 pour le matériau `laque` de `lib/acModel.js` sur pointeur grossier.

- [ ] **Step 4 : animations réduites**

Forcer `prefers-reduced-motion: reduce` puis recharger.
Expected : une image fixe de la machine, rien qui bouge, aucune particule, et les quatre étiquettes affichées en liste dans le flux de la page.

- [ ] **Step 5 : mode strict de React**

Recharger la page plusieurs fois d'affilée et regarder la console.
Expected : **aucune erreur**, en particulier aucun message mentionnant un contexte WebGL ou `shaderSource`. C'est le test de non-régression du commit `eaf0836`.

- [ ] **Step 6 : non-régression des autres pages**

Ouvrir `/reserver/seine`, `/reserver/confirmation/<une-référence>`, `/admin/connexion`, `/admin`, `/admin/produits`.
Expected : mise en page inchangée, aucune scène 3D, aucune barre horizontale.

- [ ] **Step 7 : corriger si nécessaire, puis commit**

Si un réglage a été modifié aux étapes 2 à 4 :

```bash
git add -A app/ lib/
git commit -m "fix(accueil): reglages de la scene 3D apres recette"
```

Sinon, ne rien committer et le signaler.

---

## Récapitulatif des fichiers

| Fichier | Action | Responsabilité |
|---|---|---|
| `lib/acTimeline.js` + test | créé | Défilement → état de la scène. Pur, testé. |
| `lib/acModel.js` + test | créé | Géométrie du climatiseur et studio d'éclairage |
| `lib/frostShader.js` | créé | Sources GLSL du fond de givre, partagées |
| `lib/backdrop.js` + test | modifié | `createProgram` et `compile` retirés ; le reste sert à la scène |
| `app/AcScene.js` | créé | Canvas, chargement différé de Three.js, boucle de rendu |
| `app/AcLabels.js` | créé | Étiquettes, en flux ou flottantes |
| `app/AcStage.js` | créé | Réunit les deux et porte la ref partagée |
| `app/Backdrop3D.js` | **supprimé** | Remplacé par `AcScene` |
| `app/globals.css` | modifié | `.ac-scene`, `.ac-labels` ; `.backdrop3d` retirée |
| `app/page.js` | modifié | Monte `AcStage`, pose les identifiants des cinq sections |
| `package.json` | modifié | Ajout de `three` |
