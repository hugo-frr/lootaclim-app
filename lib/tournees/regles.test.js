import { test } from "node:test";
import assert from "node:assert/strict";
import { interventionsLiees, reprisesOrphelines, erreurReattribution } from "./regles.js";

const liv = { id: "d1", type: "DROPOFF", bookingId: "b1", status: "SCHEDULED" };
const rep = { id: "p1", type: "PICKUP", bookingId: "b1", status: "SCHEDULED" };
const autre = { id: "d2", type: "DROPOFF", bookingId: "b2", status: "SCHEDULED" };

test("location d'un jour : livraison et reprise se déplacent ensemble", () => {
  assert.deepEqual(interventionsLiees(liv, [liv, rep, autre]).sort(), ["d1", "p1"]);
  assert.deepEqual(interventionsLiees(rep, [liv, rep, autre]).sort(), ["d1", "p1"]);
  assert.deepEqual(interventionsLiees(autre, [liv, rep, autre]), ["d2"]);
});

test("une livraison déjà faite ne suit plus sa reprise", () => {
  assert.deepEqual(interventionsLiees(rep, [{ ...liv, status: "DONE" }, rep]), ["p1"]);
});

test("une reprise dont la livraison du jour reste hors du calcul n'est pas planifiée", () => {
  // La livraison est dans une tournée commencée : la reprise ne doit pas
  // partir chez un autre livreur, qui arriverait avant la machine.
  assert.deepEqual(reprisesOrphelines([rep, autre], [liv, rep, autre]), ["p1"]);
  assert.deepEqual(reprisesOrphelines([liv, rep, autre], [liv, rep, autre]), []);
  assert.deepEqual(reprisesOrphelines([rep], [{ ...liv, status: "DONE" }, rep]), []);
});

test("une tournée commencée ne reçoit ni ne cède d'arrêt", () => {
  assert.equal(erreurReattribution({ status: "PLANNED" }, { status: "PLANNED" }), null);
  assert.equal(erreurReattribution(null, { status: "PLANNED" }), null);
  assert.equal(erreurReattribution(null, null), null);
  assert.match(erreurReattribution({ status: "STARTED" }, { status: "PLANNED" }), /commencé/);
  assert.match(erreurReattribution({ status: "PLANNED" }, { status: "STARTED" }), /commencé/);
});
