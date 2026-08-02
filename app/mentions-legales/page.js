import Link from "next/link";
import { SITE, HEBERGEUR, PRE_LANCEMENT } from "../../lib/legal";

export const metadata = {
  title: "Mentions légales — LOOTACLIM",
  description: "Éditeur, hébergeur et statut du site LOOTACLIM.",
};

export default function MentionsLegales() {
  return (
    <div className="stack legal">
      <div>
        <span className="eyebrow">Informations légales</span>
        <h1 className="page-title">Mentions légales</h1>
        <p className="page-lead">Dernière mise à jour : 2 août 2026.</p>
      </div>

      {PRE_LANCEMENT && (
        <div className="legal-avis">
          <strong>Site en préparation.</strong> {SITE.nom} n&apos;est pas encore
          ouvert commercialement : aucune réservation ne peut être enregistrée,
          aucun paiement encaissé. Les tarifs affichés sont indicatifs et ne
          constituent pas une offre de vente.
        </div>
      )}

      <section>
        <h2>Éditeur du site</h2>
        <p>
          {SITE.editeurs.join(", ")}.<br />
          <strong>{SITE.statut}.</strong>
        </p>
        <p>
          Directeur de la publication : {SITE.directeurPublication}.<br />
          Contact : <a href={`mailto:${SITE.email}`}>{SITE.email}</a>
        </p>
        {!SITE.siret && (
          <p className="muted">
            Le numéro SIRET, la forme juridique et l&apos;adresse du siège
            seront publiés ici dès l&apos;immatriculation de la société, avant
            toute ouverture commerciale.
          </p>
        )}
      </section>

      <section>
        <h2>Hébergeur</h2>
        <p>
          {HEBERGEUR.nom}
          <br />
          {HEBERGEUR.adresse}
          <br />
          <a href={HEBERGEUR.site} target="_blank" rel="noopener noreferrer">
            {HEBERGEUR.site}
          </a>
        </p>
      </section>

      <section>
        <h2>Propriété intellectuelle</h2>
        <p>
          Les textes, la charte graphique et le nom {SITE.nom} sont la propriété
          de ses éditeurs. Les photographies des appareils proviennent de leurs
          fabricants respectifs et restent leur propriété.
        </p>
      </section>

      <section>
        <h2>Données personnelles</h2>
        <p>
          Le détail des données collectées, de leur durée de conservation et de
          vos droits figure dans notre{" "}
          <Link href="/confidentialite">politique de confidentialité</Link>.
        </p>
      </section>

      <p className="muted">
        <Link href="/confidentialite" className="lien-fleche">
          Politique de confidentialité <span aria-hidden="true">→</span>
        </Link>
      </p>
    </div>
  );
}
