import { prisma } from "../../lib/prisma";
import {
  euros,
  BOOKING_STATUS,
  UNIT_STATUS,
  DELIVERY_STATUS,
} from "../../lib/constants";

export const dynamic = "force-dynamic";

const dateFr = (d) =>
  new Date(d).toLocaleDateString("fr-FR", { day: "2-digit", month: "short" });

export default async function Admin() {
  const [bookings, units, deliveries, customerCount] = await Promise.all([
    prisma.booking.findMany({
      include: { customer: true, product: true, unit: { include: { product: true } } },
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
    prisma.unit.findMany({
      include: { product: true },
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
    .filter((b) => !["CANCELLED", "PENDING"].includes(b.status))
    .reduce((s, b) => s + b.total, 0);
  const dispo = units.filter((u) => u.status === "AVAILABLE").length;

  return (
    <div className="stack">
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
        <table>
          <thead>
            <tr>
              <th>Réf.</th><th>Client</th><th>Machine</th><th>Du</th><th>Au</th><th>Total</th><th>Statut</th>
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
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card">
        <h2 style={{ marginBottom: 16 }}>Prochaines livraisons & reprises</h2>
        <table>
          <thead>
            <tr><th>Date</th><th>Créneau</th><th>Type</th><th>Client</th><th>Adresse</th><th>Statut</th></tr>
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
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card">
        <h2 style={{ marginBottom: 16 }}>Parc machines</h2>
        <table>
          <thead>
            <tr><th>N° série</th><th>Modèle</th><th>Statut</th><th>Notes</th></tr>
          </thead>
          <tbody>
            {units.map((u) => (
              <tr key={u.id}>
                <td>{u.serialNumber}</td>
                <td>{u.product.name}</td>
                <td><span className={`pill ${u.status}`}>{UNIT_STATUS[u.status]}</span></td>
                <td>{u.notes ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p style={{ fontSize: 13, color: "#c0392b" }}>
        ⚠️ Ce back-office n&apos;est pas encore protégé par mot de passe :
        l&apos;authentification est prévue à l&apos;étape 3. Ne le mettez pas en
        ligne avant.
      </p>
    </div>
  );
}
