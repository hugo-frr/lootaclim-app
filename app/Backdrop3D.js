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
