import { test } from "node:test";
import assert from "node:assert/strict";
import {
  confirmError,
  cancelError,
  deliveryDoneEffects,
  deliveryFailError,
  unitAssignmentError,
  unitStatusChangeError,
  depositDue,
  depositReleaseError,
  depositCaptureError,
  kitAssignmentError,
  kitStatusChangeError,
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
    { status: "CONFIRMED", unitId: "u1", depositAmount: 15000, depositStatus: "HELD" }
  );
  assert.deepEqual(r, { booking: "DELIVERED", unit: "RENTED" });
});

test("deliveryDoneEffects : livraison avec kit affecté → le kit passe aussi en location", () => {
  const r = deliveryDoneEffects(
    { type: "DROPOFF", status: "SCHEDULED" },
    { status: "CONFIRMED", unitId: "u1", kitId: "k1", depositAmount: 0, depositStatus: "NONE" }
  );
  assert.deepEqual(r, { booking: "DELIVERED", unit: "RENTED", kit: "RENTED" });
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

test("deliveryDoneEffects : la livraison exige la caution posée si elle est due", () => {
  assert.match(
    deliveryDoneEffects(
      { type: "DROPOFF", status: "SCHEDULED" },
      { status: "CONFIRMED", unitId: "u1", depositAmount: 15000, depositStatus: "FAILED" }
    ).error,
    /caution/
  );
  // Pas de caution requise pour ce modèle (montant à 0) : la livraison passe
  assert.deepEqual(
    deliveryDoneEffects(
      { type: "DROPOFF", status: "SCHEDULED" },
      { status: "CONFIRMED", unitId: "u1", depositAmount: 0, depositStatus: "NONE" }
    ),
    { booking: "DELIVERED", unit: "RENTED" }
  );
});

test("deliveryDoneEffects : reprise effectuée → terminée + machine disponible", () => {
  const r = deliveryDoneEffects(
    { type: "PICKUP", status: "SCHEDULED" },
    { status: "DELIVERED", unitId: "u1" }
  );
  assert.deepEqual(r, { booking: "RETURNED", unit: "AVAILABLE" });
});

test("deliveryDoneEffects : reprise avec kit affecté → le kit redevient disponible", () => {
  const r = deliveryDoneEffects(
    { type: "PICKUP", status: "SCHEDULED" },
    { status: "DELIVERED", unitId: "u1", kitId: "k1" }
  );
  assert.deepEqual(r, { booking: "RETURNED", unit: "AVAILABLE", kit: "AVAILABLE" });
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

test("unitAssignmentError : cas valide", () => {
  const booking = { status: "PENDING", productId: "p1", startDay: "2026-08-01", endDay: "2026-08-05" };
  const unit = { status: "AVAILABLE", productId: "p1" };
  assert.equal(unitAssignmentError(booking, unit, []), null);
});

test("unitAssignmentError : mauvais modèle, machine indisponible, réservation trop avancée", () => {
  const booking = { status: "PENDING", productId: "p1", startDay: "2026-08-01", endDay: "2026-08-05" };
  assert.match(unitAssignmentError(booking, { status: "AVAILABLE", productId: "p2" }, []), /bon modèle/);
  assert.match(unitAssignmentError(booking, { status: "MAINTENANCE", productId: "p1" }, []), /indisponible/);
  assert.match(
    unitAssignmentError({ ...booking, status: "DELIVERED" }, { status: "AVAILABLE", productId: "p1" }, []),
    /ne peut plus/
  );
});

test("unitAssignmentError : chevauchement avec battement refusé, dates disjointes acceptées", () => {
  const booking = { status: "CONFIRMED", productId: "p1", startDay: "2026-08-10", endDay: "2026-08-12" };
  const unit = { status: "AVAILABLE", productId: "p1" };
  // L'autre location finit le 8 → occupe jusqu'au 9 : pas de croisement avec [10, 13]
  assert.equal(
    unitAssignmentError(booking, unit, [{ startDay: "2026-08-05", endDay: "2026-08-08", status: "CONFIRMED" }]),
    null
  );
  // Finit le 9 → occupe jusqu'au 10 : croise le début de la nouvelle
  assert.match(
    unitAssignmentError(booking, unit, [{ startDay: "2026-08-05", endDay: "2026-08-09", status: "CONFIRMED" }]),
    /chevauchent/
  );
  // Une réservation annulée ne bloque pas
  assert.equal(
    unitAssignmentError(booking, unit, [{ startDay: "2026-08-05", endDay: "2026-08-09", status: "CANCELLED" }]),
    null
  );
});

test("unitStatusChangeError : trois statuts manuels, le reste piloté par les livraisons", () => {
  assert.equal(unitStatusChangeError({ status: "AVAILABLE" }, "MAINTENANCE"), null);
  assert.equal(unitStatusChangeError({ status: "RETIRED" }, "AVAILABLE"), null);
  assert.match(unitStatusChangeError({ status: "RENTED" }, "AVAILABLE"), /location/);
  assert.match(unitStatusChangeError({ status: "AVAILABLE" }, "RENTED"), /livraisons/);
});

test("depositDue : due aujourd'hui ou demain, pas au-delà", () => {
  assert.equal(depositDue("2026-07-15", "2026-07-15"), true);
  assert.equal(depositDue("2026-07-16", "2026-07-15"), true);
  assert.equal(depositDue("2026-07-17", "2026-07-15"), false);
  assert.equal(depositDue("2026-07-14", "2026-07-15"), false);
});

test("depositReleaseError : uniquement sur une réservation terminée avec caution posée", () => {
  assert.equal(depositReleaseError({ status: "RETURNED", depositStatus: "HELD" }), null);
  assert.match(
    depositReleaseError({ status: "DELIVERED", depositStatus: "HELD" }).toString(),
    /terminée/
  );
  assert.match(
    depositReleaseError({ status: "RETURNED", depositStatus: "RELEASED" }).toString(),
    /Aucune caution/
  );
});

test("depositCaptureError : montant borné entre 0 exclu et la caution posée", () => {
  const booking = { status: "RETURNED", depositStatus: "HELD", depositAmount: 15000 };
  assert.equal(depositCaptureError(booking, 5000), null);
  assert.equal(depositCaptureError(booking, 15000), null);
  assert.match(depositCaptureError(booking, 0), /positif/);
  assert.match(depositCaptureError(booking, 15001), /dépasse/);
  assert.match(depositCaptureError({ ...booking, depositStatus: "RELEASED" }, 5000), /Aucune caution/);
});

test("kitAssignmentError : cas valide", () => {
  const booking = { status: "PENDING", startDay: "2026-08-01", endDay: "2026-08-05" };
  const kit = { status: "AVAILABLE" };
  assert.equal(kitAssignmentError(booking, kit, []), null);
});

test("kitAssignmentError : kit indisponible, réservation trop avancée", () => {
  const booking = { status: "PENDING", startDay: "2026-08-01", endDay: "2026-08-05" };
  assert.match(kitAssignmentError(booking, { status: "MAINTENANCE" }, []), /indisponible/);
  assert.match(
    kitAssignmentError({ ...booking, status: "DELIVERED" }, { status: "AVAILABLE" }, []),
    /ne peut plus/
  );
});

test("kitAssignmentError : chevauchement avec battement refusé, dates disjointes acceptées", () => {
  const booking = { status: "CONFIRMED", startDay: "2026-08-10", endDay: "2026-08-12" };
  const kit = { status: "AVAILABLE" };
  assert.equal(
    kitAssignmentError(booking, kit, [{ startDay: "2026-08-05", endDay: "2026-08-08", status: "CONFIRMED" }]),
    null
  );
  assert.match(
    kitAssignmentError(booking, kit, [{ startDay: "2026-08-05", endDay: "2026-08-09", status: "CONFIRMED" }]),
    /chevauchent/
  );
  assert.equal(
    kitAssignmentError(booking, kit, [{ startDay: "2026-08-05", endDay: "2026-08-09", status: "CANCELLED" }]),
    null
  );
});

test("kitStatusChangeError : trois statuts manuels, le reste piloté par les livraisons", () => {
  assert.equal(kitStatusChangeError({ status: "AVAILABLE" }, "MAINTENANCE"), null);
  assert.equal(kitStatusChangeError({ status: "RETIRED" }, "AVAILABLE"), null);
  assert.match(kitStatusChangeError({ status: "RENTED" }, "AVAILABLE"), /location/);
  assert.match(kitStatusChangeError({ status: "AVAILABLE" }, "RENTED"), /livraisons/);
});
