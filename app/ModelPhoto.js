"use client";

import { useEffect, useRef, useState } from "react";

// Affiche la photo du modèle si l'URL en base charge réellement, sinon un
// bloc "photo à venir" — utile tant que les fichiers ne sont pas encore
// déposés dans public/images/ (ou si une URL est un jour cassée).
export default function ModelPhoto({ url, alt, className = "model-photo" }) {
  const [failed, setFailed] = useState(false);
  const imgRef = useRef(null);

  // Une image absente peut échouer avant que React ne branche onError (rendu
  // serveur) : on vérifie donc aussi son état au montage.
  useEffect(() => {
    const img = imgRef.current;
    if (img && img.complete && img.naturalWidth === 0) setFailed(true);
  }, [url]);

  if (!url || failed) {
    return <div className={`${className} placeholder`}>Photo à venir</div>;
  }

  return (
    <div className={className}>
      <img ref={imgRef} src={url} alt={alt} onError={() => setFailed(true)} />
    </div>
  );
}
