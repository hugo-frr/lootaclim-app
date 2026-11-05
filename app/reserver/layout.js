// Tunnel de réservation et confirmations : pages utiles aux clients, pas à
// Google (contenu personnel ou sans intérêt dans les résultats de recherche).
export const metadata = {
  robots: { index: false, follow: true },
};

export default function ReserverLayout({ children }) {
  return children;
}
