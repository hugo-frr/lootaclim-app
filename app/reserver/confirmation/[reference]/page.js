import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "../../../../lib/prisma";
import { euros, FLOOR_LABELS } from "../../../../lib/constants";
import { finalizeCheckoutSession } from "../../../../lib/stripe";

export const dynamic = "force-dynamic";

// Les dates sont stockées à minuit UTC : on formate en UTC pour ne pas
// glisser d'un jour.
const dateFr = (d) =>
  new Date(d).toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  });

export default async function Confirmation({ params, searchParams }) {
  let booking = await prisma.booking.findUnique({
    where: { reference: params.reference },
    include: { product: true, customer: true, address: true, deliveries: true },
  });
  if (!booking) notFound();

  // Filet de sécurité : dans l'immense majorité des cas le webhook Stripe a
  // déjà finalisé le paiement avant que le client n'atterrisse ici. S'il n'a
  // pas encore eu le temps, on vérifie directement auprès de Stripe (appel
  // idempotent, sans effet si déjà finalisé par le webhook).
  if (booking.status === "AWAITING_PAYMENT" && searchParams.session_id) {
    try {
      const updated = await finalizeCheckoutSession(String(searchParams.session_id));
      if (updated) booking = { ...booking, ...updated };
    } catch {
      // Erreur transitoire côté Stripe : le webhook finalisera en arrière-plan ;
      // on retombe simplement sur le message "en cours" ci-dessous.
    }
  }

  if (booking.status === "AWAITING_PAYMENT") {
    return (
      <div className="card" style={{ maxWidth: 640, margin: "0 auto", textAlign: "center" }}>
        <span className="eyebrow">Paiement en cours de confirmation…</span>
        <p style={{ marginTop: 12, fontSize: 14.5, lineHeight: 1.7, color: "#5c7d94" }}>
          Nous finalisons votre paiement. Si cette page ne se met pas à jour,
          rechargez-la dans quelques secondes.
        </p>
      </div>
    );
  }

  const dropoff = booking.deliveries.find((d) => d.type === "DROPOFF");
  const pickup = booking.deliveries.find((d) => d.type === "PICKUP");

  return (
    <div style={{ maxWidth: 640, margin: "0 auto" }}>
      <div className="card" style={{ textAlign: "center" }}>
        <span className="eyebrow">Demande enregistrée ✓</span>
        <h1 className="section-title" style={{ fontSize: 28 }}>
          Merci {booking.customer.firstName} !
        </h1>
        <p className="confirm-ref">{booking.reference}</p>
        <p style={{ margin: "16px 0 4px", fontSize: 14.5, lineHeight: 1.7, color: "#5c7d94" }}>
          Votre paiement est confirmé et les dates sont bloquées pour vous.
          Nous confirmons votre demande rapidement par téléphone ou par email.
        </p>
      </div>

      <div className="card" style={{ marginTop: 18 }}>
        <div className="recap-line">
          <span>Modèle</span>
          <strong>{booking.product.name}</strong>
        </div>
        <div className="recap-line">
          <span>Livraison</span>
          <span>{dateFr(booking.startDate)} · {dropoff?.timeSlot}</span>
        </div>
        <div className="recap-line">
          <span>Reprise</span>
          <span>{dateFr(booking.endDate)} · {pickup?.timeSlot}</span>
        </div>
        <div className="recap-line">
          <span>Adresse</span>
          <span>
            {booking.address.line1}, {booking.address.zip} {booking.address.city}{" "}
            ({FLOOR_LABELS[booking.address.floor]})
          </span>
        </div>
        <div className="recap-line">
          <span>Location</span>
          <span>{euros(booking.subtotal)}</span>
        </div>
        {booking.discount > 0 && (
          <div className="recap-line">
            <span>Remise longue durée</span>
            <span className="neg">−{euros(booking.discount)}</span>
          </div>
        )}
        <div className="recap-line">
          <span>Livraison & reprise</span>
          <span>{euros(booking.deliveryFee)}</span>
        </div>
        <div className="recap-line total">
          <span>Total payé</span>
          <span>{euros(booking.total)}</span>
        </div>
        {booking.depositAmount > 0 && (
          <p style={{ marginTop: 10, fontSize: 12.5, color: "#5c7d94" }}>
            Une caution de {euros(booking.depositAmount)} sera bloquée sur votre
            carte juste avant la livraison (non débitée sauf dégât constaté).
          </p>
        )}
      </div>

      <p style={{ textAlign: "center", marginTop: 22 }}>
        <Link href="/catalogue" className="btn btn-primary">
          Retour au catalogue
        </Link>
      </p>
    </div>
  );
}
