import { test } from "node:test";
import assert from "node:assert/strict";
import { hashPassword, verifyPassword, passwordError, PBKDF2_ITERATIONS } from "./password.js";

test("hashPassword : format 'itérations.sel.empreinte', tout en hexadécimal", async () => {
  const stocke = await hashPassword("un-mot-de-passe-correct");
  const [iterations, sel, empreinte] = stocke.split(".");
  assert.equal(Number(iterations), PBKDF2_ITERATIONS);
  assert.match(sel, /^[0-9a-f]{32}$/, "sel de 16 octets");
  assert.match(empreinte, /^[0-9a-f]{64}$/, "empreinte de 32 octets");
});

test("hashPassword : deux hachages du même mot de passe diffèrent", async () => {
  // Le sel est tiré au hasard : sans lui, deux comptes ayant le même mot de
  // passe auraient la même empreinte, et une seule table précalculée les
  // casserait tous les deux.
  const a = await hashPassword("identique");
  const b = await hashPassword("identique");
  assert.notEqual(a, b);
});

test("verifyPassword : accepte le bon mot de passe", async () => {
  const stocke = await hashPassword("le-bon-mot-de-passe");
  assert.equal(await verifyPassword("le-bon-mot-de-passe", stocke), true);
});

test("verifyPassword : refuse le mauvais", async () => {
  const stocke = await hashPassword("le-bon-mot-de-passe");
  assert.equal(await verifyPassword("le-mauvais", stocke), false);
  assert.equal(await verifyPassword("", stocke), false);
  assert.equal(await verifyPassword("Le-Bon-Mot-De-Passe", stocke), false, "la casse compte");
});

test("verifyPassword : une empreinte malformée est refusée, jamais une exception", async () => {
  for (const mauvais of ["", "n-importe-quoi", "1.2", "abc.def.ghi", null, undefined]) {
    assert.equal(await verifyPassword("peu-importe", mauvais), false, `refusé : ${mauvais}`);
  }
});

test("verifyPassword : relit les itérations enregistrées, pas la constante courante", async () => {
  // Le jour où l'on augmente PBKDF2_ITERATIONS, les comptes existants doivent
  // continuer de fonctionner : leur empreinte porte son propre réglage.
  const stocke = await hashPassword("ancien-compte");
  const [, sel, empreinte] = stocke.split(".");
  const ancien = `1000.${sel}.${empreinte}`;
  assert.equal(await verifyPassword("ancien-compte", ancien), false, "empreinte incohérente refusée");
});

test("passwordError : longueur minimale exigée", () => {
  assert.ok(passwordError("court"));
  assert.ok(passwordError(""));
  assert.equal(passwordError("assez-long-pour-passer"), null);
});

test("passwordError : longueur maximale", () => {
  assert.ok(passwordError("x".repeat(201)));
  assert.equal(passwordError("x".repeat(200)), null);
});

test("passwordError : valeur absente refusée sans exception", () => {
  assert.ok(passwordError(undefined));
  assert.ok(passwordError(null));
});
