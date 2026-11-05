import "./globals.css";
import Link from "next/link";
import { SITE_URL, organisationLd } from "../lib/seo";

export const metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "Location climatiseur Paris | Livré et installé en 24h – Lootaclim",
    template: "%s",
  },
  description:
    "Location de climatiseur mobile à Paris et petite couronne : livré et installé en 24h, sans travaux, sans engagement.",
  applicationName: "LOOTACLIM",
  openGraph: {
    siteName: "LOOTACLIM",
    locale: "fr_FR",
    type: "website",
  },
  twitter: { card: "summary" },
};

// Maillage interne : depuis n'importe quelle page, chaque famille (modèles,
// offre, zones, conseils) est à un clic. Google s'en sert pour découvrir et
// hiérarchiser les pages.
const PIED_DE_PAGE = [
  {
    titre: "Nos climatiseurs",
    liens: [
      ["/climatiseurs", "Comparer les modèles"],
      ["/climatiseurs/seine", "SEINE · chambre"],
      ["/climatiseurs/rivoli", "RIVOLI · salon"],
      ["/climatiseurs/trocadero", "TROCADÉRO · grands espaces"],
    ],
  },
  {
    titre: "L'offre",
    liens: [
      ["/tarifs", "Tarifs"],
      ["/comment-ca-marche", "Comment ça marche"],
      ["/livraison-climatiseur-24h", "Livraison en 24h"],
      ["/location-climatiseur-particulier", "Particuliers"],
      ["/location-climatiseur-bureau", "Professionnels"],
      ["/faq", "Questions fréquentes"],
    ],
  },
  {
    titre: "Zones de livraison",
    liens: [
      ["/zones-de-livraison", "Paris & petite couronne"],
      ["/location-climatiseur-hauts-de-seine", "Hauts-de-Seine (92)"],
      ["/location-climatiseur-seine-saint-denis", "Seine-Saint-Denis (93)"],
      ["/location-climatiseur-val-de-marne", "Val-de-Marne (94)"],
    ],
  },
  {
    titre: "Conseils",
    liens: [
      ["/blog", "Tous nos conseils"],
      ["/blog/quelle-puissance-climatiseur-surface", "Quelle puissance de clim ?"],
      ["/blog/climatiseur-sans-evacuation", "Climatiseur sans évacuation"],
      ["/blog/rafraichir-appartement-canicule", "Rafraîchir son appartement"],
    ],
  },
];

export default function RootLayout({ children }) {
  const org = JSON.stringify(organisationLd()).replace(/</g, "\\u003c");
  return (
    <html lang="fr">
      <body>
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: org }} />
        <nav className="topnav">
          <Link href="/" className="brand" aria-label="LOOTACLIM Paris, accueil">
            <span aria-hidden="true">
              LOOTA<em>CLIM</em>
            </span>
            <small aria-hidden="true">PARIS</small>
          </Link>
          <div className="navlinks">
            <Link href="/climatiseurs">Climatiseurs</Link>
            <Link href="/tarifs">Tarifs</Link>
            <Link href="/blog" className="navlink-secondaire">Conseils</Link>
            <Link href="/qui-sommes-nous" className="navlink-secondaire">Qui sommes-nous</Link>
          </div>
        </nav>
        <main>{children}</main>
        <footer>
          <div className="footer-plan">
            {PIED_DE_PAGE.map((col) => (
              <nav key={col.titre} aria-label={col.titre}>
                <strong>{col.titre}</strong>
                <ul>
                  {col.liens.map(([href, texte]) => (
                    <li key={href}>
                      <Link href={href}>{texte}</Link>
                    </li>
                  ))}
                </ul>
              </nav>
            ))}
          </div>
          <p>LOOTACLIM · Location de climatiseurs mobiles · Paris &amp; Île-de-France</p>
          <nav className="footer-liens" aria-label="Informations">
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
