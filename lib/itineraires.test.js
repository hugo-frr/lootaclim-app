import { test } from "node:test";
import assert from "node:assert/strict";
import { lireMatriceOrs, matriceTemps, traceTournee } from "./itineraires.js";

const points = [
  { lat: 48.855602, lng: 2.35995 },
  { lat: 48.8867, lng: 2.3431 },
];

test("la matrice OpenRouteService passe des secondes aux minutes", () => {
  const m = lireMatriceOrs({ durations: [[0, 600], [540, 0]] }, points);
  assert.deepEqual(m, [[0, 10], [9, 0]]);
});

test("une cellule sans itinéraire est remplacée par l'estimation", () => {
  const m = lireMatriceOrs({ durations: [[0, null], [540, 0]] }, points);
  assert.ok(m[0][1] > 15 && m[0][1] < 18.5);
});

test("sans clé, on estime et on ne trace pas", async () => {
  const cle = process.env.ORS_API_KEY;
  delete process.env.ORS_API_KEY;
  const { minutes, source } = await matriceTemps(points);
  assert.equal(source, "estimation");
  assert.equal(minutes.length, 2);
  assert.equal(await traceTournee(points), null);
  if (cle) process.env.ORS_API_KEY = cle;
});
