"use client";

import { useEffect, useState } from "react";

// Affiche la vidéo d'ambiance en arrière-plan des cartes flottantes du hero
// si le fichier charge et que l'utilisateur n'a pas demandé de réduire les
// animations ; sinon replie sur l'image fixe ; sinon n'affiche rien (comme
// pour ModelPhoto, tant que les fichiers ne sont pas encore déposés dans
// public/).
export default function HeroMedia({ imageUrl, imageAlt, videoUrl }) {
  // Monté uniquement côté client : si le <video>/<img> avait son src dès le
  // rendu serveur, un 404 très rapide (localhost) peut se produire avant que
  // React n'ait attaché le gestionnaire onError après l'hydratation, et le
  // repli ne se déclenche jamais. En ne rendant la balise média qu'après le
  // montage, l'écouteur existe forcément avant que le navigateur ne lance la
  // requête.
  const [mounted, setMounted] = useState(false);
  const [imageFailed, setImageFailed] = useState(false);
  const [videoFailed, setVideoFailed] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    setMounted(true);
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReducedMotion(mq.matches);
    const onChange = (e) => setReducedMotion(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  if (!mounted) return null;

  const hasImage = Boolean(imageUrl) && !imageFailed;
  const showVideo = Boolean(videoUrl) && !videoFailed && !reducedMotion;

  if (!hasImage && !showVideo) return null;

  return (
    <div className="hero-media" aria-hidden="true">
      {showVideo ? (
        <video
          className="hero-media-fill"
          src={videoUrl}
          poster={hasImage ? imageUrl : undefined}
          autoPlay
          muted
          loop
          playsInline
          onError={() => setVideoFailed(true)}
        />
      ) : (
        hasImage && (
          <img
            className="hero-media-fill"
            src={imageUrl}
            alt={imageAlt}
            onError={() => setImageFailed(true)}
          />
        )
      )}
    </div>
  );
}
