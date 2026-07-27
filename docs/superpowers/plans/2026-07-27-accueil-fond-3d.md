# Page d'accueil : fond 3D et sections pleine largeur — plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Donner à la page d'accueil un fond WebGL animé en profondeur et des sections pleine largeur inspirées d'Apple, sans changer le thème ni toucher aux 6 autres pages.

**Architecture :** La logique pure du fond (échelle de rendu, progression de défilement, lissage, position du pointeur) vit dans `lib/backdrop.js`, testée avec `node:test` comme le reste de `lib/`. Le composant client `app/Backdrop3D.js` ne contient que le pilotage WebGL et le cycle de vie des écouteurs. La pleine largeur est obtenue par une classe CSS `.bleed` appliquée uniquement aux sections de l'accueil, sans lever la contrainte `max-width: 1080px` de `main` qui reste juste pour le tunnel de réservation et le back-office.

**Tech Stack :** Next.js 14 (App Router), React 18, WebGL 1 brut (aucun package ajouté), CSS dans `app/globals.css`, tests `node --test lib/`.

**Spec de référence :** `docs/superpowers/specs/2026-07-27-accueil-fond-3d-design.md`

## Global Constraints

- **Aucune dépendance npm ajoutée.** Ni Three.js, ni React Three Fiber, ni aucune autre. `package.json` ne doit pas changer.
- **Aucune couleur hors thème.** Uniquement les valeurs déjà présentes dans `:root` de `app/globals.css` : `--navy #0a1f33`, `--ice #eaf6fb`, `--frost #bfe7f5`, `--cool #3fb6e0`, `--deep #1273a6`, `--sun #ff8a5c`, plus les trois teintes du dégradé du `body` : `#dff2fa`, `#eaf6fb`, `#f6fbfd`.
- **Aucune modification des pages `/reserver/[slug]`, `/reserver/confirmation/[reference]`, `/admin`, `/admin/connexion`, `/admin/produits`.** Leur largeur et leur mise en page doivent rester identiques.
- **`overflow-x: clip` sur `html`, jamais `overflow-x: hidden`, jamais sur `body`.** Deux raisons distinctes : `hidden` créerait un conteneur de défilement qui casserait le `position: sticky` de `.recap` sur la page réservation ; et posé sur `body`, le rognage porterait sur un sous-arbre contenant le canvas en `position: fixed`, que certains navigateurs rognent alors. Sur `html`, l'`overflow` est propagé au viewport, qui ne rogne pas les éléments fixes.
- **`100svh` et jamais `100vh`** pour la hauteur du hero : `100vh` inclut la barre d'URL sur Safari iPhone et provoque un saut au premier défilement.
- **`prefers-reduced-motion: reduce` respecté** partout : aucune boucle d'animation, aucune animation CSS.
- **Le fichier `app/HeroMedia.js` n'est pas supprimé.** Il n'est plus importé, c'est tout. Il n'est pas suivi par git, une suppression serait irréversible.
- **Commentaires et textes d'interface en français**, comme le reste du dépôt.

---

### Task 1 : logique pure du fond dans `lib/backdrop.js`

**Files:**
- Create: `lib/backdrop.js`
- Test: `lib/backdrop.test.js`

**Interfaces:**
- Consumes: rien.
- Produces: quatre fonctions pures importées par `app/Backdrop3D.js` en Task 2.
  - `renderScale(devicePixelRatio: number, coarsePointer: boolean) => number`
  - `scrollProgress(scrollY: number, documentHeight: number, viewportHeight: number) => number` (0 à 1)
  - `lerp(from: number, to: number, factor: number) => number`
  - `pointerToUv(clientX: number, clientY: number, width: number, height: number) => { x: number, y: number }`

- [ ] **Step 1 : écrire le test qui échoue**

Créer `lib/backdrop.test.js` :

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { renderScale, scrollProgress, lerp, pointerToUv } from "./backdrop.js";

test("renderScale : plafonné à 1.5 sur pointeur fin", () => {
  assert.equal(renderScale(3, false), 1.5);
  assert.equal(renderScale(2, false), 1.5);
});

test("renderScale : plafonné à 1.25 sur pointeur grossier (mobile)", () => {
  assert.equal(renderScale(3, true), 1.25);
});

test("renderScale : un écran non-retina garde son ratio", () => {
  assert.equal(renderScale(1, false), 1);
  assert.equal(renderScale(1, true), 1);
});

