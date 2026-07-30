"use client";

import { useRef, useState } from "react";

// Création d'une question. Composant client pour deux raisons :
//  - vider les champs après l'envoi (une action serveur ne réinitialise pas le
//    formulaire toute seule, et retrouver ses anciennes valeurs est déroutant) ;
//  - n'afficher la saisie des choix que si le type le justifie, et permettre de
//    tous les créer d'un coup — cliquer « Ajouter » vingt-quatre fois pour les
//    arrondissements serait absurde.
export default function AddQuestionForm({ action }) {
  const formRef = useRef(null);
  const [type, setType] = useState("choice");
  const [envoi, setEnvoi] = useState(false);

  return (
    <form
      ref={formRef}
      className="question-edition"
      action={async (formData) => {
        setEnvoi(true);
        await action(formData);
        formRef.current?.reset();
        setType("choice");
        setEnvoi(false);
      }}
    >
      <div className="field">
        <label htmlFor="nouvelle-label">Question</label>
        <input id="nouvelle-label" name="label" required placeholder="Votre question…" />
      </div>

      <div className="field">
        <label htmlFor="nouvelle-helper">Précision sous la question (facultatif)</label>
        <input id="nouvelle-helper" name="helper" />
      </div>

      <div className="field">
        <label htmlFor="nouvelle-type">Type de réponse</label>
        <select
          id="nouvelle-type"
          name="type"
          value={type}
          onChange={(e) => setType(e.target.value)}
        >
          <option value="choice">Choix multiple</option>
          <option value="text">Réponse libre</option>
          <option value="email">Adresse email</option>
        </select>
      </div>

      {type === "choice" && (
        <div className="field">
          <label htmlFor="nouvelle-choix">Choix proposés — un par ligne</label>
          <textarea
            id="nouvelle-choix"
            name="choices"
            rows={5}
            placeholder={"Locataire\nPropriétaire"}
          />
          <p className="muted" style={{ marginTop: 6 }}>
            Vous pourrez en ajouter ou en retirer ensuite.
          </p>
        </div>
      )}

      <label className="checkbox-field">
        <input type="checkbox" name="required" defaultChecked />
        Réponse obligatoire
      </label>

      <button type="submit" className="btn-small" disabled={envoi}>
        {envoi ? "Création…" : "Créer la question"}
      </button>
    </form>
  );
}
