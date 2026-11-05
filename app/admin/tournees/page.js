import { requireCan } from "../auth";
import { can } from "../../../lib/roles";
import AdminHeader from "../AdminHeader";
import VueAdmin from "./VueAdmin";
import VueLivreur from "./VueLivreur";
import { jourDemande } from "./donnees";

export const dynamic = "force-dynamic";
export const metadata = { title: "Tournées — LOOTACLIM" };

// Une seule adresse pour tout le monde : l'admin y répartit, le livreur y
// déroule sa tournée. C'est là que la connexion envoie un livreur.
export default async function Tournees({ searchParams }) {
  const user = await requireCan("voirTournees");
  const day = jourDemande(searchParams.jour);
  return (
    <div className="stack">
      <AdminHeader />
      {searchParams.erreur && <p className="form-error" role="alert">{searchParams.erreur}</p>}
      {searchParams.info && <p className="form-info" role="status">{searchParams.info}</p>}
      {can(user.role, "planifierTournees") ? <VueAdmin day={day} /> : <VueLivreur user={user} day={day} />}
    </div>
  );
}