test("renderScale : valeur absente ou aberrante repliée sur 1", () => {
  assert.equal(renderScale(undefined, false), 1);
  assert.equal(renderScale(0, false), 1);
  assert.equal(renderScale(NaN, false), 1);
  assert.equal(renderScale(-2, false), 1);
});

test("scrollProgress : va de 0 en haut à 1 en bas", () => {
  assert.equal(scrollProgress(0, 3000, 1000), 0);
  assert.equal(scrollProgress(1000, 3000, 1000), 0.5);
  assert.equal(scrollProgress(2000, 3000, 1000), 1);
});

test("scrollProgress : borné même en cas de rebond élastique", () => {
  assert.equal(scrollProgress(-120, 3000, 1000), 0);
  assert.equal(scrollProgress(9999, 3000, 1000), 1);
});

test("scrollProgress : page plus courte que l'écran renvoie 0", () => {
  assert.equal(scrollProgress(0, 600, 1000), 0);
  assert.equal(scrollProgress(50, 1000, 1000), 0);
});

test("lerp : interpole entre les deux bornes", () => {
  assert.equal(lerp(0, 10, 0), 0);
  assert.equal(lerp(0, 10, 1), 10);
  assert.equal(lerp(0, 10, 0.25), 2.5);
  assert.equal(lerp(4, 2, 0.5), 3);
});

test("pointerToUv : centre de l'écran au milieu, axe Y inversé pour WebGL", () => {
  assert.deepEqual(pointerToUv(500, 400, 1000, 800), { x: 0.5, y: 0.5 });
  assert.deepEqual(pointerToUv(0, 0, 1000, 800), { x: 0, y: 1 });
  assert.deepEqual(pointerToUv(1000, 800, 1000, 800), { x: 1, y: 0 });
});

test("pointerToUv : position hors écran ramenée dans les bornes", () => {
  assert.deepEqual(pointerToUv(-300, -300, 1000, 800), { x: 0, y: 1 });
  assert.deepEqual(pointerToUv(4000, 4000, 1000, 800), { x: 1, y: 0 });
});

test("pointerToUv : dimensions nulles repliées sur le centre", () => {
  assert.deepEqual(pointerToUv(10, 10, 0, 0), { x: 0.5, y: 0.5 });
});
```

- [ ] **Step 2 : lancer les tests pour vérifier qu'ils échouent**

Run: `npm test`
Expected: ÉCHEC — `Cannot find module '.../lib/backdrop.js'`

- [ ] **Step 3 : écrire l'implémentation**

Créer `lib/backdrop.js` :

```js
// Logique pure du fond animé de la page d'accueil (voir app/Backdrop3D.js).
// Isolée ici pour être testable sans navigateur, comme le reste de lib/.

// Résolution de rendu du canvas. On plafonne le ratio de pixels : au-delà,
// le gain visuel est nul sur une animation floue alors que le coût GPU
// double. Plafond plus bas sur mobile (pointeur grossier) pour la batterie.
export function renderScale(devicePixelRatio, coarsePointer) {
  const dpr =
    Number.isFinite(devicePixelRatio) && devicePixelRatio > 0
      ? devicePixelRatio
      : 1;
  return Math.min(dpr, coarsePointer ? 1.25 : 1.5);
}

// Progression du défilement de la page, ramenée entre 0 (haut) et 1 (bas).
// Renvoie 0 si la page n'est pas défilable, pour éviter une division par zéro.
export function scrollProgress(scrollY, documentHeight, viewportHeight) {
  const scrollable = documentHeight - viewportHeight;
  if (!(scrollable > 0)) return 0;
  return Math.min(1, Math.max(0, scrollY / scrollable));
}

// Interpolation linéaire, utilisée pour lisser le suivi de la souris : sans
// elle, le fond suivrait le curseur au pixel près et paraîtrait nerveux.
export function lerp(from, to, factor) {
  return from + (to - from) * factor;
}

