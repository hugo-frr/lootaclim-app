import { test } from "node:test";
import assert from "node:assert/strict";
import { renderScale, scrollProgress, lerp, pointerToUv } from "./backdrop.js";

test("renderScale : plafonné à 1.5 sur pointeur fin", () => {
  assert.equal(renderScale(3, false), 1.5);
  assert.equal(renderScale(2, false), 1.5);
});

test("renderScale : plafonné à 1.25 sur pointeur grossier (mobile)", () => {
  assert.equal(renderScale(3, true), 1.25);
});

test("renderScale : un écran non-retina garde son ratio", () => {
  assert.equal(renderScale(1, false), 1);
  assert.equal(renderScale(1, true), 1);
});

test("renderScale : valeur absente ou aberrante repliée sur 1", () => {
  assert.equal(renderScale(undefined, false), 1);
  assert.equal(renderScale(0, false), 1);
  assert.equal(renderScale(NaN, false), 1);
  assert.equal(renderScale(-2, false), 1);
});

test("scrollProgress : va de 0 en haut à 1 en bas", () => {
  assert.equal(scrollProgress(0, 3000, 1000), 0);
  assert.equal(scrollProgress(1000, 3000, 1000), 0.5);
  assert.equal(scrollProgress(2000, 3000, 1000), 1);
});

test("scrollProgress : borné même en cas de rebond élastique", () => {
  assert.equal(scrollProgress(-120, 3000, 1000), 0);
  assert.equal(scrollProgress(9999, 3000, 1000), 1);
});

test("scrollProgress : page plus courte que l'écran renvoie 0", () => {
  assert.equal(scrollProgress(0, 600, 1000), 0);
  assert.equal(scrollProgress(50, 1000, 1000), 0);
});

test("lerp : interpole entre les deux bornes", () => {
  assert.equal(lerp(0, 10, 0), 0);
  assert.equal(lerp(0, 10, 1), 10);
  assert.equal(lerp(0, 10, 0.25), 2.5);
  assert.equal(lerp(4, 2, 0.5), 3);
});

test("pointerToUv : centre de l'écran au milieu, axe Y inversé pour WebGL", () => {
  assert.deepEqual(pointerToUv(500, 400, 1000, 800), { x: 0.5, y: 0.5 });
  assert.deepEqual(pointerToUv(0, 0, 1000, 800), { x: 0, y: 1 });
  assert.deepEqual(pointerToUv(1000, 800, 1000, 800), { x: 1, y: 0 });
});

test("pointerToUv : position hors écran ramenée dans les bornes", () => {
  assert.deepEqual(pointerToUv(-300, -300, 1000, 800), { x: 0, y: 1 });
  assert.deepEqual(pointerToUv(4000, 4000, 1000, 800), { x: 1, y: 0 });
});

test("pointerToUv : dimensions nulles repliées sur le centre", () => {
  assert.deepEqual(pointerToUv(10, 10, 0, 0), { x: 0.5, y: 0.5 });
});
