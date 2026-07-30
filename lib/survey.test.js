import { test } from "node:test";
import assert from "node:assert/strict";
import {
  orderQuestions,
  checkAnswer,
  validateSurvey,
  summarise,
  reorder,
  MAX_TEXTE,
} from "./survey.js";

// Jeu de questions minimal, dans le désordre pour éprouver le tri.
function questions() {
  return [
    {
      id: "q-prix",
      label: "Quel prix ?",
      type: "choice",
      position: 1,
      required: true,
      active: true,
      choices: [
        { id: "c-cher", label: "Cher", position: 1 },
        { id: "c-pas-cher", label: "Pas cher", position: 0 },
      ],
    },
    {
      id: "q-arr",
      label: "Quel arrondissement ?",
      type: "choice",
      position: 0,
      required: true,
      active: true,
      choices: [{ id: "c-11", label: "11e", position: 0 }],
    },
    {
      id: "q-email",
      label: "Votre email ?",
      type: "email",
      position: 2,
      required: false,
      active: true,
      choices: [],
    },
    {
      id: "q-retiree",
      label: "Question désactivée",
      type: "text",
      position: 3,
      required: true,
      active: false,
      choices: [],
    },
  ];
}

test("orderQuestions : trie par position et écarte les désactivées", () => {
  const o = orderQuestions(questions());
  assert.deepEqual(o.map((q) => q.id), ["q-arr", "q-prix", "q-email"]);
});

test("orderQuestions : trie aussi les choix de chaque question", () => {
  const prix = orderQuestions(questions()).find((q) => q.id === "q-prix");
  assert.deepEqual(prix.choices.map((c) => c.id), ["c-pas-cher", "c-cher"]);
});

test("checkAnswer : une question obligatoire vide est refusée", () => {
  const q = questions()[0];
  assert.ok(checkAnswer(q, ""));
  assert.ok(checkAnswer(q, undefined));
  assert.ok(checkAnswer(q, "   "));
});

test("checkAnswer : une question facultative vide est acceptée", () => {
  const email = questions().find((q) => q.id === "q-email");
  assert.equal(checkAnswer(email, ""), null);
});

test("checkAnswer : un choix inconnu est refusé", () => {
  const q = questions()[0];
  assert.equal(checkAnswer(q, "c-cher"), null);
  assert.ok(checkAnswer(q, "choix-invente"));
});

test("checkAnswer : email valide ou non", () => {
  const email = questions().find((q) => q.id === "q-email");
  assert.equal(checkAnswer(email, "hugo@exemple.fr"), null);
  assert.ok(checkAnswer(email, "pas-un-email"));
});

test("checkAnswer : texte trop long refusé", () => {
  const q = { type: "text", required: true, choices: [] };
  assert.equal(checkAnswer(q, "x".repeat(MAX_TEXTE)), null);
  assert.ok(checkAnswer(q, "x".repeat(MAX_TEXTE + 1)));
});

test("validateSurvey : réponses complètes acceptées et mises en forme", () => {
  const r = validateSurvey(questions(), {
    "q-arr": "c-11",
    "q-prix": "c-cher",
    "q-email": "  Hugo@Exemple.FR  ",
  });
  assert.equal(r.ok, true);
  assert.deepEqual(r.reponses, [
    { questionId: "q-arr", choiceId: "c-11" },
    { questionId: "q-prix", choiceId: "c-cher" },
    { questionId: "q-email", text: "hugo@exemple.fr" },
  ]);
});

test("validateSurvey : une obligatoire manquante bloque", () => {
  const r = validateSurvey(questions(), { "q-arr": "c-11" });
  assert.equal(r.ok, false);
  assert.ok(r.erreurs["q-prix"]);
});

test("validateSurvey : une facultative vide n'est pas enregistrée", () => {
  const r = validateSurvey(questions(), { "q-arr": "c-11", "q-prix": "c-cher", "q-email": "" });
  assert.equal(r.ok, true);
  assert.equal(r.reponses.length, 2);
});

test("validateSurvey : une question désactivée est ignorée", () => {
  const r = validateSurvey(questions(), { "q-arr": "c-11", "q-prix": "c-cher" });
  assert.equal(r.ok, true, "la question désactivée ne doit pas être exigée");
});

test("summarise : compte par choix, y compris ceux jamais retenus", () => {
  const reponses = [
    { answers: [{ questionId: "q-prix", choiceId: "c-cher" }] },
    { answers: [{ questionId: "q-prix", choiceId: "c-cher" }] },
    { answers: [{ questionId: "q-prix", choiceId: "c-pas-cher" }] },
  ];
  const prix = summarise(questions(), reponses).find((q) => q.id === "q-prix");
  assert.equal(prix.total, 3);
  assert.equal(prix.choices.find((c) => c.id === "c-cher").count, 2);
  assert.equal(prix.choices.find((c) => c.id === "c-cher").percent, 67);
  assert.equal(prix.choices.find((c) => c.id === "c-pas-cher").percent, 33);
});

test("summarise : les réponses libres sont regroupées, du plus cité au moins cité", () => {
  const reponses = [
    { answers: [{ questionId: "q-email", text: "a@b.fr" }] },
    { answers: [{ questionId: "q-email", text: "A@B.FR" }] },
    { answers: [{ questionId: "q-email", text: "c@d.fr" }] },
  ];
  const email = summarise(questions(), reponses).find((q) => q.id === "q-email");
  assert.equal(email.choices[0].count, 2, "le plus cité arrive en tête");
  assert.equal(email.choices[1].count, 1);
});

test("summarise : aucune réponse ne provoque pas de division par zéro", () => {
  const r = summarise(questions(), []);
  assert.equal(r.length, 3, "seules les questions actives");
  for (const q of r) for (const c of q.choices) assert.equal(c.percent, 0);
});

test("reorder : monter une question réécrit toutes les positions", () => {
  const q = [
    { id: "a", position: 0 },
    { id: "b", position: 1 },
    { id: "c", position: 2 },
  ];
  assert.deepEqual(reorder(q, "b", "haut"), [
    { id: "b", position: 0 },
    { id: "a", position: 1 },
    { id: "c", position: 2 },
  ]);
});

test("reorder : descendre la dernière ou monter la première est impossible", () => {
  const q = [
    { id: "a", position: 0 },
    { id: "b", position: 1 },
  ];
  assert.equal(reorder(q, "a", "haut"), null);
  assert.equal(reorder(q, "b", "bas"), null);
  assert.equal(reorder(q, "inconnu", "haut"), null);
});

test("reorder : des positions en doublon ou avec des trous sont réparées", () => {
  const q = [
    { id: "a", position: 0 },
    { id: "b", position: 0 },
    { id: "c", position: 9 },
  ];
  const r = reorder(q, "c", "haut");
  assert.deepEqual(r.map((x) => x.position), [0, 1, 2]);
});
