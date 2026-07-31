import { test } from "node:test";
import assert from "node:assert/strict";
import {
  signUserSession,
  readSession,
  SESSION_SECOURS,
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

test("readSession : relit l'identifiant d'une session valide", async () => {
  const jeton = await signUserSession("abc123", 2000, "secret");
  assert.deepEqual(await readSession(jeton, "secret", 1000), { userId: "abc123" });
});

test("readSession : la session de secours est un identifiant comme un autre", async () => {
  const jeton = await signUserSession(SESSION_SECOURS, 2000, "secret");
  assert.deepEqual(await readSession(jeton, "secret", 1000), { userId: "secours" });
});

test("readSession : refuse une session expirée", async () => {
  const jeton = await signUserSession("abc123", 1000, "secret");
  assert.equal(await readSession(jeton, "secret", 1000), null);
  assert.equal(await readSession(jeton, "secret", 5000), null);
});

test("readSession : refuse une signature d'un autre secret", async () => {
  const jeton = await signUserSession("abc123", 2000, "secret");
  assert.equal(await readSession(jeton, "autre-secret", 1000), null);
});

test("readSession : refuse un identifiant modifié", async () => {
  // Changer l'identifiant sans refaire la signature ne doit rien donner :
  // sinon n'importe qui se ferait passer pour n'importe qui.
  const jeton = await signUserSession("abc123", 2000, "secret");
  const trafique = jeton.replace("abc123", "xyz999");
  assert.equal(await readSession(trafique, "secret", 1000), null);
});

test("readSession : les anciens jetons à deux parties sont invalides", async () => {
  const ancien = await signSession(2000, "secret");
  assert.equal(await readSession(ancien, "secret", 1000), null);
});

test("readSession : entrées malformées refusées sans exception", async () => {
  for (const mauvais of ["", "a.b", "a.b.c.d", null, undefined, 42, "..", "a.-1.b"]) {
    assert.equal(await readSession(mauvais, "secret", 1000), null, `refusé : ${mauvais}`);
  }
});
