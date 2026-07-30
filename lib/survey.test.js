import { test } from "node:test";
import assert from "node:assert/strict";
import { SURVEY_QUESTIONS, validateSurvey, summarise } from "./survey.js";

function reponseValide(extra = {}) {
  return {
    surface: "20-35",
    location: "11e",
    housing: "locataire",
    duration: "une-semaine",
    priceRange: "15-20",
    currentSolution: "ventilateur",
    blocker: "prix",
    ageRange: "25-34",
    ...extra,
  };
}

test("SURVEY_QUESTIONS : 8 questions, chacune avec des choix", () => {
  assert.equal(SURVEY_QUESTIONS.length, 8);
  for (const q of SURVEY_QUESTIONS) {
    assert.ok(q.id, "chaque question a un identifiant");
    assert.ok(q.label, `${q.id} : intitulé manquant`);
    if (q.free) {
      // Une question ouverte n'a pas de choix prédéfinis, mais doit être bornée.
      assert.ok(q.maxLength > 0, `${q.id} : longueur maximale attendue`);
      continue;
    }
    assert.ok(Array.isArray(q.choices) && q.choices.length >= 2, `${q.id} : au moins 2 choix`);
    for (const c of q.choices) {
      assert.ok(c.value && c.label, `${q.id} : chaque choix a une valeur et un intitulé`);
    }
  }
});

test("SURVEY_QUESTIONS : les identifiants sont uniques", () => {
  const ids = SURVEY_QUESTIONS.map((q) => q.id);
  assert.equal(new Set(ids).size, ids.length);
});

test("validateSurvey : une réponse complète est acceptée", () => {
  const r = validateSurvey(reponseValide());
  assert.equal(r.ok, true);
  assert.equal(r.valeurs.surface, "20-35");
  assert.equal(r.valeurs.email, null, "email absent devient null, pas undefined");
});

test("validateSurvey : une question manquante est refusée", () => {
  const donnees = reponseValide();
  delete donnees.priceRange;
  const r = validateSurvey(donnees);
  assert.equal(r.ok, false);
  assert.ok(r.erreurs.priceRange, "l'erreur nomme la question manquante");
});

test("validateSurvey : une valeur hors des choix proposés est refusée", () => {
  // Un formulaire web peut être modifié côté navigateur : on ne fait jamais
  // confiance à ce qui arrive.
  const r = validateSurvey(reponseValide({ surface: "1000-m2" }));
  assert.equal(r.ok, false);
  assert.ok(r.erreurs.surface);
});

test("validateSurvey : l'email est facultatif mais doit être valide s'il est fourni", () => {
  assert.equal(validateSurvey(reponseValide({ email: "" })).ok, true);
  assert.equal(validateSurvey(reponseValide({ email: "  " })).ok, true);
  assert.equal(validateSurvey(reponseValide({ email: "hugo@exemple.fr" })).ok, true);
  assert.equal(validateSurvey(reponseValide({ email: "pas-un-email" })).ok, false);
});

test("validateSurvey : l'email est nettoyé", () => {
  const r = validateSurvey(reponseValide({ email: "  Hugo@Exemple.FR  " }));
  assert.equal(r.valeurs.email, "hugo@exemple.fr");
});

test("validateSurvey : le lieu est nettoyé et borné", () => {
  assert.equal(validateSurvey(reponseValide({ location: "  11e  " })).valeurs.location, "11e");
  const long = validateSurvey(reponseValide({ location: "x".repeat(200) }));
  assert.equal(long.ok, false, "un lieu démesuré est refusé");
  assert.equal(validateSurvey(reponseValide({ location: "" })).ok, false);
});

test("summarise : compte les réponses par question", () => {
  const r = summarise([
    reponseValide({ surface: "20-35", housing: "locataire" }),
    reponseValide({ surface: "20-35", housing: "proprietaire" }),
    reponseValide({ surface: "moins-20", housing: "locataire" }),
  ]);
  const surface = r.find((q) => q.id === "surface");
  const vingt = surface.choices.find((c) => c.value === "20-35");
  assert.equal(vingt.count, 2);
  assert.equal(vingt.percent, 67, "arrondi à l'entier le plus proche");
  const moins = surface.choices.find((c) => c.value === "moins-20");
  assert.equal(moins.count, 1);
  assert.equal(moins.percent, 33);
});

test("summarise : les choix jamais retenus apparaissent à zéro", () => {
  const r = summarise([reponseValide()]);
  const housing = r.find((q) => q.id === "housing");
  const proprio = housing.choices.find((c) => c.value === "proprietaire");
  assert.equal(proprio.count, 0);
  assert.equal(proprio.percent, 0);
});

test("summarise : aucune réponse ne provoque pas de division par zéro", () => {
  const r = summarise([]);
  assert.equal(r.length, 8);
  for (const q of r) {
    for (const c of q.choices) {
      assert.equal(c.count, 0);
      assert.equal(c.percent, 0);
    }
  }
});
