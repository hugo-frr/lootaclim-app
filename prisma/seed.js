// Remplit la base avec des données de départ : vos 3 modèles, un stock
// d'exemple, un client et une réservation de démonstration.
// Lancer avec : npm run db:seed

import { PrismaClient } from "@prisma/client";
import { addDays, nowInParis } from "../lib/dates.js";

const prisma = new PrismaClient();

async function main() {
  // Nettoyage (ordre important à cause des relations)
  await prisma.delivery.deleteMany();
  await prisma.booking.deleteMany();
  await prisma.address.deleteMany();
  await prisma.customer.deleteMany();
  await prisma.unit.deleteMany();
  await prisma.productImage.deleteMany();
  await prisma.product.deleteMany();

  // ---- Les 3 modèles ----
  const seine = await prisma.product.create({
    data: {
      slug: "seine",
      name: "SEINE",
      description:
        "Le compact silencieux. Idéal pour les studios et les chambres jusqu'à 20 m². À 42 dB, il murmure pendant que vous dormez.",
      powerKw: 2.0,
      noiseDb: 42,
      maxAreaM2: 20,
      dailyPrice: 1200,
      depositAmount: 10000, // 100 €
      images: {
        create: [{ url: "/images/seine-1.jpg", alt: "Climatiseur SEINE vue de face", position: 0 }],
      },
    },
  });

  const rivoli = await prisma.product.create({
    data: {
      slug: "rivoli",
      name: "RIVOLI",
      description:
        "Le polyvalent. Salons et pièces de vie jusqu'à 35 m². 2,9 kW pour passer de 32 °C à 22 °C le temps d'un spritz.",
      powerKw: 2.9,
      noiseDb: 46,
      maxAreaM2: 35,
      dailyPrice: 1800,
      depositAmount: 15000, // 150 €
      images: {
        create: [{ url: "/images/rivoli-1.jpg", alt: "Climatiseur RIVOLI vue de face", position: 0 }],
      },
    },
  });

  const trocadero = await prisma.product.create({
    data: {
      slug: "trocadero",
      name: "TROCADÉRO",
      description:
        "Le puissant. Grands espaces, bureaux et boutiques jusqu'à 55 m². 3,5 kW de fraîcheur, mode déshumidification inclus.",
      powerKw: 3.5,
      noiseDb: 50,
      maxAreaM2: 55,
      dailyPrice: 2600,
      depositAmount: 25000, // 250 €
      images: {
        create: [{ url: "/images/trocadero-1.jpg", alt: "Climatiseur TROCADÉRO vue de face", position: 0 }],
      },
    },
  });

  // ---- Le stock : chaque machine physique = une unité ----
  const units = [];
  const mk = (productId, prefix, n) =>
    Array.from({ length: n }, (_, i) => ({
      serialNumber: `${prefix}-${String(i + 1).padStart(3, "0")}`,
      productId,
    }));
  units.push(...mk(seine.id, "SEI", 3)); // 3 SEINE
  units.push(...mk(rivoli.id, "RIV", 3)); // 3 RIVOLI
  units.push(...mk(trocadero.id, "TRO", 2)); // 2 TROCADÉRO
  await prisma.unit.createMany({ data: units });

  // ---- Client + réservation de démonstration ----
  const client = await prisma.customer.create({
    data: {
      email: "camille.demo@example.com",
      firstName: "Camille",
      lastName: "Dupont",
      phone: "06 12 34 56 78",
      internalNotes: "Cliente de démonstration — code immeuble 4823A",
      addresses: {
        create: {
          line1: "12 rue de la Fraîcheur",
          zip: "75011",
          city: "Paris",
          floor: "asc",
        },
      },
    },
    include: { addresses: true },
  });

  const firstUnit = await prisma.unit.findFirst({ where: { productId: rivoli.id } });
  const today = nowInParis().day;
  const startDay = addDays(today, 2);
  const endDay = addDays(startDay, 6); // 7 jours inclusifs

  const subtotal = 1800 * 7;
  const discount = Math.round(subtotal * 0.15); // -15 % dès 7 jours

  await prisma.booking.create({
    data: {
      reference: `LC-${today.slice(0, 4)}-0001`,
      customerId: client.id,
      addressId: client.addresses[0].id,
      productId: rivoli.id,
      unitId: firstUnit.id,
      startDate: new Date(startDay),
      endDate: new Date(endDay),
      status: "CONFIRMED",
      subtotal,
      discount,
      deliveryFee: 2900,
      floorFee: 0,
      total: subtotal - discount + 2900,
      deliveries: {
        create: [
          { type: "DROPOFF", date: new Date(startDay), timeSlot: "9h-11h" },
          { type: "PICKUP", date: new Date(endDay), timeSlot: "14h-16h" },
        ],
      },
    },
  });

  console.log("✅ Base remplie : 3 modèles, 8 unités, 1 client, 1 réservation (LC-…-0001)");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
