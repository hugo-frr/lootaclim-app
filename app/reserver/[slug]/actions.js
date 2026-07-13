"use server";

import { redirect } from "next/navigation";
import { prisma } from "../../../lib/prisma";
import { validateBookingForm } from "../../../lib/validation";
import { capacity, fullDays, rangeError, minStartDay } from "../../../lib/availability";
import { quote } from "../../../lib/pricing";
import { nowInParis, addMonths, addDays, toDay } from "../../../lib/dates";

// Nombre de tentatives en cas de conflit d'écriture strictement simultané
// (collision de référence P2002, conflit de sérialisation P2034).
const ATTEMPTS = 3;

// Erreur "métier" dont le message est affiché tel quel au client — par
// opposition aux erreurs techniques inattendues, qui doivent remonter.
class BookingError extends Error {
  constructor(message) {
    super(message);
    this.isUserError = true;
  }
}

// Crée une demande de réservation (statut PENDING). Appelée par le
// formulaire du tunnel via useFormState : (étatPrécédent, formData) → état.
export async function createBooking(prevState, formData) {
  const slug = String(formData.get("slug") ?? "");
  const now = nowInParis();

  const checked = validateBookingForm(Object.fromEntries(formData), now);
  if (checked.error) return { error: checked.error };
  const f = checked.data;

  const minDay = minStartDay(now);
  const maxDay = addMonths(now.day, 3);

  let reference = null;
  for (let attempt = 0; attempt < ATTEMPTS && !reference; attempt++) {
    try {
      reference = await prisma.$transaction(
        async (tx) => {
          const product = await tx.product.findUnique({
            where: { slug },
            include: { units: true },
          });
          if (!product || !product.active) {
            throw new BookingError("Ce modèle n'est plus proposé à la location.");
          }

          // Re-vérification de la disponibilité DANS la transaction :
          // protège contre deux clients réservant la dernière machine en même temps.
          const cap = capacity(product.units);
          const bookings = (
            await tx.booking.findMany({
              where: { productId: product.id },
              select: { startDate: true, endDate: true, status: true },
            })
          ).map((b) => ({
            startDay: toDay(b.startDate),
            endDay: toDay(b.endDate),
            status: b.status,
          }));
          const full = fullDays(bookings, cap, now.day, addDays(maxDay, 1));
          const unavailable =
            cap === 0
              ? "Ce modèle n'est plus réservable actuellement."
              : rangeError(f.startDay, f.endDay, full, minDay, maxDay);
          if (unavailable) throw new BookingError(unavailable);

          // Plafond anti-abus : pas plus de 3 demandes en attente par client.
          const pendingCount = await tx.booking.count({
            where: { customer: { email: f.email }, status: "PENDING" },
          });
          if (pendingCount >= 3) {
            throw new BookingError(
              "Vous avez déjà 3 demandes en attente. Attendez leur confirmation ou contactez-nous."
            );
          }

          // Les montants sont TOUJOURS recalculés côté serveur
          const q = quote(product.dailyPrice, f.startDay, f.endDay);

          const customer = await tx.customer.upsert({
            where: { email: f.email },
            update: { firstName: f.firstName, lastName: f.lastName, phone: f.phone },
            create: {
              email: f.email,
              firstName: f.firstName,
              lastName: f.lastName,
              phone: f.phone,
            },
          });
          const address = await tx.address.create({
            data: {
              line1: f.line1,
              zip: f.zip,
              city: f.city,
              floor: f.floor,
              accessCode: f.accessCode || null,
              customerId: customer.id,
            },
          });

          // Référence dérivée du max existant de l'année (un comptage se
          // désynchroniserait définitivement si une ligne était supprimée).
          const year = now.day.slice(0, 4);
          const last = await tx.booking.findFirst({
            where: { reference: { startsWith: `LC-${year}-` } },
            orderBy: { reference: "desc" },
            select: { reference: true },
          });
          const next = last ? Number(last.reference.split("-").pop()) + 1 : 1;
          const ref = `LC-${year}-${String(next).padStart(4, "0")}`;

          await tx.booking.create({
            data: {
              reference: ref,
              customerId: customer.id,
              addressId: address.id,
              productId: product.id,
              startDate: new Date(f.startDay),
              endDate: new Date(f.endDay),
              status: "PENDING",
              subtotal: q.subtotal,
              discount: q.discount,
              deliveryFee: q.deliveryFee,
              floorFee: q.floorFee,
              total: q.total,
              deliveries: {
                create: [
                  { type: "DROPOFF", date: new Date(f.startDay), timeSlot: f.deliverySlot },
                  { type: "PICKUP", date: new Date(f.endDay), timeSlot: f.pickupSlot },
                ],
              },
            },
          });
          return ref;
        },
        // Sans effet sur SQLite (déjà sérialisé via BEGIN IMMEDIATE), mais
        // indispensable le jour du passage à PostgreSQL : sans ce niveau
        // d'isolation, deux transactions pourraient lire la disponibilité
        // en même temps et surréserver.
        { isolationLevel: "Serializable" }
      );
    } catch (e) {
      if (e.isUserError) return { error: e.message };
      // P2002 : collision de référence ; P2034 : conflit de sérialisation.
      // On retente — la re-vérification de disponibilité refera foi.
      if ((e.code === "P2002" || e.code === "P2034") && attempt < ATTEMPTS - 1) continue;
      throw e;
    }
  }

  redirect(`/reserver/confirmation/${reference}`);
}
