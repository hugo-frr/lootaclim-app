import { test } from "node:test";
import assert from "node:assert/strict";
import {
  confirmError,
  cancelError,
  deliveryDoneEffects,
  deliveryFailError,
} from "./transitions.js";

test("confirmError : seule une demande en attente se confirme", () => {
  assert.equal(confirmError({ status: "PENDING" }), null);
  for (const status of ["CONFIRMED", "DELIVERED", "RETURNED", "CANCELLED"]) {
    assert.match(confirmError({ status }), /En attente/);
  }
});

test("cancelError : annulable avant livraison uniquement", () => {
  assert.equal(cancelError({ status: "PENDING" }), null);
  assert.equal(cancelError({ status: "CONFIRMED" }), null);
  for (const status of ["DELIVERED", "RETURNED", "CANCELLED"]) {
    assert.match(cancelError({ status }), /ne peut plus/);
  }
});

test("deliveryDoneEffects : livraison effectuée → livrée + machine en location", () => {
  const r = deliveryDoneEffects(
    { type: "DROPOFF", status: "SCHEDULED" },
    { status: "CONFIRMED", unitId: "u1" }
  );
  assert.deepEqual(r, { booking: "DELIVERED", unit: "RENTED" });
});

test("deliveryDoneEffects : la livraison exige confirmation et machine affectée", () => {
  assert.match(
    deliveryDoneEffects({ type: "DROPOFF", status: "SCHEDULED" }, { status: "PENDING", unitId: "u1" }).error,
    /Confirmez/
  );
  assert.match(
    deliveryDoneEffects({ type: "DROPOFF", status: "SCHEDULED" }, { status: "CONFIRMED", unitId: null }).error,
    /Affectez/
  );
});

test("deliveryDoneEffects : reprise effectuée → terminée + machine disponible", () => {
  const r = deliveryDoneEffects(
    { type: "PICKUP", status: "SCHEDULED" },
    { status: "DELIVERED", unitId: "u1" }
  );
  assert.deepEqual(r, { booking: "RETURNED", unit: "AVAILABLE" });
});

test("deliveryDoneEffects : la reprise exige une réservation livrée", () => {
  assert.match(
    deliveryDoneEffects({ type: "PICKUP", status: "SCHEDULED" }, { status: "CONFIRMED", unitId: "u1" }).error,
    /livraison/
  );
});

test("intervention déjà traitée refusée (effectuée comme échec)", () => {
  assert.match(
    deliveryDoneEffects({ type: "DROPOFF", status: "DONE" }, { status: "CONFIRMED", unitId: "u1" }).error,
    /plus planifiée/
  );
  assert.equal(deliveryFailError({ status: "SCHEDULED" }), null);
  assert.match(deliveryFailError({ status: "DONE" }), /plus planifiée/);
});
