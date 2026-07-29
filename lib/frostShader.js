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
