import { requireUser } from "./auth";
import { prisma } from "../../lib/prisma";
import {
  euros,
  BOOKING_STATUS,
  UNIT_STATUS,
  KIT_STATUS,
} from "../../lib/constants";
import { toDay, addDays, nowInParis } from "../../lib/dates";
import { unitAssignmentError, kitAssignmentError, depositDue } from "../../lib/transitions";
import AdminHeader from "./AdminHeader";
import ConfirmSubmit from "./ConfirmSubmit";
import {
  confirmBooking,
  cancelBooking,
  assignUnit,
  assignKit,
  markDelivery,
  saveUnit,
  createUnit,
  createKit,
  saveKit,
  placeDepositNow,
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

// Kits proposables pour une réservation : disponibles et libres sur les
// dates (pas de contrainte de modèle, un kit est universel).
function eligibleKits(booking, kits) {
  const b = {
    status: booking.status,
    startDay: toDay(booking.startDate),
    endDay: toDay(booking.endDate),
  };
  return kits.filter((k) => {
    const others = k.bookings
      .filter((x) => x.id !== booking.id)
      .map((x) => ({ startDay: toDay(x.startDate), endDay: toDay(x.endDate), status: x.status }));
    return kitAssignmentError(b, k, others) === null;
  });
}

const dateTimeFr = (d, slot) => `${dateFr(d)}${slot ? ` · ${slot}` : ""}`;

// Ordre d'affichage : PENDING d'abord (bloque une décision), puis les
// réservations à venir triées par date d'intervention la plus proche,
// enfin l'historique (le plus récent en premier). Renvoie [étage, clé] —
// la clé commence par "~" pour les étages triés en ordre décroissant.
function bookingSortKey(b) {
  const dropoff = b.deliveries.find((d) => d.type === "DROPOFF");
  const pickup = b.deliveries.find((d) => d.type === "PICKUP");
  if (b.status === "PENDING") return [0, toDay(b.startDate)];
  if (b.status === "CONFIRMED") return [1, toDay(dropoff?.date ?? b.startDate)];
  if (b.status === "DELIVERED") return [2, toDay(pickup?.date ?? b.endDate)];
  if (b.status === "AWAITING_PAYMENT") return [3, `~${toDay(b.createdAt)}`];
  if (b.status === "RETURNED") return [4, `~${toDay(pickup?.date ?? b.endDate)}`];
  return [5, `~${toDay(b.createdAt)}`]; // CANCELLED
}
function compareBookings(a, b) {
  const [ta, ka] = bookingSortKey(a);
  const [tb, kb] = bookingSortKey(b);
  if (ta !== tb) return ta - tb;
  const desc = ka.startsWith("~");
  if (ka === kb) return 0;
  return (ka < kb ? -1 : 1) * (desc ? -1 : 1);
}

// Prête à livrer : même règle que deliveryDoneEffects (lib/transitions.js)
// — une caution due doit être POSÉE, indépendamment de la date. "Poser la
// caution" ne dépend lui du calendrier (depositReady) que pour éviter de
// la poser trop tôt ; une fois postée, la livraison redevient possible même
// si ce n'était pas encore "le jour".
function readyToDeliver(b) {
  return !(b.depositAmount > 0 && b.depositStatus !== "HELD");
}

const MANUAL_STATUSES = ["AVAILABLE", "MAINTENANCE", "RETIRED"];

export default async function Admin({ searchParams }) {
  // Le middleware ne vérifie que la signature du jeton : il tourne dans le
  // runtime edge, sans accès à la base. C'est ici qu'on refuse un compte
  // désactivé ou supprimé, sans attendre l'expiration de sa session.
  await requireUser();

  const [bookings, units, kits, customerCount, products] = await Promise.all([
    prisma.booking.findMany({
      include: {
        customer: true,
        product: true,
        unit: { include: { product: true } },
        kit: true,
        deliveries: true,
      },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
    prisma.unit.findMany({
      include: {
        product: true,
        bookings: { select: { id: true, startDate: true, endDate: true, status: true } },
      },
      orderBy: { serialNumber: "asc" },
    }),
    prisma.kit.findMany({
      include: {
        bookings: { select: { id: true, startDate: true, endDate: true, status: true } },
      },
      orderBy: { serialNumber: "asc" },
    }),
    prisma.customer.count(),
    prisma.product.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
  ]);

  const caConfirme = bookings
    .filter((b) => !["CANCELLED", "AWAITING_PAYMENT"].includes(b.status))
    .reduce((s, b) => s + b.total, 0);
  const dispo = units.filter((u) => u.status === "AVAILABLE").length;
  const livraisonsPlanifiees = bookings.reduce(
    (s, b) => s + b.deliveries.filter((d) => d.status === "SCHEDULED").length,
    0
  );

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
            <div className="num">{livraisonsPlanifiees}</div>
            <div className="lbl">Livraisons planifiées</div>
          </div>
          <div className="card kpi">
            <div className="num">{customerCount}</div>
            <div className="lbl">Clients</div>
          </div>
        </div>
      </div>

      <div className="card">
        <h2 style={{ marginBottom: 16 }}>Réservations</h2>
        <div className="bookings-list">
          <div className="bookings-head" aria-hidden="true">
            <span>Réf.</span><span>Client</span><span>Machine</span><span>Kit</span>
            <span>Livraison</span><span>Reprise</span><span>Total</span>
            <span>Statut</span><span>Caution</span><span>Action</span>
          </div>
          {[...bookings].sort(compareBookings).map((b) => {
            const dropoff = b.deliveries.find((d) => d.type === "DROPOFF");
            const pickup = b.deliveries.find((d) => d.type === "PICKUP");
            const today = nowInParis().day;
            const depositReady = b.depositAmount > 0 && depositDue(toDay(b.startDate), today);
            const depositDueDay = addDays(toDay(b.startDate), -1);

            return (
              <div className="booking-row" key={b.id}>
                <div className="booking-field"><span className="booking-field-label">Réf.</span><span>{b.reference}</span></div>
                <div className="booking-field"><span className="booking-field-label">Client</span><span>{b.customer.firstName} {b.customer.lastName}</span></div>

                <div className="booking-field">
                  <span className="booking-field-label">Machine</span>
                  <span>
                    {b.status === "PENDING" ? (
                      <select name="unitId" form={`confirm-${b.id}`} defaultValue={b.unitId ?? ""}>
                        <option value="">— à affecter —</option>
                        {eligibleUnits(b, units).map((u) => (
                          <option key={u.id} value={u.id}>{u.serialNumber}</option>
                        ))}
                      </select>
                    ) : b.status === "CONFIRMED" ? (
                      <form action={assignUnit} className="actions-cell">
                        <input type="hidden" name="bookingId" value={b.id} />
                        <select name="unitId" required defaultValue={b.unitId ?? ""}>
                          <option value="" disabled>Machine…</option>
                          {eligibleUnits(b, units).map((u) => (
                            <option key={u.id} value={u.id}>{u.serialNumber}</option>
                          ))}
                        </select>
                        <button type="submit" className="btn-small">{b.unitId ? "Modifier" : "Affecter"}</button>
                      </form>
                    ) : b.unit ? (
                      `${b.unit.product.name} · ${b.unit.serialNumber}`
                    ) : (
                      <span className="muted">{b.product.name} · — à affecter —</span>
                    )}
                  </span>
                </div>

                <div className="booking-field">
                  <span className="booking-field-label">Kit</span>
                  <span>
                    {!b.wantsKit ? (
                      <span className="muted">—</span>
                    ) : b.status === "PENDING" ? (
                      <select name="kitId" form={`confirm-${b.id}`} defaultValue={b.kitId ?? ""}>
                        <option value="">— aucun —</option>
                        {eligibleKits(b, kits).map((k) => (
                          <option key={k.id} value={k.id}>{k.serialNumber}</option>
                        ))}
                      </select>
                    ) : b.status === "CONFIRMED" ? (
                      <form action={assignKit} className="actions-cell">
                        <input type="hidden" name="bookingId" value={b.id} />
                        <select name="kitId" required defaultValue={b.kitId ?? ""}>
                          <option value="" disabled>Kit…</option>
                          {eligibleKits(b, kits).map((k) => (
                            <option key={k.id} value={k.id}>{k.serialNumber}</option>
                          ))}
                        </select>
                        <button type="submit" className="btn-small">{b.kitId ? "Modifier" : "Affecter"}</button>
                      </form>
                    ) : b.kitId ? (
                      b.kit.serialNumber
                    ) : (
                      <span className="muted">— (non affecté)</span>
                    )}
                  </span>
                </div>

                <div className="booking-field"><span className="booking-field-label">Livraison</span><span>{dateTimeFr(b.startDate, dropoff?.timeSlot)}</span></div>
                <div className="booking-field"><span className="booking-field-label">Reprise</span><span>{dateTimeFr(b.endDate, pickup?.timeSlot)}</span></div>
                <div className="booking-field"><span className="booking-field-label">Total</span><span>{euros(b.total)}</span></div>
                <div className="booking-field"><span className="booking-field-label">Statut</span><span className={`pill ${b.status}`}>{BOOKING_STATUS[b.status]}</span></div>
                <div className="booking-field">
                  <span className="booking-field-label">Caution</span>
                  {b.depositAmount > 0 ? (
                    ["HELD", "RELEASED", "CAPTURED"].includes(b.depositStatus) ? (
                      <span className="pill deposit-HELD">OK</span>
                    ) : (
                      <span className="pill deposit-FAILED">À poser</span>
                    )
                  ) : (
                    <span className="muted">—</span>
                  )}
                </div>

                <div className="booking-field booking-actions">
                  <span className="booking-field-label">Action</span>
                  <div className="actions-cell actions-cell-stacked">
                    {b.status === "AWAITING_PAYMENT" && <span className="muted">Paiement en cours…</span>}

                    {b.status === "PENDING" && (
                      <>
                        <form id={`confirm-${b.id}`} action={confirmBooking}>
                          <input type="hidden" name="id" value={b.id} />
                          <button type="submit" className="btn-small">Confirmer</button>
                        </form>
                        <form action={cancelBooking}>
                          <input type="hidden" name="id" value={b.id} />
                          <ConfirmSubmit className="btn-small btn-danger" message={`Annuler la réservation ${b.reference} ?`}>
                            Annuler
                          </ConfirmSubmit>
                        </form>
                      </>
                    )}

                    {b.status === "CONFIRMED" && depositReady && (
                      <form action={placeDepositNow}>
                        <input type="hidden" name="id" value={b.id} />
                        <button type="submit" className="btn-small">Poser la caution</button>
                      </form>
                    )}
                    {b.status === "CONFIRMED" && !depositReady && b.depositAmount > 0 && b.depositStatus === "NONE" && (
                      <span className="booking-next">Caution à poser le {dateFr(depositDueDay)}</span>
                    )}
                    {b.status === "CONFIRMED" && readyToDeliver(b) && (
                      <>
                        <form action={markDelivery}>
                          <input type="hidden" name="id" value={dropoff?.id} />
                          <input type="hidden" name="resultat" value="DONE" />
                          <button type="submit" className="btn-small">Marquer livrée</button>
                        </form>
                        <form action={markDelivery}>
                          <input type="hidden" name="id" value={dropoff?.id} />
                          <input type="hidden" name="resultat" value="FAILED" />
                          <ConfirmSubmit className="btn-small btn-danger" message="Marquer cette livraison en échec ?">
                            Échec
                          </ConfirmSubmit>
                        </form>
                      </>
                    )}
                    {b.status === "CONFIRMED" && (
                      <form action={cancelBooking}>
                        <input type="hidden" name="id" value={b.id} />
                        <ConfirmSubmit className="btn-small btn-danger" message={`Annuler la réservation ${b.reference} ?`}>
                          Annuler
                        </ConfirmSubmit>
                      </form>
                    )}

                    {b.status === "DELIVERED" && (
                      <>
                        <form action={markDelivery}>
                          <input type="hidden" name="id" value={pickup?.id} />
                          <input type="hidden" name="resultat" value="DONE" />
                          <button type="submit" className="btn-small">Marquer reprise</button>
                        </form>
                        <form action={markDelivery}>
                          <input type="hidden" name="id" value={pickup?.id} />
                          <input type="hidden" name="resultat" value="FAILED" />
                          <ConfirmSubmit className="btn-small btn-danger" message="Marquer cette reprise en échec ?">
                            Échec
                          </ConfirmSubmit>
                        </form>
                      </>
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
                          <ConfirmSubmit className="btn-small btn-danger" message={`Encaisser la caution de ${b.reference} ?`}>
                            Encaisser
                          </ConfirmSubmit>
                        </form>
                      </>
                    )}

                    {["RETURNED", "CANCELLED"].includes(b.status) && !(b.status === "RETURNED" && b.depositStatus === "HELD") && (
                      <span className="muted">—</span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="card">
        <h2 style={{ marginBottom: 16 }}>Parc machines</h2>
        <form action={createUnit} className="actions-cell" style={{ marginBottom: 14 }}>
          <select name="productId" required defaultValue="">
            <option value="" disabled>Modèle…</option>
            {products.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
          <input name="serialNumber" placeholder="N° de série" required minLength={3} maxLength={40} />
          <input name="notes" placeholder="Notes…" maxLength={500} />
          <button type="submit" className="btn-small">Nouvelle machine</button>
        </form>
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

      <div className="card">
        <h2 style={{ marginBottom: 16 }}>Kits de calfeutrage</h2>
        <form action={createKit} className="actions-cell" style={{ marginBottom: 14 }}>
          <input name="serialNumber" placeholder="N° de kit" required maxLength={40} />
          <input name="notes" placeholder="Notes…" maxLength={500} />
          <button type="submit" className="btn-small">Nouveau kit</button>
        </form>
        <table>
          <thead>
            <tr><th>N° kit</th><th>Statut</th><th>Gestion</th></tr>
          </thead>
          <tbody>
            {kits.map((k) => (
              <tr key={k.id}>
                <td>{k.serialNumber}</td>
                <td><span className={`pill ${k.status}`}>{KIT_STATUS[k.status]}</span></td>
                <td>
                  {MANUAL_STATUSES.includes(k.status) ? (
                    <form action={saveKit} className="actions-cell">
                      <input type="hidden" name="id" value={k.id} />
                      <select name="statut" defaultValue={k.status}>
                        {MANUAL_STATUSES.map((s) => (
                          <option key={s} value={s}>{KIT_STATUS[s]}</option>
                        ))}
                      </select>
                      <input name="notes" defaultValue={k.notes ?? ""} placeholder="Notes…" maxLength={500} />
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
