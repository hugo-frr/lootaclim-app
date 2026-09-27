"use client";

import { useEffect, useRef } from "react";
import "maplibre-gl/dist/maplibre-gl.css";

// Carte des tournées : un trait et des pastilles numérotées par livreur.
// Fond OpenFreeMap (OpenStreetMap), gratuit et sans clé.
const STYLE = "https://tiles.openfreemap.org/styles/liberty";

function pastille(texte, couleur, fait) {
  const el = document.createElement("div");
  el.className = `carte-pastille${fait ? " fait" : ""}`;
  el.style.background = fait ? "#9aa5b8" : couleur;
  el.textContent = texte;
  return el;
}

export default function CarteTournees({ tournees, entrepot }) {
  const conteneur = useRef(null);
  const cle = JSON.stringify({ tournees, entrepot });

  useEffect(() => {
    let carte = null;
    let annule = false;
    import("maplibre-gl").then(({ default: maplibregl }) => {
      if (annule || !conteneur.current) return;
      carte = new maplibregl.Map({
        container: conteneur.current,
        style: STYLE,
        center: [entrepot.lng, entrepot.lat],
        zoom: 12,
        attributionControl: { compact: true },
      });
      carte.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");

      const limites = new maplibregl.LngLatBounds([entrepot.lng, entrepot.lat], [entrepot.lng, entrepot.lat]);
      new maplibregl.Marker({ element: pastille("⌂", "#05122e", false) })
        .setLngLat([entrepot.lng, entrepot.lat])
        .setPopup(new maplibregl.Popup({ offset: 14 }).setText(entrepot.nom))
        .addTo(carte);

      for (const t of tournees) {
        for (const p of t.points) {
          limites.extend([p.lng, p.lat]);
          new maplibregl.Marker({ element: pastille(String(p.numero), t.couleur, p.fait) })
            .setLngLat([p.lng, p.lat])
            // setText et non setHTML : le nom du client vient d'un formulaire.
            .setPopup(new maplibregl.Popup({ offset: 14 }).setText(p.label))
            .addTo(carte);
        }
      }

      carte.on("load", () => {
        tournees.forEach((t, i) => {
          const depot = [entrepot.lng, entrepot.lat];
          const ligne = t.trace ?? [depot, ...t.points.map((p) => [p.lng, p.lat]), depot];
          carte.addSource(`tournee-${i}`, {
            type: "geojson",
            data: { type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: ligne } },
          });
          carte.addLayer({
            id: `tournee-${i}`,
            type: "line",
            source: `tournee-${i}`,
            layout: { "line-join": "round", "line-cap": "round" },
            paint: {
              "line-color": t.couleur,
              "line-width": 4,
              "line-opacity": 0.8,
              // Sans tracé routier, des pointillés disent « à vol d'oiseau ».
              ...(t.trace ? {} : { "line-dasharray": [1.5, 1.5] }),
            },
          });
        });
      });
      carte.fitBounds(limites, { padding: 48, maxZoom: 15, duration: 0 });
    });
    return () => {
      annule = true;
      carte?.remove();
    };
    // cle résume tournees + entrepot : on ne recrée la carte que s'ils changent.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cle]);

  return <div ref={conteneur} className="carte-tournees" role="region" aria-label="Carte des tournées" />;
}
