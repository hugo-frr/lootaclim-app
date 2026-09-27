import { test } from "node:test";
import assert from "node:assert/strict";
import {
  fenetreDuCreneau,
  tempsSurPlace,
  interventionPlanifiable,
  versArrets,
  heureTexte,
} from "./arrets.js";
import { TIME_SLOTS } from "../constants.js";

test("un créneau devient une fenêtre en minutes", () => {
  assert.deepEqual(fenetreDuCreneau("9h-11h"), [540, 660]);
  assert.deepEqual(fenetreDuCreneau("20h-22h"), [1200, 1320]);
});

test("tous les créneaux proposés aux clients sont lisibles", () => {
  for (const s of TIME_SLOTS) {
    const [a, b] = fenetreDuCreneau(s.id);
    assert.equal(a, s.startHour * 60);
    assert.equal(b - a, 120);
  }
});

test("un créneau illisible laisse toute la journée plutôt que de bloquer", () => {
  assert.deepEqual(fenetreDuCreneau("n'importe quoi"), [8 * 60 + 30, 22 * 60 + 30]);
});

test("temps sur place : plus long sans ascenseur", () => {
  assert.equal(tempsSurPlace("rdc"), 15);
  assert.equal(tempsSurPlace("asc"), 15);
  assert.equal(tempsSurPlace("esc"), 25);
});

test("seules les interventions actionnables entrent dans une tournée", () => {
  const liv = { type: "DROPOFF", status: "SCHEDULED" };
  const rep = { type: "PICKUP", status: "SCHEDULED" };
  assert.equal(interventionPlanifiable(liv, "CONFIRMED"), true);
  assert.equal(interventionPlanifiable(liv, "PENDING"), false);
  assert.equal(interventionPlanifiable(liv, "AWAITING_PAYMENT"), false);
  assert.equal(interventionPlanifiable(rep, "DELIVERED"), true);
  assert.equal(interventionPlanifiable(rep, "CONFIRMED"), true); // location d'un jour
  assert.equal(interventionPlanifiable(rep, "CANCELLED"), false);
  assert.equal(interventionPlanifiable({ ...liv, status: "DONE" }, "CONFIRMED"), false);
});

test("versArrets : fenêtre, temps sur place, et reprise après la livraison du même jour", () => {
  const arrets = versArrets([
    { id: "d1", type: "DROPOFF", bookingId: "b1", timeSlot: "9h-11h", floor: "esc", lieu: 1 },
    { id: "p1", type: "PICKUP", bookingId: "b1", timeSlot: "18h-20h", floor: "esc", lieu: 1 },
    { id: "p2", type: "PICKUP", bookingId: "b2", timeSlot: "14h-16h", floor: "rdc", lieu: 2 },
  ]);
  assert.deepEqual(arrets[0], { id: "d1", type: "DROPOFF", lieu: 1, fenetre: [540, 660], service: 25, apres: null });
  assert.equal(arrets[1].apres, "d1");
  assert.equal(arrets[2].apres, null);
});

test("heureTexte", () => {
  assert.equal(heureTexte(750), "12h30");
  assert.equal(heureTexte(540), "9h00");
  assert.equal(heureTexte(1325.6), "22h06");
});
