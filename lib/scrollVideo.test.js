import { test } from "node:test";
import assert from "node:assert/strict";
import { scrubProgress, videoTimeAt, shouldSeek } from "./scrollVideo.js";

test("scrubProgress : va de 0 en haut à 1 en bas", () => {
  assert.equal(scrubProgress(0, 3000, 1000), 0);
  assert.equal(scrubProgress(1000, 3000, 1000), 0.5);
  assert.equal(scrubProgress(2000, 3000, 1000), 1);
});

test("scrubProgress : borné en cas de rebond élastique", () => {
  assert.equal(scrubProgress(-400, 3000, 1000), 0);
  assert.equal(scrubProgress(99999, 3000, 1000), 1);
});

test("scrubProgress : page plus courte que l'écran renvoie 0", () => {
  assert.equal(scrubProgress(0, 800, 1000), 0);
  assert.equal(scrubProgress(50, 1000, 1000), 0);
});

test("videoTimeAt : la progression se traduit en secondes", () => {
  assert.equal(videoTimeAt(0, 20), 0);
  assert.equal(videoTimeAt(0.5, 20), 10);
  assert.equal(videoTimeAt(1, 20), 20);
});

test("videoTimeAt : jamais hors de la durée, même sur progression aberrante", () => {
  assert.equal(videoTimeAt(-2, 20), 0);
  assert.equal(videoTimeAt(4, 20), 20);
});

test("videoTimeAt : durée inconnue ou nulle renvoie 0", () => {
  // Avant "loadedmetadata", video.duration vaut NaN.
  assert.equal(videoTimeAt(0.5, NaN), 0);
  assert.equal(videoTimeAt(0.5, 0), 0);
  assert.equal(videoTimeAt(0.5, Infinity), 0);
});

test("shouldSeek : ignore les écarts inférieurs à une image", () => {
  // Sans ce filtre on réassigne currentTime 60 fois par seconde pour des
  // déplacements invisibles, et le décodeur se met à hoqueter.
  assert.equal(shouldSeek(5, 5.001, 1 / 60), false);
  assert.equal(shouldSeek(5, 5.5, 1 / 60), true);
  assert.equal(shouldSeek(5, 4.5, 1 / 60), true);
});

test("shouldSeek : écart exactement au seuil, on ne bouge pas", () => {
  assert.equal(shouldSeek(5, 5 + 1 / 60, 1 / 60), false);
});

test("shouldSeek : valeurs non numériques ne déclenchent jamais de saut", () => {
  assert.equal(shouldSeek(NaN, 5, 1 / 60), false);
  assert.equal(shouldSeek(5, NaN, 1 / 60), false);
});
