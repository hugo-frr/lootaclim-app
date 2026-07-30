"use client";

import { useEffect, useRef, useState } from "react";
import { SURVEY_QUESTIONS } from "../lib/survey";
import { submitSurvey } from "./survey-actions";

// Enquête de marché, affichée dès l'arrivée sur le site.
//
// Trois garde-fous, dont deux sont juridiques :
//  - refusable en un clic (bouton, touche Échap, clic sur le fond). Un
//    consentement contraint est nul au sens du RGPD : les réponses seraient
//    inexploitables.
//  - ne réapparaît jamais après une réponse ou un refus.
//  - consentement explicite, case non pré-cochée, finalité et durée annoncées.
//
// La fenêtre est posée par le navigateur après le montage : le HTML envoyé par
// le serveur n'est pas modifié, donc le contenu reste lisible par les moteurs
// de recherche.

const MEMOIRE = "lootaclim-enquete";
const CONSERVATION = "12 mois";

export default function SurveyModal() {
  const [visible, setVisible] = useState(false);
  const [reponses, setReponses] = useState({});
  const [email, setEmail] = useState("");
  const [consent, setConsent] = useState(false);
  const [erreurs, setErreurs] = useState({});
  const [envoi, setEnvoi] = useState(false);
  const [merci, setMerci] = useState(false);
  const dialogueRef = useRef(null);
  const premierRef = useRef(null);

  useEffect(() => {
    let dejaVu = null;
    try {
      dejaVu = window.localStorage.getItem(MEMOIRE);
    } catch {
      // Navigation privée ou stockage refusé : on n'insiste pas.
      return;
    }
    if (!dejaVu) setVisible(true);
  }, []);

  // Ferme sur Échap, et empêche le défilement de la page derrière.
  useEffect(() => {
    if (!visible) return;
    const surTouche = (e) => {
      if (e.key === "Escape") fermer("refuse");
    };
    document.addEventListener("keydown", surTouche);
    const avant = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    premierRef.current?.focus();
    return () => {
      document.removeEventListener("keydown", surTouche);
      document.body.style.overflow = avant;
    };
  }, [visible]);

  function memoriser(valeur) {
    try {
      window.localStorage.setItem(MEMOIRE, valeur);
    } catch {
      // Sans stockage, la fenêtre réapparaîtra : tant pis, on ne bloque pas.
    }
  }

  function fermer(valeur) {
    memoriser(valeur);
    setVisible(false);
  }

  async function envoyer(e) {
    e.preventDefault();
    if (!consent) {
      setErreurs({ consent: "Merci de cocher la case pour envoyer vos réponses." });
      return;
    }
    setEnvoi(true);
    const resultat = await submitSurvey({ ...reponses, email });
    setEnvoi(false);
    if (!resultat.ok) {
      setErreurs(resultat.erreurs);
      return;
    }
    memoriser("repondu");
    setMerci(true);
  }

  if (!visible) return null;

  return (
    <div
      className="survey-fond"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) fermer("refuse");
      }}
    >
      <div
        className="survey"
        role="dialog"
        aria-modal="true"
        aria-labelledby="survey-titre"
        ref={dialogueRef}
      >
        <button
          type="button"
          className="survey-fermer"
          onClick={() => fermer("refuse")}
          aria-label="Fermer sans répondre"
          ref={premierRef}
        >
          ✕
        </button>

        {merci ? (
          <div className="survey-merci">
            <h2 id="survey-titre">Merci beaucoup.</h2>
            <p>
              Vos réponses nous aident à choisir les bons modèles, les bons prix
              et les bons quartiers. C&apos;est précieux.
            </p>
            <button type="button" className="btn btn-primary" onClick={() => setVisible(false)}>
              Découvrir les climatiseurs
            </button>
          </div>
        ) : (
          <form onSubmit={envoyer}>
            <span className="eyebrow">2 minutes</span>
            <h2 id="survey-titre">Aidez-nous à lancer LOOTACLIM</h2>
            <p className="survey-intro">
              Nous sommes trois étudiants parisiens. Vos réponses nous servent à
              décider quels climatiseurs acheter, à quel prix les louer et dans
              quels quartiers livrer. Rien n&apos;est vendu à personne.
            </p>

            {SURVEY_QUESTIONS.map((q) => (
              <fieldset className="survey-question" key={q.id}>
                <legend>{q.label}</legend>

                {q.free ? (
                  <input
                    type="text"
                    maxLength={q.maxLength}
                    placeholder={q.placeholder}
                    value={reponses[q.id] ?? ""}
                    onChange={(e) => setReponses({ ...reponses, [q.id]: e.target.value })}
                  />
                ) : (
                  <div className="survey-choix">
                    {q.choices.map((c) => (
                      <label key={c.value} className={reponses[q.id] === c.value ? "actif" : ""}>
                        <input
                          type="radio"
                          name={q.id}
                          value={c.value}
                          checked={reponses[q.id] === c.value}
                          onChange={() => setReponses({ ...reponses, [q.id]: c.value })}
                        />
                        {c.label}
                      </label>
                    ))}
                  </div>
                )}

                {erreurs[q.id] && <p className="survey-erreur">{erreurs[q.id]}</p>}
              </fieldset>
            ))}

            <fieldset className="survey-question">
              <legend>
                Votre email <span className="survey-facultatif">— facultatif</span>
              </legend>
              <input
                type="email"
                placeholder="Pour être prévenu du lancement"
                value={email}
                maxLength={120}
                onChange={(e) => setEmail(e.target.value)}
              />
              {erreurs.email && <p className="survey-erreur">{erreurs.email}</p>}
            </fieldset>

            <label className="survey-consent">
              <input
                type="checkbox"
                checked={consent}
                onChange={(e) => setConsent(e.target.checked)}
              />
              <span>
                J&apos;accepte que ces réponses soient conservées {CONSERVATION} pour
                préparer le lancement de LOOTACLIM. Elles ne sont ni vendues ni
                transmises. Vous pouvez demander leur suppression à tout moment.
              </span>
            </label>
            {erreurs.consent && <p className="survey-erreur">{erreurs.consent}</p>}
            {erreurs.global && <p className="survey-erreur">{erreurs.global}</p>}

            <div className="survey-actions">
              <button type="submit" className="btn btn-primary" disabled={envoi}>
                {envoi ? "Envoi…" : "Envoyer mes réponses"}
              </button>
              <button type="button" className="survey-passer" onClick={() => fermer("refuse")}>
                Non merci, je veux juste voir le site
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
