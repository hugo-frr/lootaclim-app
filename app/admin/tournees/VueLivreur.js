import { prisma } from "../../../lib/prisma";
import { addDays, nowInParis } from "../../../lib/dates";
import { FLOOR_LABELS } from "../../../lib/constants";
import { ENTREPOT, COULEURS_TOURNEES } from "../../../lib/tournees/config";
import { heureTexte } from "../../../lib/tournees/arrets";
import { liensTournee } from "../../../lib/tournees/navigation";
import { DETAILS_INTERVENTION } from "../../../lib/tournees/planification";
import CarteTournees from "./CarteTournees";
import CommencerTournee from "./CommencerTournee";
import { ChoixAppli, LienGuidage } from "./Guidage";
import { marquerArret } from "./actions";
import { adresseTexte, pointsDeTournee, dateLongue } from "./donnees";

export default async function VueLivreur({ user, day }) {
  const aujourdhui = nowInParis().day;
  const tour = user.id
    ? await prisma.tour.findUnique({
        where: { date_driverId: { date: new Date(day), driverId: user.id } },
        include: { deliveries: { include: DETAILS_INTERVENTION, orderBy: { ordre: "asc" } } },
      })
    : null;

  const autreJour =
    day === aujourdhui ? (
      <a href={`/admin/tournees?jour=${addDays(aujourdhui, 1)}`}>Voir demain</a>
    ) : (
      <a href={`/admin/tournees?jour=${aujourdhui}`}>Revenir à aujourd&apos;hui</a>
    );

  if (!tour || !tour.deliveries.length) {
    return (
      <div className="card livreur-vide">
        <span className="eyebrow">{dateLongue(day)}</span>
        <h1 className="section-title">Pas de tournée prévue</h1>
        <p className="muted">L&apos;administrateur ne vous a encore confié aucun arrêt ce jour-là.</p>
        <p>{autreJour}</p>
      </div>
    );
  }

  const restants = tour.deliveries.filter((d) => d.status === "SCHEDULED");
  const enCours = restants[0] ?? null;
  const aCharger = restants.filter((d) => d.type === "DROPOFF").length;
  const pointsRestants = restants
    .filter((d) => d.booking.address.lat != null)
    .map((d) => ({ lat: d.booking.address.lat, lng: d.booking.address.lng }));

  return (
    <>
      <div className="livreur-entete">
        <span className="eyebrow">{dateLongue(day)} · {autreJour}</span>
        <h1 className="section-title">Ma tournée</h1>
        <p className="muted">
          {restants.length} arrêt(s) restant(s) sur {tour.deliveries.length}
          {tour.conduiteMin != null && ` · environ ${tour.conduiteMin} min de conduite`}
          {tour.status === "PLANNED" && ` · ${aCharger} machine(s) à charger à l'entrepôt`}
        </p>
      </div>

      {tour.status === "PLANNED" && day === aujourdhui && <CommencerTournee tourId={tour.id} />}

      <ChoixAppli />
      <CarteTournees
        entrepot={ENTREPOT}
        tournees={[{
          couleur: COULEURS_TOURNEES[0],
          trace: tour.trace ? JSON.parse(tour.trace) : null,
          points: pointsDeTournee(tour.deliveries),
        }]}
      />

      {pointsRestants.length > 1 && (
        <div className="livreur-liens">
          {liensTournee(pointsRestants).map((l) => (
            <a key={l.de} href={l.url} target="_blank" rel="noopener noreferrer" className="btn btn-secondary">
              {liensTournee(pointsRestants).length > 1
                ? `Arrêts ${l.de} à ${l.a} dans Google Maps`
                : "Toute la tournée dans Google Maps"}
            </a>
          ))}
        </div>
      )}

      {!enCours && (
        <div className="card livreur-fini">
          <h2>Tournée terminée 🎉</h2>
          <p className="muted">Pensez à décharger les machines reprises à l&apos;entrepôt.</p>
        </div>
      )}

      <ol className="livreur-arrets">
        {tour.deliveries.map((d) => (
          <Arret key={d.id} d={d} actif={d.id === enCours?.id} />
        ))}
      </ol>
    </>
  );
}

function Arret({ d, actif }) {
  const b = d.booking;
  const fait = d.status !== "SCHEDULED";
  const reprise = d.type === "PICKUP";
  const cautionManquante = !reprise && b.depositAmount > 0 && b.depositStatus !== "HELD";
  const point = b.address.lat != null ? { lat: b.address.lat, lng: b.address.lng } : null;
  return (
    <li className={`card livreur-arret${actif ? " actif" : ""}${fait ? " fait" : ""}`}>
      <div className="livreur-arret-tete">
        <span className="livreur-numero">{d.ordre ?? "–"}</span>
        <span>
          <strong>{reprise ? "Reprise" : "Livraison"}</strong>
          {d.heurePrevue != null && !fait && ` · vers ${heureTexte(d.heurePrevue)}`}
          <br />
          <span className="muted">Créneau client {d.timeSlot}</span>
        </span>
        {fait && <span className="pill DELIVERED">{d.status === "DONE" ? "Fait" : "Échec"}</span>}
      </div>
      <p>
        <strong>{b.customer.firstName} {b.customer.lastName}</strong> ·{" "}
        <a href={`tel:${b.customer.phone.replace(/\s/g, "")}`}>{b.customer.phone}</a>
      </p>
      <p>{adresseTexte(b.address)}</p>
      <p className="muted">
        {FLOOR_LABELS[b.address.floor] ?? b.address.floor}
        {b.address.accessCode && ` · Code : ${b.address.accessCode}`}
      </p>
      <p className="muted">
        {b.product.name}
        {b.unit && ` · machine ${b.unit.serialNumber}`}
        {b.kit && ` · kit ${b.kit.serialNumber}`}
        {b.wantsKit && !b.kit && " · kit demandé, non affecté"}
      </p>
      {!fait && cautionManquante && (
        <p className="form-error">Caution non posée : appelez l&apos;administrateur avant de livrer.</p>
      )}
      {!fait && (
        <div className="livreur-actions">
          {point && (
            <LienGuidage point={point} className={`btn ${actif ? "btn-primary" : "btn-secondary"}`}>
              Y aller
            </LienGuidage>
          )}
          <form action={marquerArret}>
            <input type="hidden" name="id" value={d.id} />
            <input type="hidden" name="resultat" value="DONE" />
            <button type="submit" className={`btn ${actif ? "btn-primary" : "btn-secondary"}`}>
              {reprise ? "Récupérée" : "Livrée"}
            </button>
          </form>
        </div>
      )}
    </li>
  );
}
