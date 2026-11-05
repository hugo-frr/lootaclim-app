// Données de test pour les tournées : 3 livreurs et des locations à de
// vraies adresses de Paris et de la petite couronne, sur une semaine ou un
// mois, tournées déjà calculées pour chaque jour.
//
//   npm run db:demo-tournees                      une semaine à partir d'aujourd'hui
//   npm run db:demo-tournees -- --mois            un mois (30 jours)
//   npm run db:demo-tournees -- --jours=14        un nombre de jours au choix
//   npm run db:demo-tournees -- --sans-planifier  sans calculer les tournées
//   npm run db:demo-tournees -- --effacer         retire tout ce que ce script a créé
//
// Tout ce qui est créé est reconnaissable : emails en @test.lootaclim.fr,
// références TEST-…, machines TEST-…. Rien d'autre n'est jamais touché.
// Le tirage est fixe : relancer le script redonne les mêmes données.

import { prisma } from "../lib/prisma.js";
import { addDays, nowInParis } from "../lib/dates.js";
import { hashPassword } from "../lib/password.js";
import { geocoder } from "../lib/geocodage.js";
import { TIME_SLOTS } from "../lib/constants.js";
import { planifierJour } from "../lib/tournees/planification.js";

const DOMAINE = "@test.lootaclim.fr";
const MOT_DE_PASSE = "tournee-test-2026";

// Jours travaillés (0 = dimanche … 6 = samedi) : chacun a ses jours de
// repos, pour voir aussi l'écran « Pas de tournée prévue ».
const LIVREURS = [
  { name: "Karim (test)", email: `livreur1${DOMAINE}`, jours: [1, 2, 3, 4, 5, 6] },
  { name: "Léa (test)", email: `livreur2${DOMAINE}`, jours: [1, 2, 3, 4, 5] },
  { name: "Mehdi (test)", email: `livreur3${DOMAINE}`, jours: [0, 3, 4, 5, 6] },
];

// Nouvelles locations qui démarrent chaque jour, du dimanche au samedi.
// Avec les reprises, cela fait 10 à 16 arrêts par jour en semaine.
const LIVRAISONS_PAR_JOUR = [3, 6, 7, 7, 8, 8, 6];
// Durées de location en jours (0 : livrée et reprise le même jour).
const DUREES = [0, 2, 3, 3, 5, 5, 7, 7, 10, 14];

// Vraies adresses, tous arrondissements et quelques communes proches.
const ADRESSES = [
  ["8 Rue de la Roquette", "75011", "Paris"],
  ["45 Rue Oberkampf", "75011", "Paris"],
  ["12 Rue des Martyrs", "75009", "Paris"],
  ["30 Rue de Lévis", "75017", "Paris"],
  ["110 Rue du Faubourg Saint-Denis", "75010", "Paris"],
  ["18 Rue Lepic", "75018", "Paris"],
  ["22 Rue de Belleville", "75020", "Paris"],
  ["60 Rue de Ménilmontant", "75020", "Paris"],
  ["14 Rue Mouffetard", "75005", "Paris"],
  ["40 Rue Monge", "75005", "Paris"],
  ["7 Rue de Buci", "75006", "Paris"],
  ["25 Rue du Bac", "75007", "Paris"],
  ["50 Rue Cler", "75007", "Paris"],
  ["15 Rue de Passy", "75016", "Paris"],
  ["80 Avenue de Versailles", "75016", "Paris"],
  ["120 Rue de la Convention", "75015", "Paris"],
  ["35 Rue du Commerce", "75015", "Paris"],
  ["10 Rue Daguerre", "75014", "Paris"],
  ["20 Rue de la Butte aux Cailles", "75013", "Paris"],
  ["90 Avenue d'Italie", "75013", "Paris"],
  ["40 Rue de Charenton", "75012", "Paris"],
  ["30 Rue des Rosiers", "75004", "Paris"],
  ["50 Rue Montorgueil", "75002", "Paris"],
  ["32 Rue de Bretagne", "75003", "Paris"],
  ["20 Rue des Dames", "75017", "Paris"],
  ["5 Rue de Charonne", "75011", "Paris"],
  ["20 Avenue Jean-Baptiste Clément", "92100", "Boulogne-Billancourt"],
  ["10 Rue de Paris", "93100", "Montreuil"],
  ["15 Rue du Midi", "94300", "Vincennes"],
  ["30 Rue Anatole France", "92300", "Levallois-Perret"],
  ["25 Rue de la Pompe", "75016", "Paris"],
  ["70 Boulevard de Grenelle", "75015", "Paris"],
  ["12 Rue de Vaugirard", "75006", "Paris"],
  ["40 Rue de Tolbiac", "75013", "Paris"],
  ["15 Rue des Pyrénées", "75020", "Paris"],
  ["28 Rue Caulaincourt", "75018", "Paris"],
  ["60 Rue Saint-Maur", "75011", "Paris"],
  ["9 Rue Cadet", "75009", "Paris"],
  ["18 Rue de la Gaîté", "75014", "Paris"],
  ["35 Avenue de Saint-Ouen", "75017", "Paris"],
  ["12 Rue Gabriel Péri", "92120", "Montrouge"],
  ["40 Avenue de la République", "92120", "Montrouge"],
  ["8 Rue Victor Hugo", "92130", "Issy-les-Moulineaux"],
  ["20 Rue Hoche", "94200", "Ivry-sur-Seine"],
  ["15 Avenue du Général de Gaulle", "94160", "Saint-Mandé"],
];

