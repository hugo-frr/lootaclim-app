"use client";

import { useEffect, useState } from "react";
import { lienGuidage } from "../../../lib/tournees/navigation";

// Le livreur choisit une fois son application de guidage ; son téléphone
// s'en souvient. Préférence de confort : si le stockage est indisponible,
// on retombe sur Google Maps sans rien casser.
const CLE = "lc-appli-gps";
const EVENEMENT = "lc-appli-gps";

function lire() {
  try {
    return localStorage.getItem(CLE) === "waze" ? "waze" : "google";
  } catch {
    return "google";
  }
}

function useAppli() {
  const [appli, setAppli] = useState("google");
  useEffect(() => {
    setAppli(lire());
    const maj = () => setAppli(lire());
    window.addEventListener(EVENEMENT, maj);
    return () => window.removeEventListener(EVENEMENT, maj);
  }, []);
  return appli;
}

export function ChoixAppli() {
  const appli = useAppli();
  const choisir = (valeur) => {
    try {
      localStorage.setItem(CLE, valeur);
    } catch {}
    window.dispatchEvent(new Event(EVENEMENT));
  };
  return (
    <div className="choix-appli" role="radiogroup" aria-label="Application de guidage">
      <span className="muted">Guidage :</span>
      {[
        ["google", "Google Maps"],
        ["waze", "Waze"],
      ].map(([valeur, nom]) => (
        <button
          key={valeur}
          type="button"
          role="radio"
          aria-checked={appli === valeur}
          className={appli === valeur ? "actif" : ""}
          onClick={() => choisir(valeur)}
        >
          {nom}
        </button>
      ))}
    </div>
  );
}

export function LienGuidage({ point, className, children }) {
  const appli = useAppli();
  return (
    <a href={lienGuidage(appli, point)} target="_blank" rel="noopener noreferrer" className={className}>
      {children}
    </a>
  );
}
