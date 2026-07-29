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

      // La gaine dépasse largement sur la droite : sans ce recentrage, le
      // pivot serait à 19 cm du caisson et la machine tournerait de travers.
      // On centre le groupe sur son caisson, pas sur son encombrement total.
      const pivot = new THREE.Group();
      const centreCaisson = new THREE.Box3()
        .setFromObject(parts.shell)
        .getCenter(new THREE.Vector3());
      root.position.sub(centreCaisson);
      pivot.add(root);
      pivot.rotation.x = 0.08;
      scene.add(pivot);

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
      // Les particules suivent la machine : elles sont exprimées dans son repère.
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
        positions[i * 3 + 1] = 9999;
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
        pivot.position.x = etat.x * l;
        pivot.position.y = etat.y * h;
        pivot.scale.setScalar(etat.scale);
        pivot.rotation.y = etat.spin * Math.PI * 2 + ecoule * 0.12;

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
            `translate(${(v.x * 0.5 + 0.5) * l}px, ${(-v.y * 0.5 + 0.5) * h}px) translate(-50%, -50%)`;
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
        const vues = new Set();
        scene.traverse((o) => {
          if (o.geometry && !vues.has(o.geometry)) {
            vues.add(o.geometry);
            o.geometry.dispose();
          }
        });
        for (const m of materials) m.dispose();
        matAir.dispose();
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
