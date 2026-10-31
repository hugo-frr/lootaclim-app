import Link from "next/link";
import { logout } from "./connexion/actions";
import { currentUser } from "./auth";
import { can } from "../../lib/roles";

// Chaque lien avec le droit qui le rend utile. Masquer un lien ne protège
// rien : c'est la page elle-même qui doit vérifier le droit.
const LIENS = [
  ["/admin", "Tableau de bord", "voirReservations"],
  ["/admin/tournees", "Tournées", "voirTournees"],
  ["/admin/produits", "Modèles & prix", "gererProduits"],
  ["/admin/enquete", "Enquête de marché", "voirEnquete"],
  ["/admin/etiquettes", "Étiquettes", "imprimerEtiquettes"],
];

// En-tête commun des pages du back-office (pas de la page de connexion)
export default async function AdminHeader() {
  const user = await currentUser();
  return (
    <div className="admin-header">
      {LIENS.filter(([, , droit]) => can(user?.role, droit)).map(([href, texte]) => (
        <Link key={href} href={href}>{texte}</Link>
      ))}
      <form action={logout}>
        <button type="submit" className="linklike">Se déconnecter</button>
      </form>
    </div>
  );
}
