import "./globals.css";
import Link from "next/link";

export const metadata = {
  title: "LOOTACLIM — Location de climatiseurs mobiles à Paris",
  description:
    "Louez un climatiseur mobile à Paris, livré et installé en 24h. Sans travaux, sans engagement.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="fr">
      <body>
        <nav className="topnav">
          <Link href="/" className="brand">
            LOOTA<em>CLIM</em>
          </Link>
          <div className="navlinks">
            <Link href="/catalogue">Catalogue</Link>
          </div>
        </nav>
        <main>{children}</main>
        <footer>
          LOOTACLIM · Location de climatiseurs mobiles · Paris & Île-de-France
        </footer>
      </body>
    </html>
  );
}
