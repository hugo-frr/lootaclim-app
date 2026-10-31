import { test } from "node:test";
import assert from "node:assert/strict";
import { lienGuidage, liensTournee, departValide } from "./navigation.js";

const p = (i) => ({ lat: 48.8 + i / 1000, lng: 2.3 + i / 1000 });

test("guidage vers un arrêt, Google Maps ou Waze", () => {
  assert.equal(
    lienGuidage("google", { lat: 48.85, lng: 2.35 }),
    "https://www.google.com/maps/dir/?api=1&destination=48.85%2C2.35&travelmode=driving"
  );
  assert.equal(lienGuidage("waze", { lat: 48.85, lng: 2.35 }), "https://waze.com/ul?ll=48.85%2C2.35&navigate=yes");
});

test("une petite tournée tient dans un seul lien, étapes dans l'ordre", () => {
  const liens = liensTournee([p(1), p(2), p(3)]);
  assert.equal(liens.length, 1);
  assert.deepEqual([liens[0].de, liens[0].a], [1, 3]);
  const url = new URL(liens[0].url);
  assert.equal(url.searchParams.get("destination"), "48.803,2.303");
  assert.equal(url.searchParams.get("waypoints"), "48.801,2.301|48.802,2.302");
});

test("au-delà de 10 arrêts, la tournée est découpée, sans en perdre", () => {
  const points = Array.from({ length: 23 }, (_, i) => p(i + 1));
  const liens = liensTournee(points);
  assert.deepEqual(liens.map((l) => [l.de, l.a]), [[1, 10], [11, 20], [21, 23]]);
  for (const l of liens) {
    const w = new URL(l.url).searchParams.get("waypoints");
    assert.equal(w ? w.split("|").length : 0, l.a - l.de);
  }
});

test("aucun arrêt, aucun lien", () => {
  assert.deepEqual(liensTournee([]), []);
});

test("position du téléphone : seulement si elle est plausible", () => {
  assert.deepEqual(departValide("48.85", "2.35"), { lat: 48.85, lng: 2.35 });
  assert.equal(departValide(0, 0), null);
  assert.equal(departValide("", ""), null);
  assert.equal(departValide("abc", "2.35"), null);
  assert.equal(departValide(45.76, 4.83), null); // Lyon
});
