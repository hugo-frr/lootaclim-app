"use client";

import { useRef, useState } from "react";

// Ajout de choix à une question existante. Accepte plusieurs lignes d'un coup,
// et vide le champ après l'envoi.
export default function AddChoiceForm({ action, questionId }) {
  const formRef = useRef(null);
  const [envoi, setEnvoi] = useState(false);

  return (
    <form
      ref={formRef}
      className="question-ajout-choix"
      action={async (formData) => {
        setEnvoi(true);
        await action(formData);
        formRef.current?.reset();
        setEnvoi(false);
      }}
    >
      <input type="hidden" name="questionId" value={questionId} />
      <textarea
        name="label"
        rows={2}
        required
        placeholder="Nouveau choix… (un par ligne pour en ajouter plusieurs)"
      />
      <button type="submit" className="btn-small" disabled={envoi}>
        {envoi ? "Ajout…" : "Ajouter"}
      </button>
    </form>
  );
}
