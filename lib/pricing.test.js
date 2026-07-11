import { test } from "node:test";
import assert from "node:assert/strict";
import { quote, discountRate } from "./pricing.js";

test("discountRate : seuils à 7 et 30 jours", () => {
  assert.equal(discountRate(1), 0);
  assert.equal(discountRate(6), 0);
  assert.equal(discountRate(7), 0.15);
  assert.equal(discountRate(29), 0.15);
  assert.equal(discountRate(30), 0.3);
});

test("quote : 1 jour de RIVOLI (18 €/j) = 18 € + 29 € de livraison", () => {
  const q = quote(1800, "2026-07-15", "2026-07-15");
  assert.deepEqual(q, {
    days: 1,
    subtotal: 1800,
    discountRate: 0,
    discount: 0,
    deliveryFee: 2900,
    floorFee: 0,
    total: 4700,
  });
});

test("quote : 7 jours déclenchent -15 %", () => {
  const q = quote(1800, "2026-07-01", "2026-07-07");
  assert.equal(q.days, 7);
  assert.equal(q.subtotal, 12600);
  assert.equal(q.discount, 1890);
  assert.equal(q.total, 12600 - 1890 + 2900);
});

test("quote : 30 jours déclenchent -30 %", () => {
  const q = quote(1200, "2026-07-01", "2026-07-30");
  assert.equal(q.days, 30);
  assert.equal(q.subtotal, 36000);
  assert.equal(q.discount, 10800);
  assert.equal(q.total, 36000 - 10800 + 2900);
});

test("quote arrondit la remise au centime", () => {
  const q = quote(1250, "2026-07-01", "2026-07-07"); // 8750 × 15 % = 1312,5
  assert.equal(q.discount, 1313);
});
