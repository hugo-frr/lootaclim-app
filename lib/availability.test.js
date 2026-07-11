import { test } from "node:test";
import assert from "node:assert/strict";
import {
  capacity,
  fullDays,
  rangeError,
  deliverySlotsFor,
  minStartDay,
  pickupSlotsFor,
} from "./availability.js";

test("capacity ignore les machines retirées ou en maintenance", () => {
  const units = [
    { status: "AVAILABLE" },
    { status: "RENTED" },
    { status: "IN_TRANSIT" },
    { status: "MAINTENANCE" },
    { status: "RETIRED" },
  ];
  assert.equal(capacity(units), 3);
});

test("fullDays : une réservation occupe ses dates + 1 jour de battement", () => {
  const bookings = [
    { startDay: "2026-07-10", endDay: "2026-07-12", status: "CONFIRMED" },
  ];
  const full = fullDays(bookings, 1, "2026-07-01", "2026-07-31");
  assert.deepEqual(
    [...full].sort(),
    ["2026-07-10", "2026-07-11", "2026-07-12", "2026-07-13"]
  );
});

test("fullDays ignore les réservations annulées ou terminées", () => {
  const bookings = [
    { startDay: "2026-07-10", endDay: "2026-07-12", status: "CANCELLED" },
    { startDay: "2026-07-10", endDay: "2026-07-12", status: "RETURNED" },
  ];
  assert.equal(fullDays(bookings, 1, "2026-07-01", "2026-07-31").size, 0);
});

test("fullDays : un jour n'est complet que si toutes les machines sont prises", () => {
  const bookings = [
    { startDay: "2026-07-10", endDay: "2026-07-12", status: "CONFIRMED" },
    { startDay: "2026-07-12", endDay: "2026-07-14", status: "PENDING" },
  ];
  const full = fullDays(bookings, 2, "2026-07-01", "2026-07-31");
  // Seuls les jours couverts par LES DEUX réservations (battement compris)
  assert.deepEqual([...full].sort(), ["2026-07-12", "2026-07-13"]);
});

test("rangeError accepte une plage libre, refuse un jour complet sur la période", () => {
  const full = new Set(["2026-07-20"]);
  assert.equal(
    rangeError("2026-07-15", "2026-07-17", full, "2026-07-11", "2026-10-11"),
    null
  );
  assert.match(
    rangeError("2026-07-18", "2026-07-22", full, "2026-07-11", "2026-10-11"),
    /plus disponibles/
  );
  // Le battement compte : finir le 19 occupe aussi le 20, déjà complet
  assert.match(
    rangeError("2026-07-18", "2026-07-19", full, "2026-07-11", "2026-10-11"),
    /plus disponibles/
  );
});

test("rangeError respecte les bornes min et max", () => {
  const full = new Set();
  assert.match(
    rangeError("2026-07-10", "2026-07-12", full, "2026-07-11", "2026-10-11"),
    /plus réservable/
  );
  assert.match(
    rangeError("2026-10-10", "2026-10-12", full, "2026-07-11", "2026-10-11"),
    /3 mois/
  );
});

test("deliverySlotsFor : le jour même, un créneau commencé n'est plus proposé", () => {
  const now = { day: "2026-07-11", hour: 14 }; // il est entre 14h et 15h
  const ids = deliverySlotsFor("2026-07-11", now).map((s) => s.id);
  assert.deepEqual(ids, ["16h-18h", "18h-20h", "20h-22h"]);
  // Un autre jour : les 6 créneaux
  assert.equal(deliverySlotsFor("2026-07-12", now).length, 6);
});

test("deliverySlotsFor : avant 9h tout est ouvert, après 20h plus rien", () => {
  assert.equal(deliverySlotsFor("2026-07-11", { day: "2026-07-11", hour: 8 }).length, 6);
  assert.equal(deliverySlotsFor("2026-07-11", { day: "2026-07-11", hour: 20 }).length, 0);
});

test("minStartDay : aujourd'hui s'il reste un créneau, sinon demain", () => {
  assert.equal(minStartDay({ day: "2026-07-11", hour: 15 }), "2026-07-11");
  assert.equal(minStartDay({ day: "2026-07-11", hour: 21 }), "2026-07-12");
});

test("pickupSlotsFor : location d'un jour → reprise après la livraison", () => {
  const ids = pickupSlotsFor("2026-07-11", "2026-07-11", "14h-16h").map((s) => s.id);
  assert.deepEqual(ids, ["16h-18h", "18h-20h", "20h-22h"]);
  assert.equal(pickupSlotsFor("2026-07-11", "2026-07-13", "14h-16h").length, 6);
});
