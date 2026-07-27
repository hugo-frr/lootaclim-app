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

// Compilation d'un shader. Renvoie null plutôt que de lever : sur un contexte
// perdu, createShader renvoie null et passer ce null à shaderSource lève un
// TypeError qui casse toute la page.
function compile(gl, type, source) {
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    gl.deleteShader(shader);
    return null;
  }
  return shader;
}

// Assemble un programme WebGL. Renvoie null à la moindre défaillance — le
// composant appelant se replie alors sur le dégradé CSS.
export function createProgram(gl, vertexSource, fragmentSource) {
  const vs = compile(gl, gl.VERTEX_SHADER, vertexSource);
  const fs = compile(gl, gl.FRAGMENT_SHADER, fragmentSource);
  if (!vs || !fs) {
    if (vs) gl.deleteShader(vs);
    if (fs) gl.deleteShader(fs);
    return null;
  }
  const program = gl.createProgram();
  if (!program) {
    gl.deleteShader(vs);
    gl.deleteShader(fs);
    return null;
  }
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
