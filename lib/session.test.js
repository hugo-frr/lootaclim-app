import { test } from "node:test";
import assert from "node:assert/strict";
import {
  signSession,
  verifySession,
  SESSION_COOKIE,
  SESSION_DURATION_MS,
} from "./session.js";

const SECRET = "secret-de-test";

test("aller-retour : un jeton signé est accepté avant expiration", async () => {
  const token = await signSession(1_000_000, SECRET);
  assert.equal(await verifySession(token, SECRET, 999_999), true);
});

test("un jeton expiré est refusé", async () => {
  const token = await signSession(1_000_000, SECRET);
  assert.equal(await verifySession(token, SECRET, 1_000_000), false);
});

test("un jeton falsifié est refusé", async () => {
  const token = await signSession(1_000_000, SECRET);
  const [payload, sig] = token.split(".");
  assert.equal(await verifySession(`2000000.${sig}`, SECRET, 0), false);
  assert.equal(await verifySession(`${payload}.${"0".repeat(sig.length)}`, SECRET, 0), false);
});

test("mauvais secret et jetons malformés refusés", async () => {
  const token = await signSession(1_000_000, SECRET);
  assert.equal(await verifySession(token, "autre-secret", 0), false);
  for (const bad of ["", "abc", "123", ".", "123.", ".abc", null, undefined]) {
    assert.equal(await verifySession(bad, SECRET, 0), false);
  }
});

test("les constantes de cookie sont exportées", () => {
  assert.equal(SESSION_COOKIE, "lc_admin");
  assert.equal(SESSION_DURATION_MS, 7 * 24 * 60 * 60 * 1000);
});
