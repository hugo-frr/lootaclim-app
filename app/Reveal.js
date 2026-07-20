"use client";

import { useEffect, useRef, useState } from "react";

// Ajoute la classe "visible" dès que l'élément entre dans le viewport, une
// seule fois — utilisé pour l'apparition en fondu au scroll des sections de
// la page d'accueil (voir .reveal / .reveal.visible dans globals.css).
export default function Reveal({ children, className = "" }) {
  const ref = useRef(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { threshold: 0.15 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={ref} className={`reveal ${visible ? "visible" : ""} ${className}`}>
      {children}
    </div>
  );
}
