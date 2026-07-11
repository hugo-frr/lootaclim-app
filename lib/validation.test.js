import { test } from "node:test";
import assert from "node:assert/strict";
import { validateBookingForm } from "./validation.js";

const NOW = { day: "2026-07-11", hour: 10 };
const VALID = {
  startDay: "2026-07-15",
  endDay: "2026-07-18",
  deliverySlot: "9h-11h",
  pickupSlot: "14h-16h",
  firstName: "Camille",
  lastName: "Dupont",
  email: "camille@example.com",
  phone: "06 12 34 56 78",
  line1: "12 rue de la Fraîcheur",
  zip: "75011",
  city: "Paris",
  floor: "asc",
  accessCode: "",
};

test("un formulaire complet passe et renvoie les champs nettoyés", () => {
  const r = validateBookingForm({ ...VALID, firstName: "  Camille  " }, NOW);
  assert.equal(r.error, undefined);
  assert.equal(r.data.firstName, "Camille");
});

test("champ obligatoire manquant", () => {
  assert.match(validateBookingForm({ ...VALID, email: "  " }, NOW).error, /email/);
});

test("email invalide", () => {
  assert.match(validateBookingForm({ ...VALID, email: "pas-un-email" }, NOW).error, /email/);
});

test("téléphone invalide", () => {
  assert.match(validateBookingForm({ ...VALID, phone: "12" }, NOW).error, /téléphone/);
});

test("code postal hors zone refusé", () => {
  assert.match(validateBookingForm({ ...VALID, zip: "77100" }, NOW).error, /petite couronne/);
});

test("étage inconnu refusé (y compris les clés héritées d'Object)", () => {
  assert.match(validateBookingForm({ ...VALID, floor: "cave" }, NOW).error, /étage/);
  assert.match(validateBookingForm({ ...VALID, floor: "toString" }, NOW).error, /étage/);
});

test("créneau inconnu refusé", () => {
  assert.match(
    validateBookingForm({ ...VALID, deliverySlot: "9h-12h" }, NOW).error,
    /créneaux/
  );
});

test("le jour même, créneau déjà commencé refusé", () => {
  const r = validateBookingForm(
    { ...VALID, startDay: "2026-07-11", deliverySlot: "9h-11h" },
    { day: "2026-07-11", hour: 9 }
  );
  assert.match(r.error, /déjà commencé/);
});

test("location d'un jour : reprise avant la livraison refusée", () => {
  const r = validateBookingForm(
    {
      ...VALID,
      startDay: "2026-07-15",
      endDay: "2026-07-15",
      deliverySlot: "14h-16h",
      pickupSlot: "9h-11h",
    },
    NOW
  );
  assert.match(r.error, /après la livraison/);
});
