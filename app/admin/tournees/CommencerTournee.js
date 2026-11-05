"use client";

import { useRef, useState } from "react";
import { commencerTournee } from "./actions";

// Au départ, on demande la position du téléphone pour ordonner les arrêts
// depuis là où le livreur est vraiment. Refus ou lenteur : on part de
// l'entrepôt, sans bloquer.
export default function CommencerTournee({ tourId }) {
  const form = useRef(null);
  const [enCours, setEnCours] = useState(false);

  function envoyer(position) {
    if (position) {
      form.current.lat.value = position.coords.latitude;
      form.current.lng.value = position.coords.longitude;
    }
    form.current.requestSubmit();
  }

  function demarrer() {
    setEnCours(true);
    if (!navigator.geolocation) return envoyer(null);
    navigator.geolocation.getCurrentPosition(envoyer, () => envoyer(null), {
      enableHighAccuracy: true,
      timeout: 8000,
      maximumAge: 60000,
    });
  }

  return (
    <form ref={form} action={commencerTournee}>
      <input type="hidden" name="id" value={tourId} />
      <input type="hidden" name="lat" defaultValue="" />
      <input type="hidden" name="lng" defaultValue="" />
      <button type="button" className="btn btn-primary btn-large" onClick={demarrer} disabled={enCours}>
        {enCours ? "Calcul de votre trajet…" : "Commencer ma tournée"}
      </button>
    </form>
  );
}
