// Calcul des tournées : répartir des arrêts entre plusieurs livreurs et les
// ordonner, en respectant les créneaux promis aux clients et la place dans
// les véhicules. C'est le problème classique du VRPTW (tournées de véhicules
// avec fenêtres horaires), ici avec livraisons et reprises mélangées.
//
// Aucune méthode ne garantit la meilleure solution en temps raisonnable. On
// suit celle des solveurs professionnels :
//   1. construction par insertion avec regret : on place d'abord les arrêts
//      qui n'ont qu'une bonne place possible ;
//   2. ruine et reconstruction (LNS) : on retire un groupe d'arrêts voisins
//      et on les réinsère, en boucle, pour sortir des solutions « bonnes
//      mais pas meilleures » ;
//   3. recherche locale finale : déplacer, échanger, inverser un morceau
//      (2-opt), échanger les fins de deux tournées (2-opt*).
//
// Module pur : ni base, ni réseau. Toutes les heures sont en minutes depuis
// minuit, tous les lieux sont des indices dans la matrice des temps.

// Coût d'un arrêt laissé de côté : bien plus cher que n'importe quel détour.
const PENALITE_NON_CASE = 100000;
// Équilibre entre livreurs : minutes de pénalité par heure² de travail. Une
// journée de 8 h contre 0 h coûte 320 min de plus que deux journées de 4 h.
const POIDS_EQUILIBRE = 10;
const EPSILON = 1e-9;