// Position du pointeur en coordonnées de texture WebGL : origine en bas à
// gauche, d'où l'inversion de l'axe Y par rapport aux coordonnées du DOM.
export function pointerToUv(clientX, clientY, width, height) {
  if (!(width > 0) || !(height > 0)) return { x: 0.5, y: 0.5 };
  return {
    x: Math.min(1, Math.max(0, clientX / width)),
    y: Math.min(1, Math.max(0, 1 - clientY / height)),
  };
}
```

- [ ] **Step 4 : lancer les tests pour vérifier qu'ils passent**

Run: `npm test`
Expected: SUCCÈS — les 11 nouveaux tests passent, et les tests existants de `lib/` restent verts.

- [ ] **Step 5 : commit**

```bash
git add lib/backdrop.js lib/backdrop.test.js
git commit -m "feat(accueil): logique pure du fond anime (echelle, scroll, lissage)"
```

---

### Task 2 : le composant `app/Backdrop3D.js`

**Files:**
- Create: `app/Backdrop3D.js`
- Modify: `app/globals.css` (ajout de la règle `.backdrop3d`)
- Modify: `app/page.js` (import et montage du composant, une ligne chacun)

**Interfaces:**
- Consumes: `renderScale`, `scrollProgress`, `lerp`, `pointerToUv` depuis `../lib/backdrop` (Task 1).
- Produces: composant React par défaut `<Backdrop3D />`, sans props. Rend un `<canvas className="backdrop3d" aria-hidden="true" />`, ou `null` si WebGL est indisponible. Task 3 et Task 4 s'appuient sur le fait que ce canvas est en `position: fixed; z-index: -1` et n'intercepte aucun clic.

- [ ] **Step 1 : créer le composant**

Créer `app/Backdrop3D.js` :

```jsx
"use client";

import { useEffect, useRef } from "react";
import { renderScale, scrollProgress, lerp, pointerToUv } from "../lib/backdrop";

// Fond animé de la page d'accueil : trois nappes de givre superposées qui
// dérivent lentement à des profondeurs différentes. Le décalage entre les
// nappes selon le défilement et la souris est ce qui crée le relief.
// WebGL brut, aucune dépendance. Si le contexte n'est pas disponible, le
// composant ne rend rien : le dégradé CSS du body reste visible.

const VERTEX_SRC = `
attribute vec2 a_pos;
void main() {
  gl_Position = vec4(a_pos, 0.0, 1.0);
}
`;

const FRAGMENT_SRC = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif

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

function compile(gl, type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    gl.deleteShader(shader);
    return null;
  }
  return shader;
}

function createProgram(gl) {
  const vs = compile(gl, gl.VERTEX_SHADER, VERTEX_SRC);
  const fs = compile(gl, gl.FRAGMENT_SHADER, FRAGMENT_SRC);
  if (!vs || !fs) return null;
  const program = gl.createProgram();
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    gl.deleteProgram(program);
    return null;
  }
  return program;
}

export default function Backdrop3D() {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let gl = null;
    try {
      gl = canvas.getContext("webgl", {
        alpha: false,
        depth: false,
        stencil: false,
        antialias: false,
        powerPreference: "low-power",
      });
    } catch {
      gl = null;
    }
    if (!gl) return;

    const program = createProgram(gl);
    if (!program) return;

    // Un seul triangle surdimensionné couvre tout l'écran : moins de sommets
    // qu'un quad, et pas de diagonale au milieu.
    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 3, -1, -1, 3]),
      gl.STATIC_DRAW
    );
    gl.useProgram(program);
    const aPos = gl.getAttribLocation(program, "a_pos");
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

    const uRes = gl.getUniformLocation(program, "u_res");
    const uTime = gl.getUniformLocation(program, "u_time");
    const uScroll = gl.getUniformLocation(program, "u_scroll");
    const uMouse = gl.getUniformLocation(program, "u_mouse");

    const coarse = window.matchMedia("(pointer: coarse)").matches;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const scale = renderScale(window.devicePixelRatio, coarse);

    let mouse = { x: 0.5, y: 0.5 };
    let target = { x: 0.5, y: 0.5 };
    let scroll = 0;
    let elapsed = 0;
    let last = performance.now();
    let frame = null;

    function resize() {
      const w = Math.max(1, Math.round(window.innerWidth * scale));
      const h = Math.max(1, Math.round(window.innerHeight * scale));
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
        gl.viewport(0, 0, w, h);
      }
    }

    function draw() {
      gl.uniform2f(uRes, canvas.width, canvas.height);
      gl.uniform1f(uTime, elapsed);
      gl.uniform1f(uScroll, scroll);
      gl.uniform2f(uMouse, mouse.x, mouse.y);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }

    function dispose() {
      if (frame !== null) cancelAnimationFrame(frame);
      gl.deleteProgram(program);
      gl.deleteBuffer(buffer);
      gl.getExtension("WEBGL_lose_context")?.loseContext();
    }

    resize();

    // Animations réduites : une seule image, aucune boucle, aucun écouteur
    // de scroll ni de souris.
    if (reduced) {
      draw();
      const onResizeStatic = () => {
        resize();
        draw();
      };
      window.addEventListener("resize", onResizeStatic);
      return () => {
        window.removeEventListener("resize", onResizeStatic);
        dispose();
      };
    }

    function loop() {
      const now = performance.now();
      // Le pas de temps est borné : au retour d'un onglet en arrière-plan,
      // sans ce plafond l'animation ferait un bond visible.
      elapsed += Math.min((now - last) / 1000, 0.05);
      last = now;
      mouse.x = lerp(mouse.x, target.x, 0.045);
      mouse.y = lerp(mouse.y, target.y, 0.045);
      draw();
      frame = requestAnimationFrame(loop);
    }

    const onScroll = () => {
      scroll = scrollProgress(
        window.scrollY,
        document.documentElement.scrollHeight,
        window.innerHeight
      );
    };
    const onPointer = (e) => {
      target = pointerToUv(e.clientX, e.clientY, window.innerWidth, window.innerHeight);
    };
    const onResize = () => resize();
    const onVisibility = () => {
      if (document.hidden) {
        if (frame !== null) cancelAnimationFrame(frame);
        frame = null;
      } else if (frame === null) {
        last = performance.now();
        frame = requestAnimationFrame(loop);
      }
    };

    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onResize);
    document.addEventListener("visibilitychange", onVisibility);
    if (!coarse) window.addEventListener("pointermove", onPointer, { passive: true });

    frame = requestAnimationFrame(loop);

    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onResize);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pointermove", onPointer);
      dispose();
    };
  }, []);

  return <canvas ref={canvasRef} className="backdrop3d" aria-hidden="true" />;
}
```

- [ ] **Step 2 : ajouter la règle CSS du canvas**

Dans `app/globals.css`, juste après le bloc `body { ... }`, insérer :

```css
/* ---- Fond animé de la page d'accueil ---- */
/* Le canvas est fixe et en z-index négatif : il passe au-dessus du dégradé
   du body (qui reste le repli si WebGL est indisponible) mais sous tout le
   contenu. pointer-events: none pour ne jamais intercepter un clic. */
