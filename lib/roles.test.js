import { test } from "node:test";
import assert from "node:assert/strict";
import { ROLES, ROLE_LABELS, can, homePathFor, PERMISSIONS } from "./roles.js";

test("les trois rôles annoncés existent et sont nommés en français", () => {
  assert.deepEqual(ROLES, ["ADMIN", "MAGASINIER", "LIVREUR"]);
  for (const r of ROLES) assert.ok(ROLE_LABELS[r], `libellé manquant pour ${r}`);
});

test("l'administrateur peut tout faire", () => {
  for (const action of Object.keys(PERMISSIONS)) {
    assert.equal(can("ADMIN", action), true, `ADMIN devrait pouvoir : ${action}`);
  }
});

test("un livreur ne touche jamais à l'argent", () => {
  // C'est la raison d'être des rôles : quelqu'un qui livre ne doit pas pouvoir
  // encaisser une caution, rembourser, ni consulter le chiffre d'affaires.
  assert.equal(can("LIVREUR", "voirFinances"), false);
  assert.equal(can("LIVREUR", "gererArgent"), false);
  assert.equal(can("LIVREUR", "gererProduits"), false);
  assert.equal(can("LIVREUR", "gererEquipe"), false);
});

test("un livreur peut scanner, livrer et voir ses tournées", () => {
  assert.equal(can("LIVREUR", "scanner"), true);
  assert.equal(can("LIVREUR", "livrer"), true);
  assert.equal(can("LIVREUR", "voirTournees"), true);
});

test("un magasinier gère le stock mais pas l'argent", () => {
  assert.equal(can("MAGASINIER", "gererStock"), true);
  assert.equal(can("MAGASINIER", "imprimerEtiquettes"), true);
  assert.equal(can("MAGASINIER", "voirReservations"), true);
  assert.equal(can("MAGASINIER", "voirFinances"), false);
  assert.equal(can("MAGASINIER", "gererArgent"), false);
  assert.equal(can("MAGASINIER", "gererEquipe"), false);
});

test("un magasinier ne modifie pas les prix", () => {
  assert.equal(can("MAGASINIER", "gererProduits"), false);
});

test("un rôle inconnu ne peut rien", () => {
  // Sécurité par défaut : au moindre doute sur le rôle, on refuse.
  for (const action of Object.keys(PERMISSIONS)) {
    assert.equal(can("INTRUS", action), false);
    assert.equal(can(null, action), false);
    assert.equal(can(undefined, action), false);
  }
});

test("une action inconnue est refusée, même pour un administrateur", () => {
  assert.equal(can("ADMIN", "action-qui-n-existe-pas"), false);
});

test("homePathFor : chacun arrive là où il a quelque chose à faire", () => {
  assert.equal(homePathFor("ADMIN"), "/admin");
  assert.equal(homePathFor("MAGASINIER"), "/admin");
  assert.equal(homePathFor("LIVREUR"), "/admin/tournees");
  assert.equal(homePathFor("INTRUS"), "/admin");
});

test("seul l'administrateur répartit les tournées", () => {
  assert.equal(can("ADMIN", "planifierTournees"), true);
  assert.equal(can("MAGASINIER", "planifierTournees"), false);
  assert.equal(can("LIVREUR", "planifierTournees"), false);
});