/** Générateur pseudo-aléatoire à graine (mulberry32) : résultats reproductibles. */
export function aleatoire(graine) {
  let a = graine >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Parcourt une tournée. Renvoie null dès qu'une règle est violée, sinon
 * { conduite, travail, fin, passages: [{ arrivee, debut }] }.
 */
export function evaluerTournee(ids, vehicule, arrets, temps) {
  // Les machines à livrer sont toutes chargées au départ.
  let charge = 0;
  for (const id of ids) if (arrets.get(id).type === "DROPOFF") charge++;
  if (charge > vehicule.capacite) return null;

  let t = vehicule.debut;
  let lieu = vehicule.depart;
  let conduite = 0;
  let travail = 0;
  const vus = new Set();
  const passages = [];
  for (const id of ids) {
    const a = arrets.get(id);
    if (a.apres && !vus.has(a.apres)) return null;
    const trajet = temps[lieu][a.lieu];
    const arrivee = t + trajet;
    // En avance : on attend l'ouverture du créneau.
    const debut = Math.max(arrivee, a.fenetre[0]);
    if (debut > a.fenetre[1] + EPSILON) return null;
    conduite += trajet;
    travail += trajet + a.service;
    t = debut + a.service;
    charge += a.type === "DROPOFF" ? -1 : 1;
    if (charge > vehicule.capacite) return null;
    vus.add(id);
    passages.push({ arrivee, debut });
    lieu = a.lieu;
  }
  const retour = temps[lieu][vehicule.arrivee];
  conduite += retour;
  travail += retour;
  const fin = t + retour;
  if (fin > vehicule.fin + EPSILON) return null;
  return { conduite, travail, fin, passages };
}

const coutDe = (ev) => ev.conduite + POIDS_EQUILIBRE * (ev.travail / 60) ** 2;

function coutRoute(ids, v, ctx) {
  const ev = evaluerTournee(ids, ctx.vehicules[v], ctx.arrets, ctx.temps);
  return ev ? coutDe(ev) : null;
}

const coutTotal = (sol) =>
  sol.couts.reduce((s, c) => s + c, 0) + PENALITE_NON_CASE * sol.nonCases.length;

const copier = (sol) => ({
  routes: sol.routes.map((r) => r.slice()),
  couts: sol.couts.slice(),
  nonCases: sol.nonCases.slice(),
});

// Insère les arrêts donnés, le plus « regrettable » d'abord. Les meilleures
// places sont gardées en cache et recalculées seulement pour la tournée qui
// vient de changer.
function inserer(sol, ids, ctx) {
  const V = ctx.vehicules.length;
  const aPlacer = new Set(ids);
  const meilleurePlace = (id, v) => {
    const r = sol.routes[v];
    let best = null;
    for (let p = 0; p <= r.length; p++) {
      const c = coutRoute([...r.slice(0, p), id, ...r.slice(p)], v, ctx);
      if (c !== null && (best === null || c - sol.couts[v] < best.delta - EPSILON)) {
        best = { delta: c - sol.couts[v], pos: p, cout: c };
      }
    }
    return best;
  };
  const cache = new Map();
  for (const id of aPlacer) cache.set(id, Array.from({ length: V }, (_, v) => meilleurePlace(id, v)));

  while (aPlacer.size) {
    let choix = null;
    for (const id of aPlacer) {
      const options = cache
        .get(id)
        .map((o, v) => o && { ...o, v })
        .filter(Boolean)
        .sort((x, y) => x.delta - y.delta || x.v - y.v);
      if (!options.length) continue;
      const regret = options.length > 1 ? options[1].delta - options[0].delta : Infinity;
      const delta = options[0].delta;
      // Le plus grand regret d'abord ; à égalité, l'insertion la moins chère ;
      // puis l'identifiant, pour un résultat reproductible.
      let mieux = !choix;
      if (!mieux) {
        if (regret !== choix.regret && Math.abs(regret - choix.regret) > EPSILON) mieux = regret > choix.regret;
        else if (Math.abs(delta - choix.delta) > EPSILON) mieux = delta < choix.delta;
        else mieux = id < choix.id;
      }
      if (mieux) choix = { id, regret, ...options[0] };
    }
    if (!choix) break;
    const r = sol.routes[choix.v];
    sol.routes[choix.v] = [...r.slice(0, choix.pos), choix.id, ...r.slice(choix.pos)];
    sol.couts[choix.v] = choix.cout;
    aPlacer.delete(choix.id);
    for (const id of aPlacer) cache.get(id)[choix.v] = meilleurePlace(id, choix.v);
  }
  sol.nonCases = [...aPlacer];
}

// Retire un groupe d'arrêts proches les uns des autres : les réinsérer
// ensemble permet de réorganiser tout un quartier d'un coup.
function retirer(sol, ctx, rng) {
  const places = sol.routes.flat();
  if (!places.length) return [];
  const maxQ = Math.min(10, Math.max(2, Math.ceil(places.length * 0.3)));
  const q = Math.min(places.length, 2 + Math.floor(rng() * (maxQ - 1)));
  const graine = ctx.arrets.get(places[Math.floor(rng() * places.length)]);
  const proximite = (id) => {
    const a = ctx.arrets.get(id);
    return ctx.temps[graine.lieu][a.lieu] + ctx.temps[a.lieu][graine.lieu];
  };
  const retires = new Set(
    [...places].sort((x, y) => proximite(x) - proximite(y) || (x < y ? -1 : 1)).slice(0, q)
  );
  // Une livraison et sa reprise du même jour partent ensemble.
  for (const id of places) {
    const a = ctx.arrets.get(id);
    if (a.apres && (retires.has(id) || retires.has(a.apres))) {
      retires.add(id);
      retires.add(a.apres);
    }
  }
  sol.routes.forEach((r, v) => {
    const reste = r.filter((id) => !retires.has(id));
    let c = coutRoute(reste, v, ctx);
    // Temps de trajet réels non « triangulaires » : retirer un arrêt peut,
    // rarement, rendre la suite infaisable. On vide alors la tournée.
    if (c === null) {
      reste.forEach((id) => retires.add(id));
      sol.routes[v] = [];
      c = coutRoute([], v, ctx);
    } else {
      sol.routes[v] = reste;
    }
    sol.couts[v] = c ?? 0;
  });
  return [...retires];
}

// Applique les nouvelles tournées si elles sont faisables et moins chères.
function tenter(sol, ctx, changements) {
  let delta = 0;
  const nouveaux = [];
  for (const [v, r] of changements) {
    const c = coutRoute(r, v, ctx);
    if (c === null) return false;
    delta += c - sol.couts[v];
    nouveaux.push([v, r, c]);
  }
  if (delta >= -1e-6) return false;
  for (const [v, r, c] of nouveaux) {
    sol.routes[v] = r;
    sol.couts[v] = c;
  }
  return true;
}

// Cherche une amélioration et l'applique. Renvoie false si aucune.
function unPas(sol, ctx) {
  const R = sol.routes;
  const V = R.length;
  // 2-opt : inverser un morceau d'une tournée.
  for (let v = 0; v < V; v++) {
    const r = R[v];
    for (let i = 0; i < r.length - 1; i++) {
      for (let j = i + 1; j < r.length; j++) {
        const n = [...r.slice(0, i), ...r.slice(i, j + 1).reverse(), ...r.slice(j + 1)];
        if (tenter(sol, ctx, [[v, n]])) return true;
      }
    }
  }
  // Déplacer un arrêt, dans sa tournée ou vers une autre.
  for (let a = 0; a < V; a++) {
    for (let i = 0; i < R[a].length; i++) {
      const x = R[a][i];
      const sans = R[a].filter((_, k) => k !== i);
      for (let b = 0; b < V; b++) {
        const base = b === a ? sans : R[b];
        for (let j = 0; j <= base.length; j++) {
          if (b === a && j === i) continue;
          const n = [...base.slice(0, j), x, ...base.slice(j)];
          const ok = b === a ? tenter(sol, ctx, [[a, n]]) : tenter(sol, ctx, [[a, sans], [b, n]]);
          if (ok) return true;
        }
      }
    }
  }
  for (let a = 0; a < V; a++) {
    for (let b = a + 1; b < V; b++) {
      // Échanger deux arrêts entre deux tournées.
      for (let i = 0; i < R[a].length; i++) {
        for (let j = 0; j < R[b].length; j++) {
          const na = R[a].slice();
          const nb = R[b].slice();
          [na[i], nb[j]] = [nb[j], na[i]];
          if (tenter(sol, ctx, [[a, na], [b, nb]])) return true;
        }
      }
      // 2-opt* : échanger les fins de deux tournées.
      for (let i = 0; i <= R[a].length; i++) {
        for (let j = 0; j <= R[b].length; j++) {
          const na = [...R[a].slice(0, i), ...R[b].slice(j)];
          const nb = [...R[b].slice(0, j), ...R[a].slice(i)];
          if (tenter(sol, ctx, [[a, na], [b, nb]])) return true;
        }
      }
    }
  }
  return false;
}

function ameliorer(sol, ctx, limite) {
  for (let k = 0; k < 2000 && Date.now() < limite; k++) {
    if (!unPas(sol, ctx)) return;
  }
}

function raison(id, sol, ctx) {
  const a = ctx.arrets.get(id);
  if (a.apres && sol.nonCases.includes(a.apres)) {
    return "Dépend de la livraison du même jour, elle-même non placée.";
  }
  const seul = a.apres ? [a.apres, id] : [id];
  const faisableSeul = ctx.vehicules.some(
    (v) => evaluerTournee(seul, v, ctx.arrets, ctx.temps) !== null
  );
  if (!ctx.vehicules.length) return "Aucun livreur sélectionné.";
  return faisableSeul
    ? "Plus de place dans les tournées : trop d'arrêts sur ce créneau ou véhicules pleins."
    : "Créneau impossible à tenir depuis l'entrepôt dans la journée.";
}

export function resoudre({ arrets, vehicules, temps, iterations = 400, graine = 1, dureeMaxMs = 2500 }) {
  const ctx = { arrets: new Map(arrets.map((a) => [a.id, a])), vehicules, temps };
  const limite = Date.now() + dureeMaxMs;
  const rng = aleatoire(graine);

  const courantInit = {
    routes: vehicules.map(() => []),
    couts: vehicules.map((_, v) => coutRoute([], v, ctx) ?? 0),
    nonCases: [],
  };
  inserer(courantInit, arrets.map((a) => a.id).sort(), ctx);
  let courant = courantInit;
  let meilleure = copier(courant);

  for (let k = 0; k < iterations && Date.now() < limite && vehicules.length; k++) {
    const essai = copier(courant);
    const retires = retirer(essai, ctx, rng);
    inserer(essai, [...retires, ...essai.nonCases], ctx);
    // Acceptation « record à record » : on tolère une solution un peu moins
    // bonne en début de recherche, de moins en moins ensuite.
    const tolerance = 0.01 * coutTotal(meilleure) * (1 - k / iterations);
    if (coutTotal(essai) < coutTotal(courant) + tolerance) courant = essai;
    if (coutTotal(courant) < coutTotal(meilleure) - 1e-6) meilleure = copier(courant);
  }
  ameliorer(meilleure, ctx, Math.max(limite, Date.now() + 300));

  return {
    tournees: vehicules.map((v, i) => {
      const ids = meilleure.routes[i];
      const ev = evaluerTournee(ids, v, ctx.arrets, temps);
      // Journée déjà finie, ou retour impossible avant la fin : ce livreur
      // n'a rien pu recevoir (l'insertion refuse toute tournée infaisable).
      if (!ev) return { vehicule: v.id, arrets: [], conduite: 0, fin: v.debut };
      return {
        vehicule: v.id,
        arrets: ids.map((id, k) => ({
          id,
          arrivee: Math.round(ev.passages[k].arrivee),
          debut: Math.round(ev.passages[k].debut),
        })),
        conduite: Math.round(ev.conduite),
        fin: Math.round(ev.fin),
      };
    }),
    nonCases: meilleure.nonCases.sort().map((id) => ({ id, raison: raison(id, meilleure, ctx) })),
  };
}

/**
 * Pour recalculer UNE tournée déjà attribuée : un arrêt ne doit jamais en
 * disparaître. Si le solveur n'arrive plus à tout placer (livreur déjà en
 * retard), on garde l'ordre actuel.
 */
export function ordreConserveSiIncomplet(resultat, idsActuels) {
  if (resultat.nonCases.length) return idsActuels.slice();
  return resultat.tournees[0].arrets.map((a) => a.id);
}
