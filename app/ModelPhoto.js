"use client";

import { useState } from "react";

// Affiche la photo du modèle si l'URL en base charge réellement, sinon un
// bloc "photo à venir" — utile tant que les fichiers ne sont pas encore
// déposés dans public/images/ (ou si une URL est un jour cassée).
export default function ModelPhoto({ url, alt, className = "model-photo" }) {
  const [failed, setFailed] = useState(false);

  if (!url || failed) {
    return <div className={`${className} placeholder`}>Photo à venir</div>;
  }

  return (
    <div className={className}>
      <img src={url} alt={alt} onError={() => setFailed(true)} />
    </div>
  );
}
