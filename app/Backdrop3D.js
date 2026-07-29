"use client";

import { useEffect, useRef } from "react";
import {
  renderScale,
  scrollProgress,
  lerp,
  pointerToUv,
  createProgram,
} from "../lib/backdrop";
import {
  FROST_PRECISION,
  FROST_VERTEX_RAW,
  FROST_FRAGMENT,
} from "../lib/frostShader";

// Fond animé de la page d'accueil : trois nappes de givre superposées qui
// dérivent lentement à des profondeurs différentes. Le décalage entre les
// nappes selon le défilement et la souris est ce qui crée le relief.
// WebGL brut, aucune dépendance. Si le contexte n'est pas disponible, le
// composant ne rend rien : le dégradé CSS du body reste visible.

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
    // isContextLost : sur un canvas dont le contexte a été perdu, getContext
    // renvoie ce même contexte mort au lieu de null. Sans ce test, toutes les
    // fabriques renverraient null plus bas.
    if (!gl || gl.isContextLost()) return;

    const program = createProgram(
      gl,
      FROST_VERTEX_RAW,
      FROST_PRECISION + FROST_FRAGMENT
    );
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

    // On libère le programme et le tampon, mais surtout PAS le contexte lui-même
    // via WEBGL_lose_context : le contexte reste attaché au canvas, et un canvas
    // dont le contexte a été perdu ne peut plus jamais en obtenir un nouveau.
    // En mode strict de React (actif en développement), le composant est démonté
    // puis remonté aussitôt : le remontage récupérerait un contexte mort et
    // planterait. Le navigateur libère le contexte tout seul avec le canvas.
    function dispose() {
      if (frame !== null) cancelAnimationFrame(frame);
      gl.deleteProgram(program);
      gl.deleteBuffer(buffer);
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
