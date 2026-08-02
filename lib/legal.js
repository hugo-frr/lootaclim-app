// Informations légales du site, rassemblées ici pour n'avoir qu'un seul
// endroit à corriger. Les pages Mentions légales, Confidentialité et Contact
// les lisent toutes.

// ⚠️ À BASCULER À FALSE le jour de l'ouverture commerciale.
// Tant que c'est vrai, le site annonce clairement qu'aucune réservation n'est
// possible et les boutons Réserver sont neutralisés. C'est la stricte vérité
// aujourd'hui : les machines sont retirées du parc, Stripe est en mode test,
// et aucune société n'est encore immatriculée.
export const PRE_LANCEMENT = true;

export const SITE = {
  nom: "LOOTACLIM",
  // ⚠️ Cette boîte doit exister chez LWS avant la mise en ligne des pages.
  // Une adresse publiée qui rejette les messages est pire que pas d'adresse :
  // elle empêche d'exercer ses droits, ce que le RGPD n'admet pas.
  email: "contact@lootaclim.fr",
  editeurs: ["Hugo Férré", "Cian Higgins", "Romain Despinasse"],
  directeurPublication: "Hugo Férré",
  // Statut réel au 02/08/2026. À remplacer par la forme juridique, le SIRET et
  // l'adresse du siège dès l'immatriculation.
  statut: "Société en cours de création",
  siret: null,
  adresse: null,
};

export const HEBERGEUR = {
  nom: "Vercel Inc.",
  adresse: "340 S Lemon Ave #4133, Walnut, CA 91789, États-Unis",
  site: "https://vercel.com",
};

export const BASE_DONNEES = {
  nom: "Neon (PostgreSQL)",
  region: "Francfort, Allemagne — Union européenne",
};

// Les fonctions du site s'exécutent aujourd'hui aux États-Unis (région iad1),
// ce qui constitue un transfert hors Union européenne. À corriger en réglant
// la région d'exécution sur Francfort dans Vercel — l'option demande le
// forfait Pro, nécessaire de toute façon pour un usage commercial.
export const TRAITEMENT_HORS_UE = true;

// Durées de conservation annoncées, à tenir réellement.
export const CONSERVATION = {
  enquete: "12 mois",
  reservations: "5 ans après la fin de la location (obligation comptable)",
  prospects: "3 ans après le dernier contact",
};
