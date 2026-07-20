// Intégration Stripe : paiement de la location + caution par empreinte.
// Ce fichier appelle l'API Stripe et la base : pas de tests unitaires ici
// (comme le reste des fichiers qui touchent Prisma) — vérifié en bout en
// bout à l'implémentation avec les cartes de test Stripe.

import Stripe from "stripe";
import { prisma } from "./prisma.js";
import { depositDue } from "./transitions.js";
import { nowInParis, toDay } from "./dates.js";
import { sendBookingConfirmationEmail } from "./email.js";

// Lève une erreur explicite si la clé n'est pas configurée, plutôt que de
// planter plus loin avec un message Stripe générique.
export function getStripe() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    throw new Error("STRIPE_SECRET_KEY manquante : voir la section Paiement Stripe du README.");
  }
  return new Stripe(key);
}

// Renvoie l'id client Stripe du client, en le créant si besoin — nécessaire
// pour attacher la carte à la session Checkout et pouvoir débiter la caution
// plus tard sans redemander le numéro de carte.
export async function ensureStripeCustomer(customer) {
  if (customer.stripeCustomerId) return customer.stripeCustomerId;
  const stripe = getStripe();
  const created = await stripe.customers.create({
    email: customer.email,
    name: `${customer.firstName} ${customer.lastName}`,
    phone: customer.phone,
  });
  await prisma.customer.update({
    where: { id: customer.id },
    data: { stripeCustomerId: created.id },
  });
  return created.id;
}

// Crée la session de paiement Stripe Checkout pour une réservation fraîchement
// créée (status AWAITING_PAYMENT). `setup_future_usage: "off_session"` permet
// de réutiliser la carte plus tard pour poser la caution sans redemander le
// client — voir `placeDueDeposits`.
export async function createCheckoutSession(booking, product, stripeCustomerId, baseUrl) {
  const stripe = getStripe();
  return stripe.checkout.sessions.create({
    mode: "payment",
    locale: "fr",
    customer: stripeCustomerId,
    payment_intent_data: { setup_future_usage: "off_session" },
    line_items: [
      {
        price_data: {
          currency: "eur",
          unit_amount: booking.total,
          product_data: { name: `Location ${product.name} — ${booking.reference}` },
        },
        quantity: 1,
      },
    ],
    metadata: { bookingId: booking.id },
    expires_at: Math.floor(new Date(booking.checkoutExpiresAt).getTime() / 1000),
    success_url: `${baseUrl}/reserver/confirmation/${booking.reference}?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${baseUrl}/reserver/${product.slug}?annule=1&session_id={CHECKOUT_SESSION_ID}`,
  });
}

// Le client a cliqué "retour"/"annuler" sur la page Stripe. On n'écrit
// JAMAIS en base à partir d'un simple session_id fourni par l'URL — non
// authentifié, il pourrait en théorie fuiter et permettre à quelqu'un
// d'agir sur la réservation d'un autre client encore en train de payer.
// On se contente de renvoyer l'id de LA réservation concernée (après
// vérification côté Stripe) pour que l'appelant l'exclue de l'affichage du
// calendrier sur cette page — rien n'est modifié en base. La suppression
// réelle reste gérée par le webhook Stripe (authentifié par signature,
// non falsifiable) ou la tâche planifiée quotidienne.
export async function abandonedBookingId(sessionId) {
  const stripe = getStripe();
  const session = await stripe.checkout.sessions.retrieve(sessionId);
  const bookingId = session.metadata?.bookingId;
  if (!bookingId) return null;
  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    select: { status: true },
  });
  return booking?.status === "AWAITING_PAYMENT" ? bookingId : null;
}

