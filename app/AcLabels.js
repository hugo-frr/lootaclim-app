"use client";

import { forwardRef, useEffect, useState } from "react";

// Étiquettes de la vue éclatée. Ce sont de vrais textes HTML, jamais des
// textures : ils restent nets à tout zoom et sont lus par les lecteurs d'écran.
//
// Deux régimes. Quand la scène 3D tourne, AcScene place chaque étiquette au
// bon endroit à l'écran par projection et pilote l'opacité du conteneur.
// Sinon — animations réduites, WebGL absent, Three.js non chargé — la liste
// reste dans le flux normal de la page : l'information n'est jamais perdue.

const ETIQUETTES = [
  { id: "intake", texte: "Air chaud aspiré" },
  { id: "circuit", texte: "Refroidi par le circuit" },
  { id: "output", texte: "Soufflé frais" },
  { id: "exhaust", texte: "Air chaud évacué par la fenêtre" },
];

const AcLabels = forwardRef(function AcLabels({ forceStatic = false }, ref) {
  const [flottant, setFlottant] = useState(false);

  useEffect(() => {
    // En mode vidéo il n'y a aucune scène 3D pour porter les étiquettes :
    // elles restent en liste, quoi qu'il arrive.
    if (forceStatic) return;
    // Le positionnement flottant n'a de sens que si la scène peut tourner.
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) return;
    const test = document.createElement("canvas");
    const gl = test.getContext("webgl");
    if (gl) setFlottant(true);
  }, [forceStatic]);

  return (
    <ul ref={ref} className={`ac-labels ${flottant ? "floating" : ""}`}>
      {ETIQUETTES.map((e) => (
        <li key={e.id} data-ac-label={e.id}>
          {e.texte}
        </li>
      ))}
    </ul>
  );
});

export default AcLabels;
