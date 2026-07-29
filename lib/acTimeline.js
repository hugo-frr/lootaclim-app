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
// "boundaries" est la liste croissante des positions de départ des cinq
// sections dans la page.
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
