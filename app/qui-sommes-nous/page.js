import Link from "next/link";
import Reveal from "../Reveal";
import ModelPhoto from "../ModelPhoto";

export const metadata = {
  title: "Qui sommes-nous — LOOTACLIM",
  description:
    "Trois étudiants, un studio de 20 m² sous la canicule, et une conviction : un climatiseur utilisé trente jours par an se loue, il ne s'achète pas.",
};

// Les trois temps du récit. Le contenu vient d'Hugo ; rien n'est inventé ici
// au-delà de la mise en forme.
const RECIT = [
  {
    titre: "Le problème",
    texte:
      "Été 2026, un studio de 20 m² à Paris. Plus de 30 °C à l'intérieur, jour et nuit. Impossible de dormir. Impossible de travailler. Impossible de se rafraîchir.",
  },
  {
    titre: "Le calcul",
    texte:
      "Notre première idée a été d'acheter un climatiseur. On a vite déchanté : trop cher pour trois étudiants, trop encombrant pour 20 m², et surtout utilisé une trentaine de jours par an. Le reste de l'année, un meuble qu'on enjambe.",
  },
  {
    titre: "La solution",
    texte:
      "Un appareil dont on a besoin trente jours par an ne s'achète pas : il se loue. On a monté LOOTACLIM pour que personne à Paris n'ait à choisir entre transpirer tout l'été et acheter une machine qui dormira onze mois dans un placard.",
  },
];

const EQUIPE = [
  { nom: "Cian Higgins", role: "École d'ingénieurs" },
  { nom: "Hugo Férré", role: "ECE Paris" },
  { nom: "Romain Despinasse", role: "ESSCA Paris" },
];

export default function QuiSommesNous() {
  return (
    <div className="stack">
      <Reveal>
        <span className="eyebrow">Notre histoire</span>
        <h1 className="page-title">Trois étudiants, un studio, une canicule</h1>
        <p className="page-lead">
          LOOTACLIM n&apos;est pas née d&apos;une étude de marché. Elle est née
          d&apos;un été où on ne dormait plus.
        </p>
      </Reveal>

      <Reveal>
        <p className="about-figure about-figure-lg">
          <strong>+30&nbsp;°C</strong>
          <span>dans 20 m², été 2026</span>
        </p>
      </Reveal>

      <Reveal>
        <div className="story">
          {RECIT.map((r) => (
            <article className="story-beat" key={r.titre}>
              <h2>{r.titre}</h2>
              <p>{r.texte}</p>
            </article>
          ))}
        </div>
      </Reveal>

      <Reveal>
        <ModelPhoto
          className="story-photo"
          url="/images/appartement.jpg"
          alt="Le studio de 20 m² où LOOTACLIM est née"
        />
      </Reveal>

      <Reveal>
        <span className="eyebrow">L&apos;équipe</span>
        <h2 className="section-title">Deux écoles d&apos;ingénieurs, une école de commerce</h2>
        <div className="team">
          <ModelPhoto
            className="about-photo"
            url="/images/equipe.jpg"
            alt="Cian Higgins, Hugo Férré et Romain Despinasse"
          />
          <div>
            <ul className="team-list">
              {EQUIPE.map((m) => (
                <li key={m.nom}>
                  <strong>{m.nom}</strong>
                  <span>{m.role}</span>
                </li>
              ))}
            </ul>
            <p className="team-note">
              On répond nous-mêmes au téléphone, on livre nous-mêmes, et on
              connaît chaque machine du parc. C&apos;est l&apos;avantage
              d&apos;être trois.
            </p>
          </div>
        </div>
      </Reveal>

      <Reveal className="home-cta">
        <h2 className="section-title">Prêt à retrouver la fraîcheur ?</h2>
        <Link href="/#modeles" className="btn btn-primary">
          Voir les climatiseurs
        </Link>
      </Reveal>
    </div>
  );
}
