import { test } from "node:test";
import assert from "node:assert/strict";
import { resoudre, evaluerTournee, aleatoire, ordreConserveSiIncomplet } from "./solveur.js";

// Plan en kilomètres : 1 km = 3 minutes de trajet. Lieu 0 = entrepôt.
function monde(coords) {
  const temps = coords.map(([x1, y1]) => coords.map(([x2, y2]) => Math.hypot(x1 - x2, y1 - y2) * 3));
  return temps;
}
const JOURNEE = [8 * 60 + 30, 22 * 60 + 30];
const vehicule = (id, extra = {}) => ({ id, depart: 0, arrivee: 0, debut: JOURNEE[0], fin: JOURNEE[1], capacite: 6, ...extra });
const arret = (id, lieu, extra = {}) => ({ id, type: "DROPOFF", lieu, fenetre: JOURNEE, service: 15, apres: null, ...extra });

// Vérifie les règles du métier sur une solution : chaque arrêt une seule
// fois, créneaux tenus, capacité jamais dépassée, retour avant la fin.
function verifier(res, arrets, vehicules, temps) {
  const parId = new Map(arrets.map((a) => [a.id, a]));
  const vus = [];
  res.tournees.forEach((t, i) => {
    const ids = t.arrets.map((a) => a.id);
    assert.ok(evaluerTournee(ids, vehicules[i], parId, temps), `tournée ${i} infaisable`);
    for (const a of t.arrets) {
      const [debut, fin] = parId.get(a.id).fenetre;
      assert.ok(a.debut >= debut - 1e-6 && a.debut <= fin + 1e-6, `${a.id} hors créneau`);
    }
    vus.push(...ids);
  });
  vus.push(...res.nonCases.map((n) => n.id));
  assert.deepEqual([...vus].sort(), arrets.map((a) => a.id).sort());
}

test("un seul livreur : les arrêts alignés sont visités dans l'ordre", () => {
  const temps = monde([[0, 0], [10, 0], [20, 0], [30, 0]]);
  const arrets = [arret("c", 3), arret("a", 1), arret("b", 2)];
  const res = resoudre({ arrets, vehicules: [vehicule("v1")], temps });
  const ordre = res.tournees[0].arrets.map((a) => a.id);
  assert.ok(ordre.join() === "a,b,c" || ordre.join() === "c,b,a", ordre.join());
  assert.equal(res.nonCases.length, 0);
});

test("les créneaux imposent l'ordre, même contre la géographie", () => {
  const temps = monde([[0, 0], [2, 0], [20, 0]]);
  const arrets = [
    arret("proche", 1, { fenetre: [14 * 60, 16 * 60] }),
    arret("loin", 2, { fenetre: [9 * 60, 11 * 60] }),
  ];
  const vehicules = [vehicule("v1")];
  const res = resoudre({ arrets, vehicules, temps });
  assert.deepEqual(res.tournees[0].arrets.map((a) => a.id), ["loin", "proche"]);
  verifier(res, arrets, vehicules, temps);
});

test("la capacité du véhicule n'est jamais dépassée", () => {
  const temps = monde([[0, 0], [1, 0], [2, 0], [3, 0], [4, 0], [5, 0]]);
  const arrets = [1, 2, 3, 4, 5].map((l) => arret(`d${l}`, l));
  const vehicules = [vehicule("v1", { capacite: 3 }), vehicule("v2", { capacite: 3 })];
  const res = resoudre({ arrets, vehicules, temps });
  verifier(res, arrets, vehicules, temps);
  assert.equal(res.nonCases.length, 0);
  for (const t of res.tournees) assert.ok(t.arrets.length <= 3);
});

test("une reprise libère de la place : livrer 6 puis reprendre 1 tient dans 6", () => {
  const temps = monde([[0, 0], [1, 0], [2, 0], [3, 0], [4, 0], [5, 0], [6, 0], [7, 0]]);
  const arrets = [1, 2, 3, 4, 5, 6].map((l) => arret(`d${l}`, l));
  arrets.push(arret("p7", 7, { type: "PICKUP" }));
  const vehicules = [vehicule("v1")];
  const res = resoudre({ arrets, vehicules, temps });
  verifier(res, arrets, vehicules, temps);
  assert.equal(res.nonCases.length, 0);
});

test("un créneau intenable est signalé, jamais forcé", () => {
  const temps = monde([[0, 0], [5, 0]]);
  const arrets = [arret("trop-tot", 1, { fenetre: [6 * 60, 7 * 60] })];
  const res = resoudre({ arrets, vehicules: [vehicule("v1")], temps });
  assert.equal(res.tournees[0].arrets.length, 0);
  assert.equal(res.nonCases.length, 1);
  assert.match(res.nonCases[0].raison, /créneau/i);
});

