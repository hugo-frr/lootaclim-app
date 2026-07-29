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
