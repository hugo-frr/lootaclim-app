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
