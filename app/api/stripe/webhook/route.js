import { NextResponse } from "next/server";
import { prisma } from "../../../../lib/prisma";
import { getStripe, finalizeCheckoutSession } from "../../../../lib/stripe";

// Stripe appelle cette route en coulisses dès qu'un paiement réussit ou
// qu'une session expire — indépendamment du navigateur du client, donc même
// s'il ferme l'onglet avant de revenir sur le site.
export async function POST(request) {
  const signature = request.headers.get("stripe-signature");
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!signature || !secret) {
    return NextResponse.json({ error: "Webhook non configuré." }, { status: 400 });
  }

  const body = await request.text();
  let event;
  try {
    event = getStripe().webhooks.constructEvent(body, signature, secret);
  } catch {
    return NextResponse.json({ error: "Signature invalide." }, { status: 400 });
  }

  if (event.type === "checkout.session.completed") {
    await finalizeCheckoutSession(event.data.object.id);
  }

  if (event.type === "checkout.session.expired") {
    const bookingId = event.data.object.metadata?.bookingId;
    if (bookingId) {
      const booking = await prisma.booking.findUnique({ where: { id: bookingId } });
      if (booking?.status === "AWAITING_PAYMENT") {
        await prisma.booking.delete({ where: { id: bookingId } });
      }
    }
  }

  return NextResponse.json({ received: true });
}
