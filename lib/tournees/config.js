// Réglages des tournées. Tout ce qu'on pourrait vouloir ajuster après
// quelques semaines de terrain est ici, et nulle part ailleurs.

// ⚠️ ADRESSE PROVISOIRE, choisie au hasard dans le centre de Paris en
// attendant le vrai entrepôt. À remplacer, coordonnées comprises (les
// obtenir sur https://adresse.data.gouv.fr).
export const ENTREPOT = {
  nom: "Entrepôt (adresse provisoire)",
  adresse: "12 Rue de Rivoli, 75004 Paris",
  lat: 48.855602,
  lng: 2.35995,
};

// Installer ou démonter un climatiseur mobile, sur place.
export const TEMPS_SUR_PLACE_MIN = 15;
// Porter la machine dans l'escalier.
export const SUPPLEMENT_SANS_ASCENSEUR_MIN = 10;

// Machines transportables en même temps dans un véhicule. Une seule
// tournée par jour et par livreur : pas de retour recharger à mi-journée.
export const CAPACITE_VEHICULE = 6;

// Journée du livreur, en minutes depuis minuit. Couvre les créneaux
// clients de 9 h à 22 h, avec le temps de rejoindre le premier et de
// rentrer du dernier.
export const DEBUT_JOURNEE_MIN = 8 * 60 + 30;
export const FIN_JOURNEE_MIN = 22 * 60 + 30;

// Estimation sans service de calcul d'itinéraire : les rues ne vont pas en
// ligne droite (facteur de détour) et Paris roule lentement.
export const VITESSE_MOYENNE_KMH = 18;
export const FACTEUR_DETOUR = 1.4;

// Une couleur par livreur sur la carte, lisibles sur fond clair.
export const COULEURS_TOURNEES = ["#2e5fa8", "#e4572e", "#17a34a", "#9333ea", "#d97706", "#0891b2", "#db2777"];