// Finalise une session de paiement réussie : passe la réservation à PENDING
// (payée, en attente de votre confirmation), enregistre le moyen de
// paiement pour la caution, puis envoie l'email de confirmation (client +
// notification admin). Idempotente : appelée à la fois par le webhook et
// par la page de confirmation en filet — sans effet si déjà finalisée, donc
// l'email ne part qu'une seule fois par réservation.
export async function finalizeCheckoutSession(sessionId) {
  const stripe = getStripe();
  const session = await stripe.checkout.sessions.retrieve(sessionId, {
    expand: ["payment_intent"],
  });
  const bookingId = session.metadata?.bookingId;
  if (!bookingId || session.payment_status !== "paid") return null;

  const booking = await prisma.booking.findUnique({ where: { id: bookingId } });
  if (!booking || booking.status !== "AWAITING_PAYMENT") return booking;

  const paymentIntent = session.payment_intent;

  const updated = await prisma.booking.update({
    where: { id: bookingId },
    data: {
      status: "PENDING",
      checkoutExpiresAt: null,
      paymentId: paymentIntent.id,
      stripePaymentMethodId: paymentIntent.payment_method
        ? String(paymentIntent.payment_method)
        : null,
    },
    include: { product: true, customer: true, address: true, deliveries: true },
  });

  await sendBookingConfirmationEmail(updated);

  return updated;
}

// Tente de poser la caution d'UNE réservation si elle est due (livraison
// aujourd'hui ou demain), confirmée, et pas déjà traitée. Sans effet sinon
// (rien à faire) — renvoie "HELD", "FAILED", ou null. Fonction de base
// partagée par placeDueDeposits (balayage quotidien/manuel) et par
// confirmBooking (tentative immédiate à la confirmation, seul moment où une
// réservation devient éligible à la caution).
export async function placeDepositIfDue(bookingId) {
  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: { customer: true, deliveries: { where: { type: "DROPOFF" } } },
  });
  if (!booking || booking.status !== "CONFIRMED") return null;
  if (booking.depositAmount <= 0 || booking.depositStatus !== "NONE") return null;

  const dropoff = booking.deliveries[0];
  const today = nowInParis().day;
  if (!dropoff || !depositDue(toDay(dropoff.date), today)) return null;

  if (!booking.customer.stripeCustomerId || !booking.stripePaymentMethodId) {
    await prisma.booking.update({ where: { id: booking.id }, data: { depositStatus: "FAILED" } });
    return "FAILED";
  }

  const stripe = getStripe();
  try {
    const intent = await stripe.paymentIntents.create({
      amount: booking.depositAmount,
      currency: "eur",
      customer: booking.customer.stripeCustomerId,
      payment_method: booking.stripePaymentMethodId,
      capture_method: "manual",
      off_session: true,
      confirm: true,
      description: `Caution ${booking.reference}`,
    });
    await prisma.booking.update({
      where: { id: booking.id },
      data: { depositStatus: "HELD", depositId: intent.id },
    });
    return "HELD";
  } catch {
    await prisma.booking.update({ where: { id: booking.id }, data: { depositStatus: "FAILED" } });
    return "FAILED";
  }
}

// Balaie toutes les réservations confirmées en attente de caution et tente
// celles qui sont dues — utilisée par la tâche planifiée et le bouton manuel.
export async function placeDueDeposits() {
  const candidates = await prisma.booking.findMany({
    where: { status: "CONFIRMED", depositStatus: "NONE", depositAmount: { gt: 0 } },
    select: { id: true },
  });

  let held = 0;
  let failed = 0;
  for (const { id } of candidates) {
    const result = await placeDepositIfDue(id);
    if (result === "HELD") held += 1;
    if (result === "FAILED") failed += 1;
  }
  return { held, failed };
}

// Filet de sécurité quotidien : supprime les réservations "paiement en
// cours" dont la session Stripe a expiré, au cas où le webhook
// checkout.session.expired n'aurait pas pu prévenir la base (panne réseau,
// mauvaise configuration). Renvoie le nombre de lignes supprimées.
export async function cleanupExpiredCheckouts() {
  const { count } = await prisma.booking.deleteMany({
    where: { status: "AWAITING_PAYMENT", checkoutExpiresAt: { lt: new Date() } },
  });
  return count;
}

// Annule le blocage : le montant n'est jamais débité.
export async function releaseDepositStripe(booking) {
  const stripe = getStripe();
  await stripe.paymentIntents.cancel(booking.depositId);
}

// Débite le montant précis indiqué (dégât constaté), au maximum le montant
// bloqué.
export async function captureDepositStripe(booking, amountCents) {
  const stripe = getStripe();
  return stripe.paymentIntents.capture(booking.depositId, { amount_to_capture: amountCents });
}

// Remboursement intégral de la location payée.
export async function refundBookingStripe(booking) {
  const stripe = getStripe();
  await stripe.refunds.create({ payment_intent: booking.paymentId });
}