.backdrop3d {
  position: fixed;
  inset: 0;
  z-index: -1;
  display: block;
  width: 100%;
  height: 100%;
  pointer-events: none;
}
```

- [ ] **Step 3 : monter le composant sur l'accueil**

Dans `app/page.js`, ajouter l'import après la ligne `import HeroMedia from "./HeroMedia";` :

```js
import Backdrop3D from "./Backdrop3D";
```

et, juste après l'ouverture de `<div>` dans le `return` :

```jsx
    <div>
      <Backdrop3D />
```

- [ ] **Step 4 : vérifier que la compilation passe**

Run: `npm run build`
Expected: SUCCÈS, aucune erreur de compilation ni d'ESLint.

- [ ] **Step 5 : vérifier visuellement**

Run: `npm run dev` puis ouvrir `http://localhost:3000`
Expected: le fond n'est plus un dégradé plat — des nappes claires ondulent lentement. En bougeant la souris, le fond se décale légèrement. En défilant, il se décale davantage. Le contenu de la page reste entièrement cliquable.

- [ ] **Step 6 : commit**

```bash
git add app/Backdrop3D.js app/globals.css app/page.js
git commit -m "feat(accueil): fond WebGL anime en trois nappes de givre"
```

---

### Task 3 : pleine largeur et hero pleine hauteur

