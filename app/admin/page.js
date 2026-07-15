import { prisma } from "../../lib/prisma";
import {
  euros,
  BOOKING_STATUS,
  UNIT_STATUS,
  DELIVERY_STATUS,
  DEPOSIT_STATUS,
} from "../../lib/constants";
import { toDay } from "../../lib/dates";
import { unitAssignmentError } from "../../lib/transitions";
import AdminHeader from "./AdminHeader";
import ConfirmSubmit from "./ConfirmSubmit";
import {
  confirmBooking,
  cancelBooking,
  assignUnit,
  markDelivery,
  saveUnit,
  checkDepositsNow,
  releaseDeposit,
  captureDeposit,
} from "./actions";

export const dynamic = "force-dynamic";

const dateFr = (d) =>
  new Date(d).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", timeZone: "UTC" });

// Machines proposables pour une réservation : celles dont l'affectation
// serait acceptée par les règles (bon modèle, en état, dates libres).
function eligibleUnits(booking, units) {
  const b = {
    status: booking.status,
    productId: booking.productId,
    startDay: toDay(booking.startDate),
    endDay: toDay(booking.endDate),
  };
  return units.filter((u) => {
    const others = u.bookings
      .filter((x) => x.id !== booking.id)
      .map((x) => ({ startDay: toDay(x.startDate), endDay: toDay(x.endDate), status: x.status }));
    return unitAssignmentError(b, u, others) === null;
  });
}

const MANUAL_STATUSES = ["AVAILABLE", "MAINTENANCE", "RETIRED"];

