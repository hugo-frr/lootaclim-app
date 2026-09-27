"use client";

import { useRef, useState } from "react";

// Champs où l'on tape du texte : on attend que l'admin quitte le champ (ou
// appuie sur Entrée) avant d'enregistrer. Enregistrer à chaque frappe
// remplirait l'historique des machines de notes à moitié écrites.
function estSaisieTexte(el) {
  if (el.tagName === "TEXTAREA") return true;
  if (el.tagName !== "INPUT") return false;
  return !["checkbox", "radio", "file", "hidden"].includes(el.type);
}

// Formulaire du back-office qui s'enregistre tout seul, sans bouton.
// Un choix dans une liste, une case ou une image : enregistré aussitôt.
// Un texte : enregistré en quittant le champ ou avec Entrée.
// L'action reçoit le champ auto=1 et renvoie { error } au lieu de rediriger,
// pour que la page ne remonte pas en haut à chaque modification.
export default function AutoSaveForm({ action, className, children }) {
  const formRef = useRef(null);
  const modifie = useRef(false);
  const enCours = useRef(false);
  const aRefaire = useRef(false);
  const [etat, setEtat] = useState(null); // null | "encours" | "ok" | { erreur }

  async function enregistrer() {
    const form = formRef.current;
    if (!form) return;
    if (enCours.current) {
      aRefaire.current = true;
      return;
    }
    modifie.current = false;
    if (!form.reportValidity()) {
      setEtat({ erreur: "Non enregistré : un champ est à corriger." });
      return;
    }
    enCours.current = true;
    setEtat("encours");
    let erreur = null;
    try {
      const data = new FormData(form);
      data.set("auto", "1");
      const resultat = await action(data);
      erreur = resultat?.error ?? null;
      // Sans ça, l'image choisie repartirait à chaque enregistrement suivant.
      if (!erreur) form.querySelectorAll('input[type="file"]').forEach((i) => (i.value = ""));
    } catch {
      erreur = "Enregistrement impossible. Vérifiez la connexion puis réessayez.";
    }
    enCours.current = false;
    setEtat(erreur ? { erreur } : "ok");
    if (aRefaire.current) {
      aRefaire.current = false;
      enregistrer();
    }
  }

  return (
    <form
      ref={formRef}
      className={className}
      onSubmit={(e) => {
        e.preventDefault();
        enregistrer();
      }}
      onChange={(e) => {
        if (estSaisieTexte(e.target)) {
          modifie.current = true;
          setEtat(null);
        } else {
          enregistrer();
        }
      }}
      onBlur={(e) => {
        if (modifie.current && estSaisieTexte(e.target)) enregistrer();
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" && e.target.tagName === "INPUT" && estSaisieTexte(e.target)) {
          e.preventDefault();
          if (modifie.current) enregistrer();
        }
      }}
    >
      {children}
      <span className={`autosave-etat${etat?.erreur ? " erreur" : ""}`} role="status">
        {etat === "encours" && "Enregistrement…"}
        {etat === "ok" && "Enregistré ✓"}
        {etat?.erreur}
      </span>
    </form>
  );
}
