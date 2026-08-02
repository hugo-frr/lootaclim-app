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
          <Link href="/" className="brand" aria-label="LOOTACLIM Paris, accueil">
            <span aria-hidden="true">
              LOOTA<em>CLIM</em>
            </span>
            <small aria-hidden="true">PARIS</small>
          </Link>
          <div className="navlinks">
            <Link href="/#modeles">Catalogue</Link>
            <Link href="/qui-sommes-nous">Qui sommes-nous</Link>
          </div>
        </nav>
        <main>{children}</main>
        <footer>
          <p>LOOTACLIM · Location de climatiseurs mobiles · Paris &amp; Île-de-France</p>
          <nav className="footer-liens">
            <Link href="/qui-sommes-nous">Qui sommes-nous</Link>
            <Link href="/contact">Contact</Link>
            <Link href="/mentions-legales">Mentions légales</Link>
            <Link href="/confidentialite">Confidentialité</Link>
          </nav>
        </footer>
      </body>
    </html>
  );
}