export default async function Admin({ searchParams }) {
  const [bookings, units, deliveries, customerCount] = await Promise.all([
    prisma.booking.findMany({
      include: { customer: true, product: true, unit: { include: { product: true } } },
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
    prisma.unit.findMany({
      include: {
        product: true,
        bookings: { select: { id: true, startDate: true, endDate: true, status: true } },
      },
      orderBy: { serialNumber: "asc" },
    }),
    prisma.delivery.findMany({
      where: { status: "SCHEDULED" },
      include: { booking: { include: { customer: true, address: true } } },
      orderBy: { date: "asc" },
      take: 10,
    }),
    prisma.customer.count(),
  ]);

  const caConfirme = bookings
    .filter((b) => !["CANCELLED", "AWAITING_PAYMENT"].includes(b.status))
    .reduce((s, b) => s + b.total, 0);
  const dispo = units.filter((u) => u.status === "AVAILABLE").length;

  return (
    <div className="stack">
      <AdminHeader />
      {searchParams.erreur && (
        <p className="form-error" role="alert">{searchParams.erreur}</p>
      )}
      <div>
        <span className="eyebrow">Back-office</span>
        <h1 className="section-title">Tableau de bord</h1>
        <div className="kpis">
          <div className="card kpi">
            <div className="num">{euros(caConfirme)}</div>
            <div className="lbl">CA confirmé (20 dern. résa)</div>
          </div>
          <div className="card kpi">
            <div className="num">{dispo}/{units.length}</div>
            <div className="lbl">Machines disponibles</div>
          </div>
          <div className="card kpi">
            <div className="num">{deliveries.length}</div>
            <div className="lbl">Livraisons planifiées</div>
          </div>
          <div className="card kpi">
            <div className="num">{customerCount}</div>
            <div className="lbl">Clients</div>
          </div>
        </div>
      </div>

      <div className="card">
        <h2 style={{ marginBottom: 16 }}>Réservations récentes</h2>
        <form action={checkDepositsNow} style={{ marginBottom: 14 }}>
          <button type="submit" className="btn-small">
            Vérifier les cautions à poser aujourd&apos;hui
          </button>
        </form>
        <table>
          <thead>
            <tr>
              <th>Réf.</th><th>Client</th><th>Machine</th><th>Du</th><th>Au</th><th>Total</th><th>Statut</th><th>Caution</th><th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {bookings.map((b) => (
              <tr key={b.id}>
                <td>{b.reference}</td>
                <td>{b.customer.firstName} {b.customer.lastName}</td>
                <td>{b.unit ? `${b.unit.product.name} · ${b.unit.serialNumber}` : `${b.product.name} · — à affecter —`}</td>
                <td>{dateFr(b.startDate)}</td>
                <td>{dateFr(b.endDate)}</td>
                <td>{euros(b.total)}</td>
                <td><span className={`pill ${b.status}`}>{BOOKING_STATUS[b.status]}</span></td>
                <td>
                  {b.depositAmount > 0 ? (
                    <span className={`pill deposit-${b.depositStatus}`}>
                      {DEPOSIT_STATUS[b.depositStatus]}
                    </span>
                  ) : (
                    <span className="muted">—</span>
                  )}
                </td>
                <td>
                  <div className="actions-cell">
                    {b.status === "PENDING" && (
                      <form action={confirmBooking}>
                        <input type="hidden" name="id" value={b.id} />
                        <button type="submit" className="btn-small">Confirmer</button>
                      </form>
                    )}
                    {["PENDING", "CONFIRMED"].includes(b.status) && !b.unitId && (
                      <form action={assignUnit}>
                        <input type="hidden" name="bookingId" value={b.id} />
                        <select name="unitId" required defaultValue="">
                          <option value="" disabled>Machine…</option>
                          {eligibleUnits(b, units).map((u) => (
                            <option key={u.id} value={u.id}>{u.serialNumber}</option>
                          ))}
                        </select>
                        <button type="submit" className="btn-small">Affecter</button>
                      </form>
                    )}
                    {["PENDING", "CONFIRMED"].includes(b.status) && (
                      <form action={cancelBooking}>
                        <input type="hidden" name="id" value={b.id} />
                        <ConfirmSubmit
                          className="btn-small btn-danger"
                          message={`Annuler la réservation ${b.reference} ?`}
                        >
                          Annuler
                        </ConfirmSubmit>
                      </form>
                    )}
                    {b.status === "RETURNED" && b.depositStatus === "HELD" && (
                      <>
                        <form action={releaseDeposit}>
                          <input type="hidden" name="id" value={b.id} />
                          <button type="submit" className="btn-small">Libérer caution</button>
                        </form>
                        <form action={captureDeposit} className="actions-cell">
                          <input type="hidden" name="id" value={b.id} />
                          <input
                            name="montantEuros"
                            placeholder="Montant €"
                            inputMode="decimal"
                            style={{ width: 90 }}
                            required
                          />
                          <ConfirmSubmit
                            className="btn-small btn-danger"
                            message={`Encaisser la caution de ${b.reference} ?`}
                          >
                            Encaisser
                          </ConfirmSubmit>
                        </form>
                      </>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card">
        <h2 style={{ marginBottom: 16 }}>Prochaines livraisons & reprises</h2>
        <table>
          <thead>
            <tr><th>Date</th><th>Créneau</th><th>Type</th><th>Client</th><th>Adresse</th><th>Statut</th><th>Actions</th></tr>
          </thead>
          <tbody>
            {deliveries.map((d) => (
              <tr key={d.id}>
                <td>{dateFr(d.date)}</td>
                <td>{d.timeSlot}</td>
                <td>{d.type === "DROPOFF" ? "🚚 Livraison" : "↩️ Reprise"}</td>
                <td>{d.booking.customer.firstName} {d.booking.customer.lastName}</td>
                <td>{d.booking.address.line1}, {d.booking.address.zip} {d.booking.address.city}</td>
                <td><span className={`pill ${d.status}`}>{DELIVERY_STATUS[d.status]}</span></td>
                <td>
                  <div className="actions-cell">
                    <form action={markDelivery}>
                      <input type="hidden" name="id" value={d.id} />
                      <input type="hidden" name="resultat" value="DONE" />
                      <button type="submit" className="btn-small">Effectuée</button>
                    </form>
                    <form action={markDelivery}>
                      <input type="hidden" name="id" value={d.id} />
                      <input type="hidden" name="resultat" value="FAILED" />
                      <ConfirmSubmit className="btn-small btn-danger" message="Marquer cette intervention en échec ?">
                        Échec
                      </ConfirmSubmit>
                    </form>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card">
        <h2 style={{ marginBottom: 16 }}>Parc machines</h2>
        <table>
          <thead>
            <tr><th>N° série</th><th>Modèle</th><th>Statut</th><th>Gestion</th></tr>
          </thead>
          <tbody>
            {units.map((u) => (
              <tr key={u.id}>
                <td>{u.serialNumber}</td>
                <td>{u.product.name}</td>
                <td><span className={`pill ${u.status}`}>{UNIT_STATUS[u.status]}</span></td>
                <td>
                  {MANUAL_STATUSES.includes(u.status) ? (
                    <form action={saveUnit} className="actions-cell">
                      <input type="hidden" name="id" value={u.id} />
                      <select name="statut" defaultValue={u.status}>
                        {MANUAL_STATUSES.map((s) => (
                          <option key={s} value={s}>{UNIT_STATUS[s]}</option>
                        ))}
                      </select>
                      <input name="notes" defaultValue={u.notes ?? ""} placeholder="Notes…" maxLength={500} />
                      <button type="submit" className="btn-small">Enregistrer</button>
                    </form>
                  ) : (
                    <span className="muted">piloté par les livraisons (reprise à marquer)</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
