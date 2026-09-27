import { test } from "node:test";
import assert from "node:assert/strict";
import { distanceKm, tempsEstimeMin, matriceEstimee } from "./distances.js";

const rivoli = { lat: 48.855602, lng: 2.35995 };
const montmartre = { lat: 48.8867, lng: 2.3431 }; // Sacré-Cœur

test("distance à vol d'oiseau entre deux points de Paris", () => {
  const d = distanceKm(rivoli, montmartre);
  assert.ok(d > 3.4 && d < 3.8, `obtenu ${d}`);
  assert.equal(distanceKm(rivoli, rivoli), 0);
});

test("temps estimé : détours et vitesse moyenne en ville", () => {
  // 3,6 km × 1,4 / 18 km/h ≈ 16,8 min
  const t = tempsEstimeMin(rivoli, montmartre);
  assert.ok(t > 15 && t < 18.5, `obtenu ${t}`);
});

test("la matrice estimée est carrée, nulle sur la diagonale et symétrique", () => {
  const m = matriceEstimee([rivoli, montmartre, { lat: 48.84, lng: 2.3 }]);
  assert.equal(m.length, 3);
  for (let i = 0; i < 3; i++) {
    assert.equal(m[i].length, 3);
    assert.equal(m[i][i], 0);
    for (let j = 0; j < 3; j++) assert.equal(m[i][j], m[j][i]);
  }
});
