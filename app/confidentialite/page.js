import Link from "next/link";
import { SITE, HEBERGEUR, BASE_DONNEES, TRAITEMENT_HORS_UE, CONSERVATION } from "../../lib/legal";

export const metadata = {
  title: "Politique de confidentialité — LOOTACLIM",
  description:
    "Quelles données LOOTACLIM collecte, pourquoi, combien de temps, et comment exercer vos droits.",
};

export default function Confidentialite() {
  return (
    <div className="stack legal">
      <div>
        <span className="eyebrow">Données personnelles</span>
        <h1 className="page-title">Politique de confidentialité</h1>
        <p className="page-lead">
          Ce que nous enregistrons, pourquoi, et comment le faire effacer.
          Dernière mise à jour : 2 août 2026.
        </p>
      </div>

      <section>
        <h2>Qui traite vos données</h2>
        <p>
          Le site {SITE.nom} est édité par {SITE.editeurs.join(", ")}.{" "}
          {SITE.statut}. Pour toute question ou demande concernant vos données :{" "}
          <a href={`mailto:${SITE.email}`}>{SITE.email}</a>.
        </p>
      </section>

      <section>
        <h2>Ce que nous collectons, et pourquoi</h2>

        <h3>Si vous réservez un climatiseur</h3>
        <ul>
          <li>Nom, prénom, adresse email, numéro de téléphone</li>
          <li>Adresse de livraison, étage, code d&apos;accès</li>
          <li>Dates de location et créneaux choisis</li>
          <li>Référence du paiement chez notre prestataire</li>
        </ul>
        <p>
          Ces informations sont <strong>nécessaires à l&apos;exécution du
          contrat</strong> : sans elles, impossible de livrer une machine ni de
          venir la reprendre. Nous ne conservons <strong>aucun numéro de carte
          bancaire</strong> : le paiement est traité par Stripe, qui seul y a
          accès.
        </p>

        <h3>Si vous répondez à notre enquête</h3>
        <ul>
          <li>Vos réponses aux questions posées (surface, quartier, budget, âge…)</li>
          <li>Votre adresse email, uniquement si vous la laissez</li>
        </ul>
        <p>
          Base légale : <strong>votre consentement</strong>, recueilli par une
          case à cocher avant l&apos;envoi. Vous pouvez le retirer à tout moment
          en nous écrivant.
        </p>

        <h3>Ce que nous ne faisons pas</h3>
        <p>
          Aucun cookie publicitaire, aucun traceur, aucun outil de mesure
          d&apos;audience tiers. Vos données ne sont <strong>ni vendues ni
          transmises</strong> à qui que ce soit à des fins commerciales.
        </p>
      </section>

      <section>
        <h2>Combien de temps</h2>
        <ul>
          <li>Réponses à l&apos;enquête : {CONSERVATION.enquete}</li>
          <li>Réservations et factures : {CONSERVATION.reservations}</li>
          <li>Contacts sans réservation : {CONSERVATION.prospects}</li>
        </ul>
      </section>

      <section>
        <h2>Où sont vos données</h2>
        <p>
          Elles sont enregistrées dans une base {BASE_DONNEES.nom} située à{" "}
          {BASE_DONNEES.region}.
        </p>
        {TRAITEMENT_HORS_UE && (
          <p>
            <strong>Transfert hors Union européenne :</strong> le site est
            hébergé par {HEBERGEUR.nom} et ses serveurs de traitement se
            trouvent actuellement aux États-Unis. Vos données y transitent donc
            lors de chaque consultation, dans le cadre des garanties
            contractuelles prévues par cet hébergeur. Nous travaillons à
            déplacer ce traitement en Europe.
          </p>
        )}
      </section>

      <section>
        <h2>Qui d&apos;autre y a accès</h2>
        <ul>
          <li>
            <strong>Stripe</strong> — paiement et empreinte de caution. Reçoit
            vos nom, email et données de carte, que nous ne voyons jamais.
          </li>
          <li>
            <strong>{HEBERGEUR.nom}</strong> — hébergement du site.
          </li>
          <li>
            <strong>LWS</strong> — messagerie, pour l&apos;envoi des emails de
            confirmation.
          </li>
        </ul>
      </section>

      <section>
        <h2>Vos droits</h2>
        <p>
          Vous pouvez demander à <strong>consulter</strong>, <strong>corriger</strong>,{" "}
          <strong>effacer</strong> ou <strong>récupérer</strong> vos données, et{" "}
          <strong>vous opposer</strong> à leur traitement. Écrivez simplement à{" "}
          <a href={`mailto:${SITE.email}`}>{SITE.email}</a> : nous répondons sous
          un mois.
        </p>
        <p>
          Si notre réponse ne vous satisfait pas, vous pouvez saisir la{" "}
          <a href="https://www.cnil.fr" target="_blank" rel="noopener noreferrer">
            CNIL
          </a>
          .
        </p>
      </section>

      <p className="muted">
        <Link href="/mentions-legales" className="lien-fleche">
          Mentions légales <span aria-hidden="true">→</span>
        </Link>
      </p>
    </div>
  );
}
