"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { prisma } from "../../../lib/prisma";
import { validateBookingForm } from "../../../lib/validation";
import { capacity, fullDays, rangeError, minStartDay } from "../../../lib/availability";
import { quote } from "../../../lib/pricing";
import { nowInParis, addMonths, addDays, toDay } from "../../../lib/dates";
import { createCheckoutSession, ensureStripeCustomer } from "../../../lib/stripe";
import { kitAssignmentError, unitAssignmentError } from "../../../lib/transitions";
import { geocoderAdresseParId } from "../../../lib/tournees/planification";

// Nombre de tentatives en cas de conflit d'écriture strictement simultané
// (collision de référence P2002, conflit de sérialisation P2034).
const ATTEMPTS = 3;

// Durée de blocage des dates pendant le paiement Stripe — 32 min plutôt que
// 30 pour rester au-dessus du minimum imposé par Stripe (`expires_at` doit
// être à ≥ 30 min de l'instant de création de la session, qui a lieu
// quelques centaines de ms après la création de la réservation).
const CHECKOUT_WINDOW_MS = 32 * 60 * 1000;

// Erreur "métier" dont le message est affiché tel quel au client — par
// opposition aux erreurs techniques inattendues, qui doivent remonter.
class BookingError extends Error {
  constructor(message) {
    super(message);
    this.isUserError = true;
  }
}

// Crée une demande de réservation (statut AWAITING_PAYMENT, bloque déjà le
// calendrier) puis redirige vers le paiement Stripe. Appelée par le
// formulaire du tunnel via useFormState : (étatPrécédent, formData) → état.
export async function createBooking(prevState, formData) {
  const slug = String(formData.get("slug") ?? "");
  const now = nowInParis();

  const checked = validateBookingForm(Object.fromEntries(formData), now);
  if (checked.error) return { error: checked.error };
  const f = checked.data;
  const wantsKit = formData.get("wantsKit") === "on";

  const minDay = minStartDay(now);
  const maxDay = addMonths(now.day, 3);

  let created = null;
  for (let attempt = 0; attempt < ATTEMPTS && !created; attempt++) {
    try {
      created = await prisma.$transaction(
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
              where: {
                productId: product.id,
                // Défense en profondeur : une réservation "paiement en cours"
                // dont la session Stripe a expiré ne doit plus bloquer le
                // calendrier, même si le webhook d'expiration n'est pas
                // encore passé (ex. webhook mal configuré, panne réseau).
                NOT: { status: "AWAITING_PAYMENT", checkoutExpiresAt: { lt: new Date() } },
              },
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

          // Plafond anti-abus : pas plus de 3 demandes en attente OU en cours
          // de paiement par client.
          const pendingCount = await tx.booking.count({
            where: {
              customer: { email: f.email },
              OR: [
                { status: "PENDING" },
                { status: "AWAITING_PAYMENT", checkoutExpiresAt: { gte: new Date() } },
              ],
            },
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

          // Si le client a coché "kit de calfeutrage", on affecte
          // automatiquement le premier kit disponible et libre sur ces
          // dates — inclus, sans supplément. Vous pourrez le changer depuis
          // le back-office. Aucun kit libre : la réservation se fait quand
          // même, à affecter plus tard — wantsKit garde la trace du souhait
          // du client indépendamment du résultat de l'affectation.
          let kitId = null;
          if (wantsKit) {
            const kits = await tx.kit.findMany({
              where: { status: "AVAILABLE" },
              include: {
                bookings: { select: { id: true, startDate: true, endDate: true, status: true } },
              },
            });
            const kitBooking = { status: "PENDING", startDay: f.startDay, endDay: f.endDay };
            const eligible = kits.find((k) => {
              const others = k.bookings.map((x) => ({
                startDay: toDay(x.startDate),
                endDay: toDay(x.endDate),
                status: x.status,
              }));
              return kitAssignmentError(kitBooking, k, others) === null;
            });
            if (eligible) kitId = eligible.id;
          }

          // Même principe pour la machine : affectation automatique d'une
          // machine disponible du bon modèle et libre sur ces dates —
          // modifiable ensuite depuis le back-office. Aucune machine libre :
          // la réservation se fait quand même, à affecter plus tard.
          let unitId = null;
          const availableUnits = await tx.unit.findMany({
            where: { productId: product.id, status: "AVAILABLE" },
            include: {
              bookings: { select: { id: true, startDate: true, endDate: true, status: true } },
            },
          });
          const unitBooking = { status: "PENDING", productId: product.id, startDay: f.startDay, endDay: f.endDay };
          const eligibleUnit = availableUnits.find((u) => {
            const others = u.bookings.map((x) => ({
              startDay: toDay(x.startDate),
              endDay: toDay(x.endDate),
              status: x.status,
            }));
            return unitAssignmentError(unitBooking, u, others) === null;
          });
          if (eligibleUnit) unitId = eligibleUnit.id;

          const booking = await tx.booking.create({
            data: {
              reference: ref,
              customerId: customer.id,
              addressId: address.id,
              productId: product.id,
              startDate: new Date(f.startDay),
              endDate: new Date(f.endDay),
              status: "AWAITING_PAYMENT",
              checkoutExpiresAt: new Date(Date.now() + CHECKOUT_WINDOW_MS),
              subtotal: q.subtotal,
              discount: q.discount,
              deliveryFee: q.deliveryFee,
              floorFee: q.floorFee,
              total: q.total,
              depositAmount: product.depositAmount,
              unitId,
              kitId,
              wantsKit,
              deliveries: {
                create: [
                  { type: "DROPOFF", date: new Date(f.startDay), timeSlot: f.deliverySlot },
                  { type: "PICKUP", date: new Date(f.endDay), timeSlot: f.pickupSlot },
                ],
              },
            },
          });
          return { booking, customer, product };
        },
        // Sans effet sur SQLite (déjà sérialisé via BEGIN IMMEDIATE), mais
        // indispensable le jour du passage à PostgreSQL.
        { isolationLevel: "Serializable" }
      );
    } catch (e) {
      if (e.isUserError) return { error: e.message };
      // P2002 : collision de référence ; P2034 : conflit de sérialisation.
      if ((e.code === "P2002" || e.code === "P2034") && attempt < ATTEMPTS - 1) continue;
      throw e;
    }
  }

  const { booking, customer, product } = created;

  // Coordonnées GPS pour les tournées, sans ralentir le client : pas
  // d'await. Si ça échoue, le calcul des tournées réessaiera.
  geocoderAdresseParId(booking.addressId);

  let session;
  try {
    const host = headers().get("host");
    const protocol = host?.startsWith("localhost") ? "http" : "https";
    const baseUrl = `${protocol}://${host}`;
    const stripeCustomerId = await ensureStripeCustomer(customer);
    session = await createCheckoutSession(booking, product, stripeCustomerId, baseUrl);
  } catch {
    // Le paiement n'a pas pu démarrer : on libère les dates plutôt que de
    // laisser une réservation fantôme bloquer le calendrier.
    await prisma.booking.delete({ where: { id: booking.id } });
    return { error: "Le paiement n'a pas pu être initié. Réessayez dans un instant." };
  }

  redirect(session.url);
}
