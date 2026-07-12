import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "../../../../lib/prisma";
import { euros, FLOOR_LABELS } from "../../../../lib/constants";

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

export default async function Confirmation({ params }) {
  const booking = await prisma.booking.findUnique({
    where: { reference: params.reference },
    include: { product: true, customer: true, address: true, deliveries: true },
  });
  if (!booking) notFound();

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
          Votre demande de réservation est enregistrée et les dates sont bloquées
          pour vous. Nous la confirmons rapidement par téléphone ou par email.
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
          <span>Total</span>
          <span>{euros(booking.total)}</span>
        </div>
      </div>

      <p style={{ textAlign: "center", marginTop: 22 }}>
        <Link href="/catalogue" className="btn btn-primary">
          Retour au catalogue
        </Link>
      </p>
    </div>
  );
}
