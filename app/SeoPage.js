// Gabarit commun des pages SEO : fil d'Ariane, H1, « En bref », sections
// H2/H3, tableaux calculés depuis la base, FAQ, bouton d'action, « À voir
// aussi » et données structurées schema.org. La page reçoit un contenu déjà
// rempli (aucun {repère} restant) : voir app/[...chemin]/page.js.

import Link from "next/link";
import ModelPhoto from "./ModelPhoto";
import { PRE_LANCEMENT } from "../lib/legal";
import { discountRate } from "../lib/pricing";
import { eurosFr, nombreFr, tableauPuissance } from "../lib/seoGabarits";
import { slugify } from "../lib/slug";

function JsonLd({ data }) {
  // « < » échappé : un texte de la base ne peut pas fermer la balise script.
  const json = JSON.stringify(data).replace(/</g, "\\u003c");
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: json }} />;
}

function TableauPrix({ produits }) {
  const r7 = discountRate(7);
  const r30 = discountRate(30);
  return (
    <div className="seo-table-wrap">
      <table className="seo-table">
        <thead>
          <tr>
            <th scope="col">Modèle</th>
            <th scope="col">Par jour</th>
            <th scope="col">Par jour dès 7 jours</th>
            <th scope="col">Par jour dès 30 jours</th>
            <th scope="col">Caution (empreinte)</th>
          </tr>
        </thead>
        <tbody>
          {produits.map((p) => (
            <tr key={p.slug}>
              <th scope="row">
                <Link href={`/climatiseurs/${p.slug}`}>{p.name}</Link>
                <small> · {p.maxAreaM2} m²</small>
              </th>
              <td>{eurosFr(p.dailyPrice)} €</td>
              <td>{eurosFr(Math.round(p.dailyPrice * (1 - r7)))} €</td>
              <td>{eurosFr(Math.round(p.dailyPrice * (1 - r30)))} €</td>
              <td>{eurosFr(p.depositAmount)} €</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TableauComparatif({ produits }) {
  return (
    <div className="seo-table-wrap">
      <table className="seo-table">
        <thead>
          <tr>
            <th scope="col">Modèle</th>
            <th scope="col">Surface</th>
            <th scope="col">Puissance</th>
            <th scope="col">Bruit</th>
            <th scope="col">Prix</th>
          </tr>
        </thead>
        <tbody>
          {produits.map((p) => (
            <tr key={p.slug}>
              <th scope="row">
                <Link href={`/climatiseurs/${p.slug}`}>{p.name}</Link>
              </th>
              <td>jusqu&apos;à {p.maxAreaM2} m²</td>
              <td>{nombreFr(p.powerKw)} kW</td>
              <td>{p.noiseDb} dB</td>
              <td>dès {eurosFr(p.dailyPrice)} €/jour</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TableauPuissance() {
  return (
    <div className="seo-table-wrap">
      <table className="seo-table">
        <thead>
          <tr>
            <th scope="col">Surface</th>
            <th scope="col">Puissance conseillée</th>
            <th scope="col">Équivalent BTU/h</th>
          </tr>
        </thead>
        <tbody>
          {tableauPuissance().map((l) => (
            <tr key={l.surface}>
              <th scope="row">{l.surface} m²</th>
              <td>{nombreFr(l.kw)} kW</td>
              <td>{nombreFr(l.btu)} BTU</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="seo-note">Pièce standard (2,50 m sous plafond, isolation moyenne). Sous les toits ou plein sud, ajoutez 15 à 25 %.</p>
    </div>
  );
}

function Tableau({ type, produits }) {
  if (type === "prix") return <TableauPrix produits={produits} />;
  if (type === "comparatif") return <TableauComparatif produits={produits} />;
  if (type === "puissance") return <TableauPuissance />;
  return null;
}

function Liens({ liens }) {
  if (!liens?.length) return null;
  return (
    <p className="seo-liens">
      {liens.map((l) => (
        <Link key={l.href} href={l.href} className="seo-lien">
          {l.texte} →
        </Link>
      ))}
    </p>
  );
}

function dateFr(iso) {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
}

// Ancre d'un H2, pour le sommaire latéral.
function ancre(texte) {
  return slugify(texte).slice(0, 60);
}

function Cta({ produit, compact = false }) {
  return (
    <div className={compact ? "seo-cta seo-cta-compact" : "seo-cta"}>
      {PRE_LANCEMENT ? (
        <>
          <p>
            <strong>Ouverture prochaine à Paris.</strong>{" "}
            {compact
              ? "Les réservations ouvrent bientôt."
              : "Les réservations ne sont pas encore ouvertes : écrivez-nous pour être prévenu du lancement."}
          </p>
          <Link href="/contact" className="btn btn-primary">
            Être prévenu du lancement
          </Link>
        </>
      ) : (
        <>
          <p>
            <strong>Un climatiseur chez vous en 24h.</strong> Livré, installé, repris. Sans travaux.
          </p>
          <Link href={produit ? `/reserver/${produit.slug}` : "/climatiseurs"} className="btn btn-primary">
            {produit ? `Réserver ${produit.name}` : "Choisir mon climatiseur"}
          </Link>
        </>
      )}
    </div>
  );
}

export default function SeoPage({ page, fil, faq, produits, produit, voirAussi, articles, jsonLd }) {
  const avecSommaire = page.sections.length >= 2;
  return (
    <article className="seo-page">
      {jsonLd.map((d, i) => (
        <JsonLd key={i} data={d} />
      ))}

      <header className={`seo-hero${produit ? " seo-hero-produit" : ""}`}>
        <div className="seo-hero-texte">
          <nav aria-label="Fil d'Ariane" className="seo-fil">
            <ol>
              {fil.map((e, i) => (
                <li key={e.chemin}>
                  {i < fil.length - 1 ? <Link href={e.chemin}>{e.nom}</Link> : <span aria-current="page">{e.nom}</span>}
                </li>
              ))}
            </ol>
          </nav>
          <h1 className="page-title">{page.h1}</h1>
          {page.type === "article" && (
            <p className="seo-meta">
              Par l&apos;équipe LOOTACLIM · Mis à jour le <time dateTime={page.date}>{dateFr(page.date)}</time>
            </p>
          )}
          {page.intro && <p className="page-lead seo-intro">{page.intro}</p>}
        </div>

        <div className="seo-hero-cote">
          {produit && (
            <div className="seo-produit">
              <ModelPhoto
                url={produit.images?.[0]?.url}
                alt={produit.images?.[0]?.alt ?? `Climatiseur mobile ${produit.name}`}
              />
              <ul className="seo-chiffres">
                <li><strong>{produit.maxAreaM2} m²</strong><span>surface max</span></li>
                <li><strong>{nombreFr(produit.powerKw)} kW</strong><span>puissance</span></li>
                <li><strong>{produit.noiseDb} dB</strong><span>niveau sonore</span></li>
                <li><strong>{eurosFr(produit.dailyPrice)} €</strong><span>par jour</span></li>
              </ul>
            </div>
          )}
          {page.enBref && (
            <div className="seo-enbref">
              <span className="seo-enbref-titre">En bref</span>
              <p>{page.enBref}</p>
            </div>
          )}
        </div>
      </header>

      {page.type === "blog" && (
        <ul className="seo-articles">
          {articles.map((a) => (
            <li key={a.chemin}>
              <Link href={a.chemin}>
                <strong>{a.h1}</strong>
                <span>{a.description}</span>
                <em>Lire l&apos;article →</em>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {page.sections.length > 0 && (
        <div className={avecSommaire ? "seo-corps" : "seo-corps seo-corps-seul"}>
          <div className="seo-contenu">
            {page.sections.map((s) => (
              <section key={s.h2} id={ancre(s.h2)} className="seo-section">
                <h2>{s.h2}</h2>
                {s.p && <p>{s.p}</p>}
                {s.tableau && <Tableau type={s.tableau} produits={produits} />}
                {s.h3?.some((h) => h.tableau)
                  ? s.h3.map((h) => (
                      <div key={h.titre} className="seo-h3">
                        <h3>{h.titre}</h3>
                        {h.p && <p>{h.p}</p>}
                        {h.tableau && <Tableau type={h.tableau} produits={produits} />}
                        {h.lien && <Liens liens={[h.lien]} />}
                      </div>
                    ))
                  : s.h3?.length > 0 && (
                      <div className="seo-cartes">
                        {s.h3.map((h) => (
                          <div key={h.titre} className="seo-carte">
                            <h3>{h.titre}</h3>
                            {h.p && <p>{h.p}</p>}
                            {h.lien && <Liens liens={[h.lien]} />}
                          </div>
                        ))}
                      </div>
                    )}
                <Liens liens={s.liens} />
              </section>
            ))}
          </div>

          {avecSommaire && (
            <aside className="seo-aside">
              <nav aria-label="Sur cette page" className="seo-sommaire">
                <span>Sur cette page</span>
                <ol>
                  {page.sections.map((s) => (
                    <li key={s.h2}>
                      <a href={`#${ancre(s.h2)}`}>{s.h2}</a>
                    </li>
                  ))}
                  {!page.faqDepuisSections && faq.length > 0 && (
                    <li>
                      <a href="#questions-frequentes">Questions fréquentes</a>
                    </li>
                  )}
                </ol>
              </nav>
              <Cta produit={produit} compact />
            </aside>
          )}
        </div>
      )}

      {!page.faqDepuisSections && faq.length > 0 && (
        <section id="questions-frequentes" className="seo-faq">
          <h2>Questions fréquentes</h2>
          <div className="seo-faq-grille">
            {faq.map((f) => (
              <div key={f.q} className="seo-carte">
                <h3>{f.q}</h3>
                <p>{f.r}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      <Cta produit={produit} />

      {voirAussi.length > 0 && (
        <nav aria-label="À voir aussi" className="seo-voir-aussi">
          <h2>À voir aussi</h2>
          <ul>
            {voirAussi.map((v) => (
              <li key={v.chemin}>
                <Link href={v.chemin}>
                  {v.titre}
                  <span aria-hidden="true">→</span>
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      )}
    </article>
  );
}
