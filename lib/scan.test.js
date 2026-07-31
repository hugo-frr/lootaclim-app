import { test } from "node:test";
import assert from "node:assert/strict";
import { nextAction, labelSheets, scanUrl, qrRuns } from "./scan.js";

const machine = (extra = {}) => ({ status: "AVAILABLE", productId: "p1", ...extra });
const resa = (extra = {}) => ({
  id: "b1",
  reference: "LC-2026-0007",
  status: "CONFIRMED",
  unitId: "u1",
  kitId: null,
  depositAmount: 10000,
  depositStatus: "HELD",
  ...extra,
});
const intervention = (extra = {}) => ({ id: "d1", type: "DROPOFF", status: "SCHEDULED", ...extra });

test("machine affectée, livraison prévue, caution posée : on propose de livrer", () => {
  const a = nextAction({ unit: machine(), booking: resa(), delivery: intervention() });
  assert.equal(a.id, "deliver");
  assert.equal(a.blocked, null);
});

test("caution non posée : le bouton est bloqué, et la raison est celle du tableau", () => {
  const a = nextAction({
    unit: machine(),
    booking: resa({ depositStatus: "NONE" }),
    delivery: intervention(),
  });
  assert.equal(a.id, "deliver");
  assert.match(a.blocked, /caution/i, "la raison exacte doit venir de deliveryDoneEffects");
});

test("réservation pas encore confirmée : livraison bloquée", () => {
  const a = nextAction({
    unit: machine(),
    booking: resa({ status: "PENDING" }),
    delivery: intervention(),
  });
  assert.equal(a.id, "deliver");
  assert.match(a.blocked, /[Cc]onfirmez/);
});

test("machine en location, reprise prévue : on propose de marquer récupérée", () => {
  const a = nextAction({
    unit: machine({ status: "RENTED" }),
    booking: resa({ status: "DELIVERED" }),
    delivery: intervention({ type: "PICKUP" }),
  });
  assert.equal(a.id, "pickup");
  assert.equal(a.blocked, null);
});

test("reprise avant livraison : bloquée", () => {
  const a = nextAction({
    unit: machine({ status: "RENTED" }),
    booking: resa({ status: "CONFIRMED" }),
    delivery: intervention({ type: "PICKUP" }),
  });
  assert.equal(a.id, "pickup");
  assert.match(a.blocked, /livraison/i);
});

test("machine libre et une réservation attend une machine : on propose de l'affecter", () => {
  const a = nextAction({
    unit: machine(),
    booking: null,
    delivery: null,
    candidate: resa({ unitId: null }),
  });
  assert.equal(a.id, "assign");
  assert.match(a.label, /LC-2026-0007/, "la référence doit figurer dans le libellé");
  assert.equal(a.blocked, null);
});

test("machine en maintenance : on propose de la remettre en service", () => {
  const a = nextAction({ unit: machine({ status: "MAINTENANCE" }), booking: null, delivery: null });
  assert.equal(a.id, "service");
});

test("machine retirée du parc : aucune action", () => {
  assert.equal(nextAction({ unit: machine({ status: "RETIRED" }), booking: null, delivery: null }), null);
});

test("machine retirée : même une réservation en attente ne propose rien", () => {
  const a = nextAction({
    unit: machine({ status: "RETIRED" }),
    booking: null,
    delivery: null,
    candidate: resa({ unitId: null }),
  });
  assert.equal(a, null);
});

test("machine libre, rien en attente : aucune action", () => {
  assert.equal(nextAction({ unit: machine(), booking: null, delivery: null }), null);
});

test("intervention déjà effectuée : plus rien à proposer dessus", () => {
  const a = nextAction({
    unit: machine(),
    booking: resa(),
    delivery: intervention({ status: "DONE" }),
  });
  assert.equal(a, null);
});

test("la reprise passe avant l'affectation d'une autre réservation", () => {
  // Une machine en location ne doit jamais être proposée à l'affectation,
  // même si une réservation attend : il faut d'abord la récupérer.
  const a = nextAction({
    unit: machine({ status: "RENTED" }),
    booking: resa({ status: "DELIVERED" }),
    delivery: intervention({ type: "PICKUP" }),
    candidate: resa({ id: "b2", reference: "LC-2026-0008", unitId: null }),
  });
  assert.equal(a.id, "pickup");
});

test("scanUrl : adresse absolue, encodée", () => {
  assert.equal(scanUrl("https://www.lootaclim.fr", "SEI-001"), "https://www.lootaclim.fr/admin/scan/SEI-001");
  assert.equal(
    scanUrl("https://www.lootaclim.fr/", "SEI 001"),
    "https://www.lootaclim.fr/admin/scan/SEI%20001",
    "la barre finale est absorbée et le numéro encodé"
  );
});

test("labelSheets : découpe en pages", () => {
  const u = Array.from({ length: 27 }, (_, i) => ({ serialNumber: `S-${i}` }));
  const pages = labelSheets(u, 24);
  assert.equal(pages.length, 2);
  assert.equal(pages[0].length, 24);
  assert.equal(pages[1].length, 3);
});

test("labelSheets : aucune machine ne donne aucune page", () => {
  assert.deepEqual(labelSheets([], 24), []);
});

test("labelSheets : un nombre exact remplit une seule page", () => {
  const u = Array.from({ length: 24 }, (_, i) => ({ serialNumber: `S-${i}` }));
  assert.equal(labelSheets(u, 24).length, 1);
});

test("qrRuns : fusionne les modules voisins d'une même ligne", () => {
  // 3x3 :  ##.
  //        .#.
  //        ###
  const modules = { size: 3, data: Uint8Array.from([1, 1, 0, 0, 1, 0, 1, 1, 1]) };
  assert.deepEqual(qrRuns(modules), [
    { x: 0, y: 0, largeur: 2 },
    { x: 1, y: 1, largeur: 1 },
    { x: 0, y: 2, largeur: 3 },
  ]);
});

test("qrRuns : un segment touchant le bord droit est bien fermé", () => {
  const modules = { size: 2, data: Uint8Array.from([0, 1, 1, 1]) };
  assert.deepEqual(qrRuns(modules), [
    { x: 1, y: 0, largeur: 1 },
    { x: 0, y: 1, largeur: 2 },
  ]);
});

test("qrRuns : matrice vide ou absente ne plante pas", () => {
  assert.deepEqual(qrRuns({ size: 2, data: Uint8Array.from([0, 0, 0, 0]) }), []);
  assert.deepEqual(qrRuns(undefined), []);
});