**Files:**
- Modify: `app/globals.css` (règle `main`, `:root`, ajout `.bleed`/`.bleed-inner`, remplacement du bloc « Page d'accueil » lignes ~192-264)
- Modify: `app/page.js` (constante `HERO_FACTS`, remplacement du `<section className="hero">`)

**Interfaces:**
- Consumes: le canvas de Task 2, déjà monté.
- Produces: classes CSS `.bleed` et `.bleed-inner` réutilisées par Task 4 sur toutes les autres sections de l'accueil, et variable CSS `--nav-offset` (120px, 96px sous 820px).

- [ ] **Step 1 : introduire `--nav-offset` et libérer l'axe horizontal**

Dans `app/globals.css`, remplacer dans `:root` en ajoutant une variable, puis les règles `body` et `main`.

Ajouter dans le bloc `:root` (après `--ease`) :

```css
  --nav-offset: 120px;
```

Ajouter, juste après la règle `* { margin: 0; ... }`, une nouvelle règle `html` :

```css
/* Empêche la barre de défilement horizontale que provoquerait le 100vw des
   sections .bleed (100vw inclut la largeur de la barre de défilement).
   "clip" et non "hidden" : "hidden" créerait un conteneur de défilement qui
   casserait le position:sticky du récapitulatif de réservation (.recap).
   Sur html et non sur body : posé sur body, le rognage porterait sur un
   sous-arbre contenant le canvas en position:fixed, que certains navigateurs
   rognent alors. Sur html, l'overflow est propagé au viewport, qui ne rogne
   pas les éléments fixes. */
html { overflow-x: clip; }
```

La règle `body` n'est pas modifiée.

Remplacer la règle `main` :

```css
main { flex: 1; max-width: 1080px; width: 100%; margin: 0 auto; padding: var(--nav-offset) 24px 80px; }
```

Dans le premier `@media (max-width: 820px)` (celui qui contient `.topnav { padding: 12px 18px; }`), remplacer la ligne `main { padding-top: 96px; }` par :

```css
  :root { --nav-offset: 96px; }
```

- [ ] **Step 2 : ajouter les classes de pleine largeur**

Dans `app/globals.css`, dans le bloc `/* ---- Page d'accueil (étape 6) ---- */`, avant la règle `.hero`, insérer :

```css
/* Sections pleine largeur : elles sortent du conteneur 1080px de <main> sans
   qu'il faille lever sa contrainte, qui reste juste pour les autres pages.
   100vw inclut la barre de défilement, d'où le overflow-x: clip sur body. */
.bleed { width: 100vw; margin-left: calc(50% - 50vw); }
.bleed-inner {
  max-width: 1240px;
  margin: 0 auto;
  padding: 0 clamp(20px, 4vw, 48px);
}
```

- [ ] **Step 3 : remplacer les styles du hero**

Dans `app/globals.css`, supprimer intégralement les règles `.hero`, `.hero-copy`, `.hero-cards`, `.hero-media`, `.hero-media-fill`, `.hero-media::after`, `.hero-card`, `.hero-card small`, `.hero-card-1`, `.hero-card-2`, `.hero-card-3` et le bloc `@keyframes hero-float`. Les remplacer par :

```css
.hero {
  min-height: calc(100svh - var(--nav-offset));
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
  padding: clamp(40px, 6vh, 80px) 0;
}
.hero-inner {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  gap: clamp(16px, 2.2vw, 26px);
}
.hero-title {
  font-size: clamp(44px, 9vw, 108px);
  line-height: 0.95;
  letter-spacing: -0.03em;
  margin: 0;
  max-width: 16ch;
}
.hero-sub {
  max-width: 52ch;
  font-size: clamp(16px, 1.6vw, 21px);
  font-weight: 300;
  color: #33536b;
  line-height: 1.6;
}
.hero-actions { display: flex; flex-wrap: wrap; gap: 14px; justify-content: center; }
.btn-ghost {
  background: rgba(255, 255, 255, 0.7);
  color: var(--navy);
  border: 1px solid rgba(63, 182, 224, 0.35);
  backdrop-filter: blur(10px);
}
.btn-ghost:hover { transform: translateY(-2px); box-shadow: 0 12px 26px rgba(18, 115, 166, 0.14); }

.hero-facts {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: clamp(10px, 2vw, 22px);
  margin-top: clamp(8px, 2vh, 20px);
}
.hero-fact {
  display: flex;
  align-items: baseline;
  gap: 8px;
  background: rgba(255, 255, 255, 0.62);
  backdrop-filter: blur(12px);
  border: 1px solid rgba(63, 182, 224, 0.22);
  border-radius: 100px;
  padding: 10px 20px;
  font-size: 14px;
  font-weight: 600;
  color: var(--navy);
  box-shadow: 0 10px 26px rgba(18, 115, 166, 0.08);
}
.hero-fact small { font-weight: 400; color: #5c7d94; font-size: 12.5px; }

.hero-scroll {
  position: absolute;
  bottom: clamp(12px, 3vh, 32px);
  left: 50%;
  font-size: 20px;
  color: var(--deep);
  opacity: 0.5;
  animation: hero-nudge 2.4s ease-in-out infinite;
}
@keyframes hero-nudge {
  0%, 100% { transform: translate(-50%, 0); }
  50% { transform: translate(-50%, 8px); }
}
```

Dans le bloc `@media (prefers-reduced-motion: reduce)` du même fichier, remplacer la ligne `.hero-card { animation: none; }` par :

```css
  .hero-scroll { animation: none; transform: translate(-50%, 0); }
```

Dans le dernier `@media (max-width: 820px)` du bloc accueil, remplacer les lignes concernant le hero (`.hero`, `.hero-copy`, `.hero-cards`, `.hero-media`, `.hero-card`) par :

```css
  .hero-facts { flex-direction: column; align-items: stretch; width: 100%; max-width: 340px; }
  .hero-fact { justify-content: center; }
  .hero-actions { width: 100%; flex-direction: column; align-items: stretch; max-width: 340px; }
```

En gardant la ligne existante `.steps, .reassurance { grid-template-columns: 1fr; }`.

- [ ] **Step 4 : réécrire le hero dans `app/page.js`**

Ajouter après la constante `STEPS` :

```js
const HERO_FACTS = [
  { label: "🚚 Livraison 24h", detail: "Paris & petite couronne" },
  { label: "💶 dès 12€/jour", detail: "tarif dégressif" },
  { label: "✓ Sans engagement", detail: "caution simple" },
];
```

Remplacer tout le bloc `<section className="hero"> ... </section>` par :

```jsx
      <section className="hero bleed">
        <div className="hero-inner bleed-inner">
          <span className="eyebrow">Paris · Livraison en 24h</span>
          <h1 className="hero-title">
            L&apos;été à Paris,
            <br />
            <span style={{ color: "var(--cool)" }}>enfin frais.</span>
          </h1>
          <p className="hero-sub">
            Louez un climatiseur mobile, livré et installé chez vous. Sans
            travaux, sans engagement, sans transpirer.
          </p>
          <div className="hero-actions">
            <Link href="#modeles" className="btn btn-primary">
              Voir les climatiseurs
            </Link>
            <Link href="#etapes" className="btn btn-ghost">
              Comment ça marche
            </Link>
          </div>
          <div className="hero-facts">
            {HERO_FACTS.map((f) => (
              <span className="hero-fact" key={f.label}>
                {f.label} <small>{f.detail}</small>
              </span>
            ))}
          </div>
        </div>
        <span className="hero-scroll" aria-hidden="true">
          ↓
        </span>
      </section>
```

Supprimer la ligne `import HeroMedia from "./HeroMedia";` en haut du fichier. **Ne pas supprimer le fichier `app/HeroMedia.js`.**

- [ ] **Step 5 : vérifier la compilation et les tests**

Run: `npm run build && npm test`
Expected: SUCCÈS des deux. Aucun avertissement sur un import inutilisé.

- [ ] **Step 6 : vérifier visuellement**

Run: `npm run dev` puis ouvrir `http://localhost:3000`
Expected : le hero occupe exactement la hauteur de l'écran sous la barre de navigation, tout est centré, les 3 pastilles d'arguments sont sous les boutons, la flèche pulse en bas. **Aucune barre de défilement horizontale.** Ouvrir `http://localhost:3000/reserver/<un-slug>` : la page conserve sa largeur 1080px et son récapitulatif reste collant au défilement.

Normal à ce stade : le bouton « Comment ça marche » pointe vers `#etapes`, une ancre qui n'existe pas encore. Elle est créée en Task 4. Ne pas la corriger ici.

- [ ] **Step 7 : commit**

```bash
git add app/globals.css app/page.js
git commit -m "feat(accueil): hero plein ecran centre et sections pleine largeur"
```

---

### Task 4 : les quatre sections restantes en pleine largeur

**Files:**
- Modify: `app/page.js` (sections étapes, modèles, réassurance, CTA)
- Modify: `app/globals.css` (`.section-band`, `.home-section`, `.section-title` de l'accueil, `.steps`, `.reassurance`, `#etapes`)

**Interfaces:**
- Consumes: `.bleed` et `.bleed-inner` de Task 3 ; le composant `Reveal` existant, qui n'accepte que `children` et `className` (pas de prop `id`), d'où l'usage d'un `<section>` porteur de l'`id` autour de chaque `Reveal`.
- Produces: rien pour les tâches suivantes.

- [ ] **Step 1 : ajouter les styles de section**

Dans `app/globals.css`, remplacer la règle `.home-section { margin-top: 90px; }` par :

```css
.home-section { margin-top: clamp(70px, 11vh, 130px); }

/* Bande de verre dépoli, pleine largeur : laisse deviner le fond animé
   derrière tout en gardant le texte lisible. */
.section-band {
  background: rgba(255, 255, 255, 0.55);
  backdrop-filter: blur(16px);
  border-top: 1px solid rgba(255, 255, 255, 0.7);
  border-bottom: 1px solid rgba(63, 182, 224, 0.14);
  padding: clamp(50px, 8vh, 96px) 0;
}
.home-section .section-title { font-size: clamp(26px, 3.4vw, 44px); margin: 6px 0 clamp(20px, 3vh, 36px); }
```

Remplacer la règle `.steps` par :

```css
.steps { display: grid; grid-template-columns: repeat(3, 1fr); gap: clamp(20px, 3vw, 40px); margin-top: clamp(24px, 4vh, 44px); }
```

Remplacer la règle `.reassurance` par :

```css
.reassurance { display: grid; grid-template-columns: repeat(4, 1fr); gap: clamp(14px, 2vw, 28px); }
```

Remplacer la règle `#modeles { scroll-margin-top: 100px; }` par :

```css
#modeles, #etapes { scroll-margin-top: 100px; }
```

- [ ] **Step 2 : réécrire les quatre sections dans `app/page.js`**

Remplacer les quatre blocs `<Reveal className="home-section">…</Reveal>` restants par :

```jsx
      <section id="etapes" className="home-section section-band bleed">
        <Reveal className="bleed-inner">
          <span className="eyebrow">Comment ça marche</span>
          <h2 className="section-title">3 étapes, zéro complication</h2>
          <div className="steps">
            {STEPS.map((s, i) => (
              <div className="step" key={s.title}>
                <span className="step-num">{i + 1}</span>
                <strong>{s.title}</strong>
                <p>{s.text}</p>
              </div>
            ))}
          </div>
        </Reveal>
      </section>

      <section id="modeles" className="home-section bleed">
        <Reveal className="bleed-inner">
          <span className="eyebrow">Nos modèles</span>
          <h2 className="section-title">Choisissez votre fraîcheur</h2>
          {products.map((p, i) => {
            const dispo = p.units.filter((u) => u.status === "AVAILABLE").length;
            const reservable = p.units.some((u) => !["RETIRED", "MAINTENANCE"].includes(u.status));
            const photo = p.images[0];
            return (
              <div className={`model-row ${i % 2 === 1 ? "rev" : ""}`} key={p.id}>
                <ModelPhoto url={photo?.url} alt={photo?.alt ?? `Climatiseur ${p.name}`} />
                <div className="model-info">
                  <h3>{p.name}</h3>
                  <div className="model-badges">
                    <span className="model-badge">Jusqu&apos;à {p.maxAreaM2} m²</span>
                    <span className="model-badge">{p.powerKw} kW</span>
                    <span className="model-badge">{p.noiseDb} dB</span>
                  </div>
                  <p className="desc">{p.description}</p>
                  <div className="price">
                    {euros(p.dailyPrice)} <small>/ jour</small>
                  </div>
                  <p className="avail">
                    {dispo > 0 ? (
                      <span className="stock-ok">✓ {dispo} disponible{dispo > 1 ? "s" : ""}</span>
                    ) : (
                      <span className="stock-ko">Indisponible actuellement</span>
                    )}
                  </p>
                  {reservable && (
                    <Link href={`/reserver/${p.slug}`} className="btn btn-primary">
                      Réserver
                    </Link>
                  )}
                </div>
              </div>
            );
          })}
        </Reveal>
      </section>

      <section className="home-section section-band bleed">
        <Reveal className="bleed-inner">
          <div className="reassurance">
            {REASSURANCE.map((r) => (
              <div className="reassurance-item" key={r.title}>
                <div className="ico">{r.ico}</div>
                <strong>{r.title}</strong>
                <p>{r.text}</p>
              </div>
            ))}
          </div>
        </Reveal>
      </section>

      <section className="home-section bleed">
        <Reveal className="bleed-inner home-cta">
          <h2 className="section-title">Prêt à retrouver la fraîcheur ?</h2>
          <Link href="#modeles" className="btn btn-primary">
            Voir les climatiseurs
          </Link>
        </Reveal>
      </section>
```

Le `<div id="modeles">` qui enveloppait la section modèles disparaît : l'`id` est porté par le `<section>`. L'attribut `style={{ fontSize: 28 }}` du titre du CTA disparaît aussi, la taille est désormais gérée par `.home-section .section-title`.

- [ ] **Step 3 : vérifier la compilation et les tests**

Run: `npm run build && npm test`
Expected: SUCCÈS des deux.

- [ ] **Step 4 : vérifier visuellement**

Run: `npm run dev` puis ouvrir `http://localhost:3000`
Expected : les bandes « Comment ça marche » et « Réassurance » traversent tout l'écran, le fond animé se devine derrière le verre dépoli. Les modèles s'étalent sur 1240 px. Cliquer « Comment ça marche » dans le hero fait défiler jusqu'à la section des étapes sans que le titre passe sous la barre de navigation. Cliquer « Voir les climatiseurs » descend aux modèles.

- [ ] **Step 5 : commit**

```bash
git add app/globals.css app/page.js
git commit -m "feat(accueil): sections etapes, modeles, reassurance et CTA en pleine largeur"
```

---

### Task 5 : vérification responsive et non-régression

**Files:**
- Modify: `app/globals.css` uniquement si un défaut est constaté

**Interfaces:**
- Consumes: tout ce qui précède.
- Produces: rien.

- [ ] **Step 1 : vérifier la suite complète**

Run: `npm run build && npm test`
Expected: SUCCÈS des deux, sans avertissement.

- [ ] **Step 2 : vérifier l'accueil sur ordinateur**

Run: `npm run dev`, ouvrir `http://localhost:3000` en 1440×900
Expected :
- Aucune barre de défilement horizontale, à aucun moment du défilement.
- Le hero fait exactement une hauteur d'écran, le bas de la flèche est visible sans défiler.
- Le fond bouge doucement au mouvement de la souris.
- Le texte reste franchement lisible sur tout le parcours de l'animation : observer le hero une dizaine de secondes, aucune nappe claire ne doit venir affaiblir le contraste du titre ni du sous-titre. Si c'est le cas, baisser les coefficients `0.55` / `0.30` / `0.12` des trois `mix()` du shader.

- [ ] **Step 3 : vérifier l'accueil sur mobile**

Dans les outils de développement, émuler un iPhone (390×844) avec `pointer: coarse`.
Expected :
- Tout passe en une colonne : étapes, modèles, réassurance, pastilles d'arguments, boutons.
- Le titre du hero tient sur l'écran sans débordement.
- **Aucun saut de mise en page au premier défilement** (c'est le test du `100svh`).
- Le fond continue de s'animer, sans réagir au pointeur.
- **Le défilement reste fluide, sans saccade**, y compris au passage sur les deux bandes `.section-band`. Ces bandes appliquent un `backdrop-filter` sur toute la largeur, par-dessus un canvas qui se redessine à chaque image : c'est le point le plus coûteux de la page. Si ça saccade, réduire le flou de `.section-band` de `blur(16px)` à `blur(8px)`, et si nécessaire remplacer le `backdrop-filter` par un fond opaque `rgba(255, 255, 255, 0.82)` sous 820px.

- [ ] **Step 4 : vérifier le mode « animations réduites »**

Dans les outils de développement, forcer `prefers-reduced-motion: reduce` puis recharger.
Expected : le fond affiche une image fixe qui ne bouge plus du tout, la flèche du hero ne pulse plus, les sections apparaissent sans fondu.

- [ ] **Step 5 : vérifier la non-régression des autres pages**

Ouvrir successivement :
- `http://localhost:3000/reserver/<un-slug-existant>` — largeur 1080px inchangée, le récapitulatif reste collant en défilant.
- `http://localhost:3000/reserver/confirmation/<une-reference-existante>` — mise en page inchangée.
- `http://localhost:3000/admin/connexion` puis `/admin` et `/admin/produits` — largeur, tableau de réservations et formulaires inchangés, aucune barre horizontale.

Expected : aucune différence visible avec avant les modifications.

- [ ] **Step 6 : corriger si nécessaire, puis commit**

Si un défaut est constaté aux étapes 2 à 5, le corriger dans `app/globals.css` et refaire l'étape concernée. Puis :

```bash
git add -A app/ lib/
git commit -m "fix(accueil): ajustements responsive apres verification"
```

Si aucune correction n'est nécessaire, ne rien committer et le signaler.

---

## Récapitulatif des fichiers

| Fichier | Action | Responsabilité |
|---|---|---|
| `lib/backdrop.js` | créé | Logique pure du fond : échelle de rendu, progression de défilement, lissage, coordonnées du pointeur |
| `lib/backdrop.test.js` | créé | Tests `node:test` de ce qui précède |
| `app/Backdrop3D.js` | créé | Composant client : pilotage WebGL, cycle de vie des écouteurs, repli si WebGL absent |
| `app/globals.css` | modifié | `--nav-offset`, `overflow-x: clip`, `.backdrop3d`, `.bleed`/`.bleed-inner`, styles du hero et des sections |
| `app/page.js` | modifié | Montage du fond, nouveau hero centré, sections en pleine largeur |
| `app/HeroMedia.js` | **inchangé, conservé** | Plus importé nulle part |
