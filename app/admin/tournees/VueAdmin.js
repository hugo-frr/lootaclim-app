import { prisma } from "../../../lib/prisma";
import { addDays, nowInParis } from "../../../lib/dates";
import { ENTREPOT, COULEURS_TOURNEES } from "../../../lib/tournees/config";
import { heureTexte } from "../../../lib/tournees/arrets";
import { interventionsDuJour, DETAILS_INTERVENTION } from "../../../lib/tournees/planification";
import CarteTournees from "./CarteTournees";
import { calculerTournees, deplacerArret } from "./actions";
import { adresseTexte, pointsDeTournee, dateLongue } from "./donnees";

const STATUT_TOURNEE = { PLANNED: "Prévue", STARTED: "En cours" };

export default async function VueAdmin({ day }) {
  const [livreurs, tours, aFaire] = await Promise.all([
    prisma.user.findMany({ where: { role: "LIVREUR", active: true }, orderBy: { name: "asc" } }),
    prisma.tour.findMany({
      where: { date: new Date(day) },
      include: { driver: true, deliveries: { include: DETAILS_INTERVENTION, orderBy: { ordre: "asc" } } },
      orderBy: { createdAt: "asc" },
    }),
    interventionsDuJour(day),
  ]);
  const nonPlacees = aFaire.filter((d) => !d.tourId);
  // Un livreur parti ne reçoit plus d'arrêt : on ne le propose pas.
  const partis = new Set(tours.filter((t) => t.status === "STARTED").map((t) => t.driverId));
  const disponibles = livreurs.filter((l) => !partis.has(l.id));
  const avecTournee = new Set(tours.map((t) => t.driverId));
  const cocheParDefaut = (id) => (tours.length ? avecTournee.has(id) : true);
  const aujourdhui = nowInParis().day;
  const couleur = (i) => COULEURS_TOURNEES[i % COULEURS_TOURNEES.length];

  return (
    <>
      <div>
        <span className="eyebrow">Back-office</span>
        <h1 className="section-title">Tournées du {dateLongue(day)}</h1>
        <div className="tournees-jours">
          <a href={`/admin/tournees?jour=${aujourdhui}`}>Aujourd&apos;hui</a>
          <a href={`/admin/tournees?jour=${addDays(aujourdhui, 1)}`}>Demain</a>
          <form method="get" className="actions-cell">
            <input type="date" name="jour" defaultValue={day} aria-label="Autre jour" />
            <button type="submit" className="btn-small">Voir</button>
          </form>
        </div>
      </div>

      <form action={calculerTournees} className="card stack-sm">
        <input type="hidden" name="jour" value={day} />
        <h2>Qui travaille ce jour-là ?</h2>
        {livreurs.length ? (
          <div className="tournees-livreurs">
            {livreurs.map((l) => (
              <label key={l.id} className="case">
                <input type="checkbox" name="livreurs" value={l.id} defaultChecked={cocheParDefaut(l.id)} /> {l.name}
              </label>
            ))}
          </div>
        ) : (
          <p className="muted">
            Aucun compte livreur. Créez-en avec <code>node prisma/creer-compte.js</code>, ou lancez les données
            de test : <code>npm run db:demo-tournees</code>.
          </p>
        )}
        <p className="muted">
          {aFaire.length} intervention(s) à faire ce jour-là. Les tournées déjà commencées ne sont pas modifiées.
        </p>
        <div>
          <button type="submit" className="btn btn-primary" disabled={!livreurs.length}>
            Calculer les tournées
          </button>
        </div>
      </form>

      {nonPlacees.length > 0 && (
        <div className="card tournees-alerte">
          <h2>Non placées ({nonPlacees.length})</h2>
          <ul>
            {nonPlacees.map((d) => (
              <li key={d.id}>
                <strong>{d.booking.reference}</strong> · {d.type === "PICKUP" ? "Reprise" : "Livraison"} {d.timeSlot} ·{" "}
                {adresseTexte(d.booking.address)} —{" "}
                {d.booking.address.lat == null
                  ? "adresse introuvable, à corriger dans la réservation"
                  : tours.length
                    ? "impossible à caser : créneau intenable ou véhicules pleins"
                    : "pas encore réparties"}
                <MenuDonner d={d} day={day} livreurs={disponibles} />
              </li>
            ))}
          </ul>
        </div>
      )}

      {tours.length > 0 && (
        <>
          <CarteTournees
            entrepot={ENTREPOT}
            tournees={tours.map((t, i) => ({
              couleur: couleur(i),
              trace: t.trace ? JSON.parse(t.trace) : null,
              points: pointsDeTournee(t.deliveries),
            }))}
          />
          <div className="tournees-colonnes">
            {tours.map((t, i) => (
              <section key={t.id} className="card tournee-colonne" style={{ borderTopColor: couleur(i) }}>
                <h2>{t.driver.name}</h2>
                <p className="muted">
                  {STATUT_TOURNEE[t.status]} · {t.deliveries.length} arrêt(s)
                  {t.conduiteMin != null && ` · ${t.conduiteMin} min de conduite`} ·{" "}
                  {t.deliveries.filter((d) => d.type === "DROPOFF").length} machine(s) à charger
                </p>
                <ol className="tournee-arrets">
                  {t.deliveries.map((d) => (
                    <li key={d.id} className={d.status !== "SCHEDULED" ? "fait" : ""}>
                      <span className="tournee-heure">{d.heurePrevue != null ? heureTexte(d.heurePrevue) : "—"}</span>
                      <span>
                        <strong>{d.type === "PICKUP" ? "Reprise" : "Livraison"}</strong> ({d.timeSlot}) ·{" "}
                        {d.booking.customer.firstName} {d.booking.customer.lastName}
                        <br />
                        <span className="muted">{adresseTexte(d.booking.address)}</span>
                      </span>
                      {d.status === "SCHEDULED" && t.status !== "STARTED" && (
                        <MenuDonner d={d} day={day} livreurs={disponibles.filter((l) => l.id !== t.driverId)} />
                      )}
                    </li>
                  ))}
                </ol>
              </section>
            ))}
          </div>
        </>
      )}
    </>
  );
}

function MenuDonner({ d, day, livreurs }) {
  if (!livreurs.length) return null;
  return (
    <form action={deplacerArret} className="actions-cell tournee-donner">
      <input type="hidden" name="id" value={d.id} />
      <input type="hidden" name="jour" value={day} />
      <select name="livreur" required defaultValue="" aria-label="Donner à">
        <option value="" disabled>Donner à…</option>
        {livreurs.map((l) => (
          <option key={l.id} value={l.id}>{l.name}</option>
        ))}
      </select>
      <button type="submit" className="btn-small">OK</button>
    </form>
  );
}