test("trop d'arrêts pour les véhicules : signalé comme manque de place", () => {
  const temps = monde([[0, 0], [1, 0], [2, 0]]);
  const arrets = [arret("a", 1), arret("b", 2)];
  const res = resoudre({ arrets, vehicules: [vehicule("v1", { capacite: 1 })], temps });
  assert.equal(res.nonCases.length, 1);
  assert.match(res.nonCases[0].raison, /place/);
});

test("location d'un jour : la reprise suit la livraison, dans la même tournée", () => {
  const temps = monde([[0, 0], [5, 5], [-5, -5]]);
  const arrets = [
    arret("rep", 1, { type: "PICKUP", apres: "liv", fenetre: [9 * 60, 22 * 60] }),
    arret("liv", 1, { fenetre: [9 * 60, 22 * 60] }),
    arret("autre", 2),
  ];
  const vehicules = [vehicule("v1"), vehicule("v2")];
  const res = resoudre({ arrets, vehicules, temps });
  verifier(res, arrets, vehicules, temps);
  const t = res.tournees.find((x) => x.arrets.some((a) => a.id === "liv"));
  const ids = t.arrets.map((a) => a.id);
  assert.ok(ids.indexOf("rep") > ids.indexOf("liv"));
});

test("deux quartiers, deux livreurs : chacun prend un quartier", () => {
  const coords = [[0, 0], [-10, 0], [-10, 1], [-11, 0], [-11, 1], [10, 0], [10, 1], [11, 0], [11, 1]];
  const temps = monde(coords);
  const arrets = coords.slice(1).map((_, i) => arret(i < 4 ? `ouest${i}` : `est${i}`, i + 1));
  const vehicules = [vehicule("v1"), vehicule("v2")];
  const res = resoudre({ arrets, vehicules, temps });
  verifier(res, arrets, vehicules, temps);
  for (const t of res.tournees) {
    const quartiers = new Set(t.arrets.map((a) => a.id.replace(/\d+$/, "")));
    assert.equal(quartiers.size, 1, `tournée mélangée : ${t.arrets.map((a) => a.id)}`);
  }
});

function grosseInstance(n, v) {
  const rng = aleatoire(42);
  const coords = [[0, 0]];
  for (let i = 0; i < n; i++) coords.push([rng() * 16 - 8, rng() * 12 - 6]);
  const creneaux = [9, 11, 14, 16, 18, 20];
  const arrets = coords.slice(1).map((_, i) => {
    const h = creneaux[Math.floor(rng() * creneaux.length)];
    return arret(`s${i}`, i + 1, { type: rng() < 0.6 ? "DROPOFF" : "PICKUP", fenetre: [h * 60, h * 60 + 120] });
  });
  const vehicules = Array.from({ length: v }, (_, i) => vehicule(`v${i}`));
  return { temps: monde(coords), arrets, vehicules };
}

test("instance réaliste : toutes les règles tenues, résultat reproductible", () => {
  const { temps, arrets, vehicules } = grosseInstance(40, 4);
  const a = resoudre({ arrets, vehicules, temps, iterations: 150 });
  verifier(a, arrets, vehicules, temps);
  const b = resoudre({ arrets, vehicules, temps, iterations: 150 });
  assert.deepEqual(a, b);
});

test("60 arrêts et 5 livreurs en moins de 3 secondes", () => {
  const { temps, arrets, vehicules } = grosseInstance(60, 5);
  const t0 = Date.now();
  const res = resoudre({ arrets, vehicules, temps });
  assert.ok(Date.now() - t0 < 3000, `${Date.now() - t0} ms`);
  verifier(res, arrets, vehicules, temps);
});

test("sans livreur, tout est signalé non casé", () => {
  const temps = monde([[0, 0], [1, 1]]);
  const res = resoudre({ arrets: [arret("a", 1)], vehicules: [], temps });
  assert.deepEqual(res.tournees, []);
  assert.equal(res.nonCases.length, 1);
});

test("recalcul d'une tournée : si un arrêt ne tient plus, on garde l'ordre actuel", () => {
  const complet = { tournees: [{ arrets: [{ id: "b" }, { id: "a" }] }], nonCases: [] };
  assert.deepEqual(ordreConserveSiIncomplet(complet, ["a", "b"]), ["b", "a"]);
  const incomplet = { tournees: [{ arrets: [{ id: "b" }] }], nonCases: [{ id: "a" }] };
  assert.deepEqual(ordreConserveSiIncomplet(incomplet, ["a", "b"]), ["a", "b"]);
});
