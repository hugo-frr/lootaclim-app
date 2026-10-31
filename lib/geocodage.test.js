import { test } from "node:test";
import assert from "node:assert/strict";
import { lireReponseGeocodage, geocoder } from "./geocodage.js";

// Réponse réelle de la Géoplateforme, raccourcie.
const reponse = (score, postcode = "75004") => ({
  type: "FeatureCollection",
  features: [
    {
      type: "Feature",
      geometry: { type: "Point", coordinates: [2.35995, 48.855602] },
      properties: { label: "12 Rue de Rivoli 75004 Paris", score, postcode, type: "housenumber" },
    },
  ],
});

test("une adresse bien reconnue donne ses coordonnées", () => {
  assert.deepEqual(lireReponseGeocodage(reponse(0.97), "75004"), {
    lat: 48.855602,
    lng: 2.35995,
    label: "12 Rue de Rivoli 75004 Paris",
  });
});

test("un score trop faible est refusé : mieux vaut signaler que placer au hasard", () => {
  assert.equal(lireReponseGeocodage(reponse(0.3), "75004"), null);
});

test("un code postal différent est refusé", () => {
  assert.equal(lireReponseGeocodage(reponse(0.97, "75011"), "75004"), null);
});

test("aucun résultat ou réponse vide", () => {
  assert.equal(lireReponseGeocodage({ features: [] }, "75004"), null);
  assert.equal(lireReponseGeocodage(null, "75004"), null);
});

test("geocoder ne lève jamais, même si le service tombe", async () => {
  const enPanne = async () => { throw new Error("réseau"); };
  assert.equal(await geocoder({ line1: "12 rue de Rivoli", zip: "75004", city: "Paris" }, enPanne), null);
  const erreur500 = async () => ({ ok: false, json: async () => ({}) });
  assert.equal(await geocoder({ line1: "x", zip: "75004", city: "Paris" }, erreur500), null);
});

test("geocoder interroge le service avec l'adresse complète", async () => {
  let url = "";
  const faux = async (u) => { url = String(u); return { ok: true, json: async () => reponse(0.97) }; };
  const r = await geocoder({ line1: "12 rue de Rivoli", zip: "75004", city: "Paris" }, faux);
  assert.equal(r.lat, 48.855602);
  assert.match(url, /data\.geopf\.fr\/geocodage\/search/);
  assert.match(url, /12\+rue\+de\+Rivoli|12%20rue%20de%20Rivoli/);
});
