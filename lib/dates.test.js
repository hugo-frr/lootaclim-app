import { test } from "node:test";
import assert from "node:assert/strict";
import {
  addDays,
  addMonths,
  eachDay,
  daysBetweenInclusive,
  nowInParis,
  toDay,
} from "./dates.js";

test("addDays passe les fins de mois et d'année", () => {
  assert.equal(addDays("2026-07-30", 2), "2026-08-01");
  assert.equal(addDays("2026-12-31", 1), "2027-01-01");
  assert.equal(addDays("2026-07-15", 0), "2026-07-15");
});

test("addMonths ajoute des mois civils", () => {
  assert.equal(addMonths("2026-07-11", 3), "2026-10-11");
  assert.equal(addMonths("2026-11-15", 3), "2027-02-15");
});

test("eachDay liste les jours inclusivement", () => {
  assert.deepEqual(eachDay("2026-07-30", "2026-08-01"), [
    "2026-07-30",
    "2026-07-31",
    "2026-08-01",
  ]);
  assert.deepEqual(eachDay("2026-07-30", "2026-07-29"), []);
});

test("daysBetweenInclusive : du 1er au 3 = 3 jours", () => {
  assert.equal(daysBetweenInclusive("2026-07-01", "2026-07-03"), 3);
  assert.equal(daysBetweenInclusive("2026-07-01", "2026-07-01"), 1);
});

test("nowInParis convertit l'heure UTC en heure de Paris", () => {
  // 22h30 UTC le 14 juillet = 00h30 le 15 juillet à Paris (été, UTC+2)
  const now = nowInParis(new Date("2026-07-14T22:30:00Z"));
  assert.deepEqual(now, { day: "2026-07-15", hour: 0 });
});

test("toDay extrait le jour civil d'une date de la base", () => {
  assert.equal(toDay(new Date("2026-07-15T00:00:00Z")), "2026-07-15");
});
