"use client";

import { useEffect, useRef, useState } from "react";
import { checkAnswer } from "../lib/survey";
import { submitSurvey } from "./survey-actions";

// Enquête de marché, affichée dès l'arrivée sur le site, **une question par
// écran**. Un questionnaire de neuf questions présenté d'un bloc décourage ;
// présenté une par une, chaque écran paraît court et la barre de progression
// donne envie d'aller au bout.
//
// Trois garde-fous, dont deux sont juridiques :
//  - refusable en un clic (bouton, touche Échap, clic sur le fond). Un
//    consentement contraint est nul au sens du RGPD.
//  - ne réapparaît jamais après une réponse ou un refus.
//  - consentement explicite au dernier écran, finalité et durée annoncées.
//
// Les questions viennent de la base : elles sont passées en propriété par la
// page, qui les lit côté serveur.

const MEMOIRE = "lootaclim-enquete";
const CONSERVATION = "12 mois";

export default function SurveyModal({ questions = [] }) {
  const [visible, setVisible] = useState(false);
  const [etape, setEtape] = useState(0);
  const [reponses, setReponses] = useState({});
  const [erreur, setErreur] = useState(null);
  const [consent, setConsent] = useState(false);
  const [envoi, setEnvoi] = useState(false);
  const [merci, setMerci] = useState(false);
  const premierRef = useRef(null);

  const total = questions.length;
  const derniere = etape >= total; // dernier écran : consentement et envoi
  const question = questions[etape];

  useEffect(() => {
    if (questions.length === 0) return;
    let dejaVu = null;
    try {
      dejaVu = window.localStorage.getItem(MEMOIRE);
    } catch {
      return; // navigation privée ou stockage refusé : on n'insiste pas
    }
    if (!dejaVu) setVisible(true);
  }, [questions.length]);

  useEffect(() => {
    if (!visible) return;
    const surTouche = (e) => {
      if (e.key === "Escape") fermer("refuse");
    };
    document.addEventListener("keydown", surTouche);
    const avant = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", surTouche);
      document.body.style.overflow = avant;
    };
  }, [visible]);

  // À chaque changement d'écran, le focus revient en haut de la fenêtre :
  // sans ça, un utilisateur au clavier resterait perdu à l'écran précédent.
  useEffect(() => {
    premierRef.current?.focus();
    setErreur(null);
  }, [etape]);

  function memoriser(valeur) {
    try {
      window.localStorage.setItem(MEMOIRE, valeur);
    } catch {
      // Sans stockage, la fenêtre réapparaîtra. Tant pis : on ne bloque pas.
    }
  }

  function fermer(valeur) {
    memoriser(valeur);
    setVisible(false);
  }

  function suivant() {
    const message = checkAnswer(question, reponses[question.id]);
    if (message) {
      setErreur(message);
      return;
    }
    setEtape(etape + 1);
  }

  // Un choix unique fait avancer tout seul : un clic au lieu de deux, sur
  // neuf écrans ça change tout.
  function choisir(choixId) {
    setReponses({ ...reponses, [question.id]: choixId });
    setErreur(null);
    setTimeout(() => setEtape((e) => e + 1), 180);
  }

  async function envoyer() {
    if (!consent) {
      setErreur("Merci de cocher la case pour envoyer vos réponses.");
      return;
    }
    setEnvoi(true);
    const resultat = await submitSurvey(reponses);
    setEnvoi(false);
    if (!resultat.ok) {
      setErreur(
        resultat.erreurs?.global ??
          "Certaines réponses n'ont pas été acceptées. Reprenez le questionnaire."
      );
      return;
    }
    memoriser("repondu");
    setMerci(true);
  }

  if (!visible || total === 0) return null;

  const progression = Math.round((Math.min(etape, total) / total) * 100);

  return (
    <div
      className="survey-fond"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) fermer("refuse");
      }}
    >
      <div className="survey" role="dialog" aria-modal="true" aria-labelledby="survey-titre">
        <button
          type="button"
          className="survey-fermer"
          onClick={() => fermer("refuse")}
          aria-label="Fermer sans répondre"
        >
          ✕
        </button>

        {merci ? (
          <div className="survey-merci">
            <h2 id="survey-titre" tabIndex={-1} ref={premierRef}>
              Merci beaucoup.
            </h2>
            <p>
              Vos réponses nous aident à choisir les bons modèles, les bons prix
              et les bons quartiers. C&apos;est précieux.
            </p>
            <button type="button" className="btn btn-primary" onClick={() => setVisible(false)}>
              Découvrir les climatiseurs
            </button>
          </div>
        ) : (
          <>
            <div className="survey-progression" aria-hidden="true">
              <span style={{ width: `${progression}%` }} />
            </div>
            <p className="survey-compteur">
              {derniere ? "Dernière étape" : `Question ${etape + 1} sur ${total}`}
            </p>

            {derniere ? (
              <div className="survey-ecran">
                <h2 id="survey-titre" tabIndex={-1} ref={premierRef}>
                  C&apos;est tout !
                </h2>
                <p className="survey-intro">
                  Nous sommes trois étudiants parisiens. Vos réponses nous servent
                  à décider quels climatiseurs acheter, à quel prix les louer et
                  dans quels quartiers livrer.
                </p>
                <label className="survey-consent">
                  <input
                    type="checkbox"
                    checked={consent}
                    onChange={(e) => setConsent(e.target.checked)}
                  />
                  <span>
                    J&apos;accepte que mes réponses soient conservées {CONSERVATION}{" "}
                    pour préparer le lancement de LOOTACLIM. Elles ne sont ni
                    vendues ni transmises, et je peux demander leur suppression à
                    tout moment.
                  </span>
                </label>
                {erreur && <p className="survey-erreur">{erreur}</p>}
                <div className="survey-navigation">
                  <button type="button" className="survey-retour" onClick={() => setEtape(etape - 1)}>
                    ← Retour
                  </button>
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={envoyer}
                    disabled={envoi}
                  >
                    {envoi ? "Envoi…" : "Envoyer mes réponses"}
                  </button>
                </div>
              </div>
            ) : (
              <div className="survey-ecran">
                <h2 id="survey-titre" tabIndex={-1} ref={premierRef}>
                  {question.label}
                </h2>
                {question.helper && <p className="survey-aide">{question.helper}</p>}

                {question.type === "choice" ? (
                  <div className="survey-choix">
                    {question.choices.map((c) => (
                      <button
                        type="button"
                        key={c.id}
                        className={reponses[question.id] === c.id ? "actif" : ""}
                        onClick={() => choisir(c.id)}
                      >
                        {c.label}
                      </button>
                    ))}
                  </div>
                ) : (
                  <input
                    type={question.type === "email" ? "email" : "text"}
                    className="survey-saisie"
                    placeholder={question.type === "email" ? "vous@exemple.fr" : ""}
                    value={reponses[question.id] ?? ""}
                    maxLength={question.type === "email" ? 120 : 60}
                    onChange={(e) =>
                      setReponses({ ...reponses, [question.id]: e.target.value })
                    }
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        suivant();
                      }
                    }}
                  />
                )}

                {erreur && <p className="survey-erreur">{erreur}</p>}

                <div className="survey-navigation">
                  {etape > 0 ? (
                    <button
                      type="button"
                      className="survey-retour"
                      onClick={() => setEtape(etape - 1)}
                    >
                      ← Retour
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="survey-retour"
                      onClick={() => fermer("refuse")}
                    >
                      Non merci
                    </button>
                  )}
                  <button type="button" className="btn btn-primary" onClick={suivant}>
                    {question.required ? "Continuer" : "Passer"}
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
