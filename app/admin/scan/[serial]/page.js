import { requireUser } from "../../auth";
import Link from "next/link";
import { prisma } from "../../../../lib/prisma";
import { UNIT_STATUS, BOOKING_STATUS } from "../../../../lib/constants";
import { nextAction } from "../../../../lib/scan";
import { assignUnit, markDelivery, saveUnit } from "../../actions";
import AdminHeader from "../../AdminHeader";

export const dynamic = "force-dynamic";

export const metadata = { title: "Machine — LOOTACLIM" };

// Statuts pour lesquels une réservation « occupe » encore la machine.
const EN_COURS = ["PENDING", "CONFIRMED", "DELIVERED"];

function jour(d) {
  return d.toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" });
}

export default async function ScanPage({ params, searchParams }) {
  // Le middleware ne vérifie que la signature du jeton : il tourne dans le
  // runtime edge, sans accès à la base. C'est ici qu'on refuse un compte
  // désactivé ou supprimé, sans attendre l'expiration de sa session.
  await requireUser();

  const serial = decodeURIComponent(params.serial ?? "").trim();

  const unit = await prisma.unit.findFirst({
    where: { serialNumber: { equals: serial, mode: "insensitive" } },
    include: {
      product: true,
      events: { orderBy: { createdAt: "desc" }, take: 10 },
    },
  });

  if (!unit) {
    return (
      <div className="stack">
        <AdminHeader />
        <div className="card scan-carte">
          <span className="eyebrow">Machine inconnue</span>
          <h1 className="scan-titre">{serial || "Aucun numéro"}</h1>
          <p className="muted">
            Aucune machine ne porte ce numéro de série. Vérifiez l&apos;étiquette,
            ou ajoutez la machine depuis le tableau de bord.
          </p>
          <Link href="/admin" className="btn btn-primary">Tableau de bord</Link>
        </div>
      </div>
    );
  }

  // La réservation qui occupe la machine, et sa prochaine intervention.
  const booking = await prisma.booking.findFirst({
    where: { unitId: unit.id, status: { in: EN_COURS } },
    include: {
      customer: true,
      address: true,
      deliveries: { where: { status: "SCHEDULED" }, orderBy: { date: "asc" }, take: 1 },
    },
    orderBy: { startDate: "asc" },
  });
  const delivery = booking?.deliveries?.[0] ?? null;

  // Sinon, une réservation du même modèle attend peut-être une machine.
  const candidate = booking
    ? null
    : await prisma.booking.findFirst({
        where: {
          productId: unit.productId,
          unitId: null,
          status: { in: ["PENDING", "CONFIRMED"] },
        },
        orderBy: { startDate: "asc" },
      });

  const action = nextAction({ unit, booking, delivery, candidate });
  const retour = `/admin/scan/${encodeURIComponent(unit.serialNumber)}`;

  return (
    <div className="stack">
      <AdminHeader />

      {searchParams?.erreur && (
        <p className="form-error" role="alert">{searchParams.erreur}</p>
      )}

      <div className="card scan-carte">
        <span className="eyebrow">{unit.product.name}</span>
        <h1 className="scan-titre">{unit.serialNumber}</h1>
        <p>
          <span className={`pill ${unit.status}`}>{UNIT_STATUS[unit.status] ?? unit.status}</span>
        </p>

        {booking ? (
          <div className="scan-resa">
            <div className="scan-ligne">
              <span>Réservation</span>
              <strong>{booking.reference}</strong>
            </div>
            <div className="scan-ligne">
              <span>État</span>
              <strong>{BOOKING_STATUS[booking.status] ?? booking.status}</strong>
            </div>
            <div className="scan-ligne">
              <span>Client</span>
              <strong>
                {booking.customer.firstName} {booking.customer.lastName}
              </strong>
            </div>
            <div className="scan-ligne">
              <span>Téléphone</span>
              <a href={`tel:${booking.customer.phone}`}>{booking.customer.phone}</a>
            </div>
            <div className="scan-ligne">
              <span>Adresse</span>
              <strong>
                {booking.address.line1}, {booking.address.zip} {booking.address.city}
              </strong>
            </div>
            <div className="scan-ligne">
              <span>Dates</span>
              <strong>
                {jour(booking.startDate)} → {jour(booking.endDate)}
              </strong>
            </div>
            {delivery && (
              <div className="scan-ligne">
                <span>{delivery.type === "PICKUP" ? "Reprise" : "Livraison"}</span>
                <strong>
                  {jour(delivery.date)}
                  {delivery.timeSlot ? ` · ${delivery.timeSlot}` : ""}
                </strong>
              </div>
            )}
          </div>
        ) : (
          <p className="muted">Aucune réservation en cours sur cette machine.</p>
        )}

        {/* Une seule action, celle qui a du sens à cet instant. */}
        {action && (
          <div className="scan-action">
            {action.blocked ? (
              <>
                <button type="button" className="btn btn-primary" disabled>
                  {action.label}
                </button>
                <p className="scan-bloque">{action.blocked}</p>
              </>
            ) : action.id === "assign" ? (
              <form action={assignUnit}>
                <input type="hidden" name="bookingId" value={candidate.id} />
                <input type="hidden" name="unitId" value={unit.id} />
                <input type="hidden" name="retour" value={retour} />
                <button type="submit" className="btn btn-primary">{action.label}</button>
              </form>
            ) : action.id === "service" ? (
              <form action={saveUnit}>
                <input type="hidden" name="id" value={unit.id} />
                <input type="hidden" name="statut" value="AVAILABLE" />
                <input type="hidden" name="notes" value={unit.notes ?? ""} />
                <input type="hidden" name="retour" value={retour} />
                <button type="submit" className="btn btn-primary">{action.label}</button>
              </form>
            ) : (
              <form action={markDelivery}>
                <input type="hidden" name="id" value={delivery.id} />
                <input type="hidden" name="resultat" value="DONE" />
                <input type="hidden" name="retour" value={retour} />
                <button type="submit" className="btn btn-primary">{action.label}</button>
              </form>
            )}
          </div>
        )}

        {!action && <p className="muted">Rien à faire sur cette machine pour l&apos;instant.</p>}
      </div>

      <div className="card">
        <strong className="survey-resultat-titre">État et note</strong>
        <form action={saveUnit} className="scan-note">
          <input type="hidden" name="id" value={unit.id} />
          <input type="hidden" name="retour" value={retour} />
          <div className="field">
            <label htmlFor="statut">Statut</label>
            <select id="statut" name="statut" defaultValue={unit.status}>
              <option value="AVAILABLE">Disponible</option>
              <option value="MAINTENANCE">En maintenance</option>
              <option value="RETIRED">Retirée du parc</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="notes">Note (rayure, panne, remarque…)</label>
            <textarea id="notes" name="notes" rows={2} defaultValue={unit.notes ?? ""} />
          </div>
          <button type="submit" className="btn-small">Enregistrer</button>
        </form>
      </div>

      <div className="card">
        <strong className="survey-resultat-titre">Historique</strong>
        {unit.events.length === 0 ? (
          <p className="muted">Aucun événement enregistré.</p>
        ) : (
          <ul className="scan-historique">
            {unit.events.map((e) => (
              <li key={e.id}>
                <time>
                  {e.createdAt.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" })}{" "}
                  {e.createdAt.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
                </time>
                <span>{e.detail ?? e.type}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
