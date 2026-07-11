"use server";

import { redirect } from "next/navigation";
import { prisma } from "../../../lib/prisma";
import { validateBookingForm } from "../../../lib/validation";
import { capacity, fullDays, rangeError, minStartDay } from "../../../lib/availability";
import { quote } from "../../../lib/pricing";
import { nowInParis, addMonths, addDays, toDay } from "../../../lib/dates";

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
  // 3 tentatives : en cas de collision de référence entre deux demandes
  // strictement simultanées (contrainte d'unicité), on réessaie.
  for (let attempt = 0; attempt < 3 && !reference; attempt++) {
    try {
      reference = await prisma.$transaction(async (tx) => {
        const product = await tx.product.findUnique({
          where: { slug },
          include: { units: true },
        });
        if (!product || !product.active) throw new Error("UNAVAILABLE");

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
        if (cap === 0 || rangeError(f.startDay, f.endDay, full, minDay, maxDay)) {
          throw new Error("UNAVAILABLE");
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

        const year = now.day.slice(0, 4);
        const countThisYear = await tx.booking.count({
          where: { reference: { startsWith: `LC-${year}-` } },
        });
        const ref = `LC-${year}-${String(countThisYear + 1).padStart(4, "0")}`;

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
      });
    } catch (e) {
      if (e.message === "UNAVAILABLE") {
        return {
          error:
            "Ces dates viennent d'être réservées par un autre client. Merci de choisir d'autres dates.",
        };
      }
      if (e.code === "P2002" && attempt < 2) continue; // référence prise → nouvel essai
      throw e;
    }
  }

  redirect(`/reserver/confirmation/${reference}`);
}
