// Données de test pour les tournées : 3 livreurs et une trentaine
// d'interventions à de vraies adresses de Paris et de la petite couronne,
// aujourd'hui et demain.
//
//   npm run db:demo-tournees              crée (ou recrée) les données
//   npm run db:demo-tournees -- --effacer retire tout ce que ce script a créé
//
// Tout ce qui est créé est reconnaissable : emails en @test.lootaclim.fr,
// références TEST-…, machines TEST-…. Rien d'autre n'est jamais touché.

import { PrismaClient } from "@prisma/client";
import { addDays, nowInParis } from "../lib/dates.js";
import { hashPassword } from "../lib/password.js";
import { geocoder } from "../lib/geocodage.js";
import { TIME_SLOTS } from "../lib/constants.js";

const prisma = new PrismaClient();
const DOMAINE = "@test.lootaclim.fr";
const MOT_DE_PASSE = "tournee-test-2026";

const LIVREURS = [
  { name: "Karim (test)", email: `livreur1${DOMAINE}` },
  { name: "Léa (test)", email: `livreur2${DOMAINE}` },
  { name: "Mehdi (test)", email: `livreur3${DOMAINE}` },
];

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
];

const PRENOMS = ["Camille", "Hugo", "Inès", "Lucas", "Chloé", "Yanis", "Manon", "Théo", "Sarah", "Nathan"];
const NOMS = ["Martin", "Bernard", "Dubois", "Moreau", "Laurent", "Simon", "Michel", "Garcia", "Roux", "Fontaine"];
const ETAGES = ["rdc", "asc", "esc", "asc"];

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

async function creer() {
  const produits = await prisma.product.findMany({ where: { active: true }, orderBy: { name: "asc" } });
  if (!produits.length) throw new Error("Aucun modèle en base : lancez d'abord npm run db:seed.");

  const passwordHash = await hashPassword(MOT_DE_PASSE);
  for (const l of LIVREURS) {
    await prisma.user.create({ data: { ...l, passwordHash, role: "LIVREUR" } });
  }

  const { day: aujourdhui, hour } = nowInParis();
  const restants = TIME_SLOTS.filter((s) => s.startHour > hour);
  const creneauxRestants = restants.length ? restants : TIME_SLOTS.slice(-1);
  let n = 0;
  let introuvables = 0;
  for (const [i, [line1, zip, city]] of ADRESSES.entries()) {
    const coords = await geocoder({ line1, zip, city });
    if (!coords) {
      introuvables++;
      console.warn(`⚠️  Adresse introuvable, créée quand même sans coordonnées : ${line1}, ${zip}`);
    }
    const jour = i % 2 === 0 ? aujourdhui : addDays(aujourdhui, 1);
    const reprise = i % 3 === 2;
    // Tous les créneaux, et aujourd'hui seulement ceux pas encore commencés :
    // un test lancé le soir ne doit pas produire que des arrêts impossibles.
    const possibles = jour === aujourdhui ? creneauxRestants : TIME_SLOTS;
    const creneau = possibles[Math.floor(i / 2) % possibles.length].id;
    const produit = produits[i % produits.length];
    n++;
    const num = String(n).padStart(3, "0");

    const client = await prisma.customer.create({
      data: {
        email: `client${num}${DOMAINE}`,
        firstName: PRENOMS[i % PRENOMS.length],
        lastName: NOMS[(i * 3) % NOMS.length],
        phone: `06 00 00 ${String(Math.floor(i / 10)).padStart(2, "0")} ${String(i % 100).padStart(2, "0")}`,
        addresses: {
          create: {
            line1, zip, city,
            floor: ETAGES[Math.floor(i / 2) % ETAGES.length],
            accessCode: i % 4 === 0 ? `${1000 + i * 37}B` : null,
            lat: coords?.lat ?? null,
            lng: coords?.lng ?? null,
          },
        },
      },
      include: { addresses: true },
    });
    const machine = await prisma.unit.create({
      data: { serialNumber: `TEST-${num}`, productId: produit.id, status: reprise ? "RENTED" : "AVAILABLE" },
    });
    // Livraison : réservation confirmée qui démarre ce jour-là, pour 5 jours.
    // Reprise : réservation livrée il y a 5 jours, qui se termine ce jour-là.
    const debut = reprise ? addDays(jour, -5) : jour;
    const fin = reprise ? jour : addDays(jour, 5);
    await prisma.booking.create({
      data: {
        reference: `TEST-${num}`,
        customerId: client.id,
        addressId: client.addresses[0].id,
        productId: produit.id,
        unitId: machine.id,
        startDate: new Date(debut),
        endDate: new Date(fin),
        status: reprise ? "DELIVERED" : "CONFIRMED",
        subtotal: 0,
        total: 0,
        deliveryFee: 0,
        // Pas de caution sur les données de test : aucun appel Stripe possible.
        depositAmount: 0,
        deliveries: {
          create: [
            { type: "DROPOFF", date: new Date(debut), timeSlot: reprise ? "9h-11h" : creneau, status: reprise ? "DONE" : "SCHEDULED" },
            { type: "PICKUP", date: new Date(fin), timeSlot: reprise ? creneau : "14h-16h" },
          ],
        },
      },
    });
  }
  console.log(`\n✅ ${n} interventions créées (aujourd'hui et demain), ${introuvables} adresse(s) introuvable(s).`);
  console.log("   Livreurs de test (mot de passe commun) :");
  for (const l of LIVREURS) console.log(`   • ${l.name.padEnd(14)} ${l.email}`);
  console.log(`   Mot de passe : ${MOT_DE_PASSE}\n`);
  console.log("   Admin : /admin/tournees → cocher les livreurs → « Calculer les tournées ».");
}

async function main() {
  await verifierQueCeNestPasLaProduction();
  await effacer();
  if (!process.argv.includes("--effacer")) await creer();
}

main()
  .catch((e) => {
    console.error(e.message ?? e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
