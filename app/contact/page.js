import Link from "next/link";
import { SITE, PRE_LANCEMENT } from "../../lib/legal";

export const metadata = {
  title: "Contact — LOOTACLIM",
  description: "Nous écrire : questions, demandes concernant vos données, ou simple curiosité.",
};

export default function Contact() {
  return (
    <div className="stack legal">
      <div>
        <span className="eyebrow">Nous écrire</span>
        <h1 className="page-title">Contact</h1>
      </div>

      <section>
        <p className="page-lead">
          <a href={`mailto:${SITE.email}`}>{SITE.email}</a>
        </p>
        <p>
          Nous sommes trois étudiants parisiens. On répond nous-mêmes, en
          général sous 24 heures.
        </p>
      </section>

      {PRE_LANCEMENT && (
        <div className="legal-avis">
          <strong>Le service n&apos;est pas encore ouvert.</strong> Vous pouvez
          nous écrire pour toute question, mais aucune réservation ne peut être
          enregistrée pour l&apos;instant. Laissez-nous votre email dans
          l&apos;enquête de la page d&apos;accueil pour être prévenu du
          lancement.
        </div>
      )}

      <section>
        <h2>Vos données personnelles</h2>
        <p>
          Pour consulter, corriger ou faire effacer les informations que nous
          détenons sur vous, écrivez à cette même adresse. Le détail figure dans
          notre <Link href="/confidentialite">politique de confidentialité</Link>.
        </p>
      </section>

      <p className="muted">
        <Link href="/qui-sommes-nous" className="lien-fleche">
          Qui sommes-nous <span aria-hidden="true">→</span>
        </Link>
      </p>
    </div>
  );
}