const PRENOMS = ["Camille", "Hugo", "Inès", "Lucas", "Chloé", "Yanis", "Manon", "Théo", "Sarah", "Nathan", "Jade", "Adam", "Louise", "Rayan"];
const NOMS = ["Martin", "Bernard", "Dubois", "Moreau", "Laurent", "Simon", "Michel", "Garcia", "Roux", "Fontaine", "Benali", "Nguyen", "Lefèvre"];
const ETAGES = ["rdc", "asc", "esc", "asc"];

// Hasard reproductible : mêmes données à chaque lancement.
function hasard(graine) {
  let s = graine;
  return () => {
    s = (s * 1103515245 + 12345) % 2147483648;
    return s / 2147483648;
  };
}
const alea = hasard(2026);
const tirer = (liste) => liste[Math.floor(alea() * liste.length)];

const jourSemaine = (day) => new Date(day).getUTCDay();

function nombreDeJours() {
  if (process.argv.includes("--mois")) return 30;
  const opt = process.argv.find((a) => a.startsWith("--jours="));
  const n = opt ? Number(opt.split("=")[1]) : 7;
  if (!Number.isInteger(n) || n < 1 || n > 92) throw new Error("--jours doit être un nombre entre 1 et 92.");
  return n;
}

async function verifierQueCeNestPasLaProduction() {
  if (process.env.VERCEL_ENV === "production") throw new Error("Refusé en production.");
  const vraies = await prisma.booking.count({ where: { NOT: { reference: { startsWith: "TEST-" } } } });
  if (vraies > 20 && process.env.SEED_FORCE !== "oui") {
    console.error(`\n⛔ ${vraies} vraies réservations trouvées : cette base ressemble à la production.`);
    console.error("   Vérifiez POSTGRES_PRISMA_URL dans .env. Pour passer outre : SEED_FORCE=oui\n");
    process.exit(1);
  }
}

async function effacer() {
  const tests = await prisma.booking.findMany({ where: { reference: { startsWith: "TEST-" } }, select: { id: true } });
  const ids = tests.map((b) => b.id);
  await prisma.delivery.deleteMany({ where: { bookingId: { in: ids } } });
  await prisma.booking.deleteMany({ where: { id: { in: ids } } });
  await prisma.unit.deleteMany({ where: { serialNumber: { startsWith: "TEST-" } } });
  await prisma.customer.deleteMany({ where: { email: { endsWith: DOMAINE } } }); // adresses en cascade
  await prisma.user.deleteMany({ where: { email: { endsWith: DOMAINE } } }); // tournées en cascade
  // Tournées d'autres livreurs vidées par la suppression.
  await prisma.tour.deleteMany({ where: { deliveries: { none: {} } } });
  console.log(`🧹 Données de test effacées (${ids.length} réservations).`);
}

