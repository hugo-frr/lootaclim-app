"use client";

import { useRef } from "react";
import AcScene from "./AcScene";
import AcLabels from "./AcLabels";

// Réunit la scène 3D et ses étiquettes : c'est ici que vit la ref partagée,
// impossible à créer depuis app/page.js qui est un composant serveur.
export default function AcStage({ sectionIds }) {
  const labelsRef = useRef(null);
  return (
    <>
      <AcScene sectionIds={sectionIds} labelsRef={labelsRef} />
      <AcLabels ref={labelsRef} />
    </>
  );
}
