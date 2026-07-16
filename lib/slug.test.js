import { test } from "node:test";
import assert from "node:assert/strict";
import { slugify } from "./slug.js";

test("slugify : cas simple", () => {
  assert.equal(slugify("Rivoli"), "rivoli");
});

test("slugify : accents retirés", () => {
  assert.equal(slugify("Climatiseur Bastille"), "climatiseur-bastille");
  assert.equal(slugify("Été Frais"), "ete-frais");
});

test("slugify : espaces multiples et caractères spéciaux réduits à un seul tiret", () => {
  assert.equal(slugify("  Super   Modèle !!  "), "super-modele");
  assert.equal(slugify("Modèle n°2 (2026)"), "modele-n-2-2026");
});