// Le programme des locations, sans rien écrire en base : pour chaque jour,
// des livraisons, et des locations déjà en cours dont la reprise tombe
// pendant la période (sans elles, les premiers jours n'auraient aucune reprise).
function programme(aujourdhui, nbJours) {
  const { hour } = nowInParis();
  const restants = TIME_SLOTS.filter((s) => s.startHour > hour);
  const locations = [];

  for (let j = -14; j < nbJours; j++) {
    const jour = addDays(aujourdhui, j);
    const passe = j < 0;
    const nb = LIVRAISONS_PAR_JOUR[jourSemaine(jour)];
    for (let k = 0; k < nb; k++) {
      const duree = passe ? tirer(DUREES.filter((d) => d > 0)) : tirer(DUREES);
      const fin = addDays(jour, duree);
      // Location passée : seule compte celle dont la reprise reste à faire.
      if (passe && fin < aujourdhui) continue;
      // Aujourd'hui, seulement les créneaux pas encore commencés : un test
      // lancé le soir ne doit pas produire que des arrêts impossibles.
      const possibles = jour === aujourdhui ? restants : TIME_SLOTS;
      if (!passe && !possibles.length) continue;
      let creneauLivraison = passe ? tirer(TIME_SLOTS).id : tirer(possibles).id;
      let creneauReprise = tirer(fin === aujourdhui && restants.length ? restants : TIME_SLOTS).id;
      if (duree === 0) {
        // Location d'un jour : la reprise toujours après la livraison.
        const i = possibles.findIndex((s) => s.id === creneauLivraison);
        if (i >= possibles.length - 1) continue;
        creneauLivraison = possibles[i].id;
        creneauReprise = tirer(possibles.slice(i + 1)).id;
      }
      locations.push({ debut: jour, fin, passe, creneauLivraison, creneauReprise });
    }
  }
  return locations;
}

