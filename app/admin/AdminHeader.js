import Link from "next/link";
import { logout } from "./connexion/actions";

// En-tête commun des pages du back-office (pas de la page de connexion)
export default function AdminHeader() {
  return (
    <div className="admin-header">
      <Link href="/admin">Tableau de bord</Link>
      <Link href="/admin/produits">Modèles &amp; prix</Link>
      <form action={logout}>
        <button type="submit" className="linklike">Se déconnecter</button>
      </form>
    </div>
  );
}
