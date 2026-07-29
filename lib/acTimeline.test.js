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