async function creer(nbJours) {
  const produits = await prisma.product.findMany({ where: { active: true }, orderBy: { name: "asc" } });
  if (!produits.length) throw new Error("Aucun modèle en base : lancez d'abord npm run db:seed.");

  const passwordHash = await hashPassword(MOT_DE_PASSE);
  const livreurs = [];
  for (const { jours, ...l } of LIVREURS) {
    const u = await prisma.user.create({ data: { ...l, passwordHash, role: "LIVREUR" } });
    livreurs.push({ ...u, jours });
  }

  // Une adresse n'est demandée qu'une fois au service de géocodage.
  console.log(`📍 Géocodage de ${ADRESSES.length} adresses…`);
  const coordonnees = [];
  let introuvables = 0;
  for (const [line1, zip, city] of ADRESSES) {
    const c = await geocoder({ line1, zip, city });
    if (!c) {
      introuvables++;
      console.warn(`⚠️  Adresse introuvable, utilisée quand même sans coordonnées : ${line1}, ${zip}`);
    }
    coordonnees.push(c);
  }

  const aujourdhui = nowInParis().day;
  const derniers = addDays(aujourdhui, nbJours - 1);
  const locations = programme(aujourdhui, nbJours);

  // Parc de machines : une machine resservie dès qu'elle est revenue,
  // comme en vrai, au lieu d'une machine neuve par location.
  const parc = new Map(produits.map((p) => [p.id, []]));
  let numMachine = 0;
  async function machinePour(produit, debut, fin, enLocation) {
    const libres = parc.get(produit.id);
    let m = libres.find((x) => x.libreLe < debut);
    if (!m) {
      numMachine++;
      const unit = await prisma.unit.create({
        data: { serialNumber: `TEST-M${String(numMachine).padStart(3, "0")}`, productId: produit.id },
      });
      m = { id: unit.id, libreLe: "" };
      libres.push(m);
    }
    m.libreLe = fin;
    if (enLocation) await prisma.unit.update({ where: { id: m.id }, data: { status: "RENTED" } });
    return m.id;
  }

  console.log(`📦 Création de ${locations.length} locations…`);
  for (const [i, loc] of locations.entries()) {
    const num = String(i + 1).padStart(3, "0");
    const a = Math.floor(alea() * ADRESSES.length);
    const [line1, zip, city] = ADRESSES[a];
    const produit = tirer(produits);
    const livree = loc.passe;

    const client = await prisma.customer.create({
      data: {
        email: `client${num}${DOMAINE}`,
        firstName: tirer(PRENOMS),
        lastName: tirer(NOMS),
        phone: `06 00 ${String(Math.floor(i / 100)).padStart(2, "0")} ${String(Math.floor(i / 10) % 10).padStart(2, "0")} ${String(i % 10).padStart(2, "0")}`,
        addresses: {
          create: {
            line1, zip, city,
            floor: tirer(ETAGES),
            accessCode: alea() < 0.3 ? `${1000 + Math.floor(alea() * 9000)}${tirer(["A", "B", ""])}` : null,
            lat: coordonnees[a]?.lat ?? null,
            lng: coordonnees[a]?.lng ?? null,
          },
        },
      },
      include: { addresses: true },
    });
    const unitId = await machinePour(produit, loc.debut, loc.fin, livree);
    await prisma.booking.create({
      data: {
        reference: `TEST-${num}`,
        customerId: client.id,
        addressId: client.addresses[0].id,
        productId: produit.id,
        unitId,
        startDate: new Date(loc.debut),
        endDate: new Date(loc.fin),
        status: livree ? "DELIVERED" : "CONFIRMED",
        subtotal: 0,
        total: 0,
        deliveryFee: 0,
        // Pas de caution sur les données de test : aucun appel Stripe possible.
        depositAmount: 0,
        deliveries: {
          create: [
            { type: "DROPOFF", date: new Date(loc.debut), timeSlot: loc.creneauLivraison, status: livree ? "DONE" : "SCHEDULED" },
            { type: "PICKUP", date: new Date(loc.fin), timeSlot: loc.creneauReprise },
          ],
        },
      },
    });
  }

  let sansTournee = 0;
  if (!process.argv.includes("--sans-planifier")) {
    console.log(`🚚 Calcul des tournées jour par jour…`);
    for (let j = 0; j < nbJours; j++) {
      const jour = addDays(aujourdhui, j);
      const presents = livreurs.filter((l) => l.jours.includes(jourSemaine(jour)));
      const { placees, nonPlacees } = await planifierJour(jour, presents.map((l) => l.id));
      sansTournee += nonPlacees;
      console.log(
        `   ${jour} · ${presents.map((l) => l.name.replace(" (test)", "")).join(", ").padEnd(19)} · ${placees} arrêt(s)` +
          (nonPlacees ? ` · ${nonPlacees} non placé(s)` : "")
      );
    }
  }

  console.log(`\n✅ ${locations.length} locations du ${aujourdhui} au ${derniers}, ${numMachine} machines de test, ${introuvables} adresse(s) introuvable(s).`);
  if (sansTournee) console.log(`   ${sansTournee} arrêt(s) sans tournée : visibles dans /admin/tournees, à donner à la main.`);
  console.log("   Livreurs de test (mot de passe commun) :");
  for (const l of LIVREURS) console.log(`   • ${l.name.padEnd(14)} ${l.email}`);
  console.log(`   Mot de passe : ${MOT_DE_PASSE}\n`);
}

async function main() {
  const nbJours = nombreDeJours();
  await verifierQueCeNestPasLaProduction();
  await effacer();
  if (!process.argv.includes("--effacer")) await creer(nbJours);
}

main()
  .catch((e) => {
    console.error(e.message ?? e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
