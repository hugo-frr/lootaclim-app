"use client";

import { useEffect, useRef, useState } from "react";
import { scrubProgress, videoTimeAt, shouldSeek } from "../lib/scrollVideo";
import { lerp } from "../lib/backdrop";

// Vidéo de fond que le défilement fait avancer, sur le principe des pages
// produit d'Apple. Elle n'est jamais en lecture automatique : c'est le scroll
// qui déplace la tête de lecture.
//
// Le fichier doit être réencodé avec une image-clé à chaque image (ffmpeg -g 1),
// sinon chaque saut force le décodage depuis l'image-clé précédente et le
// défilement saccade. Voir docs/motion-brief-climatiseur.md.

export default function ScrollVideo({ src, poster }) {
  const videoRef = useRef(null);
  const [casse, setCasse] = useState(false);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !src) return;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    // Animations réduites : l'affiche seule, figée. Aucune boucle, aucun
    // écouteur de défilement.
    if (reduced) return;

    let image = null;
    let lisse = 0;

    function boucle() {
      const cible = videoTimeAt(
        scrubProgress(
          window.scrollY,
          document.documentElement.scrollHeight,
          window.innerHeight
        ),
        video.duration
      );
      // Interpolation : sans elle, un défilement brusque ferait bondir la
      // vidéo au lieu de la faire glisser.
      lisse = lerp(lisse, cible, 0.12);
      if (shouldSeek(video.currentTime, lisse, 1 / 60)) {
        video.currentTime = lisse;
      }
      image = requestAnimationFrame(boucle);
    }

    const surVisibilite = () => {
      if (document.hidden) {
        if (image !== null) cancelAnimationFrame(image);
        image = null;
      } else if (image === null) {
        image = requestAnimationFrame(boucle);
      }
    };

    document.addEventListener("visibilitychange", surVisibilite);
    image = requestAnimationFrame(boucle);

    return () => {
      document.removeEventListener("visibilitychange", surVisibilite);
      if (image !== null) cancelAnimationFrame(image);
    };
  }, [src]);

  // Pas de fichier, ou fichier illisible : on ne rend rien et le dégradé CSS
  // du body reste visible.
  if (!src || casse) return null;

  return (
    <video
      ref={videoRef}
      className="scroll-video"
      src={src}
      poster={poster}
      muted
      playsInline
      preload="auto"
      aria-hidden="true"
      onError={() => setCasse(true)}
    />
  );
}
