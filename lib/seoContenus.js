// Les textes des pages SEO (travail de Romain, « Le SEO de A à Z », nov. 2026).
//
// Chaque page : chemin, title et meta (balises lues par Google), H1, bloc
// « En bref » (la réponse directe, reprise en priorité par les IA), puis des
// sections H2 avec leurs H3 éventuels, une FAQ et des liens « À voir aussi ».
//
// Les {repères} (ex. {seine.prix}) sont remplis avec les valeurs de la base :
// voir lib/seoGabarits.js. Ne jamais écrire un prix ou une surface en dur.
//
// Pour ajouter une page : ajouter un objet à PAGES_SEO. Elle apparaît
// automatiquement dans le site, le sitemap et les tests.

const DATE_ARTICLES = "2026-11-05";

// ---------------------------------------------------------------------------
// Pages par ville : chaque ville a son contexte local propre (Google pénalise
// les pages où seul le nom change), le reste suit une trame commune.
// ---------------------------------------------------------------------------
function pageVille({ chemin, parent, ville, dept, title, description, enBref, intro, quartiers, h2Local, texteLocal, choix, voirAussi }) {
  return {
    chemin,
    parent,
    nomCourt: ville,
    type: "ville",
    title,
    description,
    h1: `Location de climatiseur à ${ville} : livré et installé en 24h`,
    enBref,
    intro,
    sections: [
      {
        h2: `Livrez-vous dans tout ${ville} ?`,
        p: `Oui, partout à ${ville}, sur un créneau de 2 heures.`,
        h3: [{ titre: "Quartiers livrés", p: `${quartiers}.` }],
      },
      { h2: h2Local, p: texteLocal },
      { h2: "Quel climatiseur choisir pour votre logement ?", p: choix },
      {
        h2: `Combien coûte la location d'un climatiseur à ${ville} ?`,
        p: "Le même prix qu'à Paris : à partir de {seine.prix} € par jour pour SEINE, {rivoli.prix} € pour RIVOLI et {trocadero.prix} € pour TROCADÉRO. La livraison et la reprise coûtent {livraison} € par location.",
        liens: [{ href: "/tarifs", texte: "Voir tous nos tarifs" }],
      },
      {
        h2: "Comment se passe la livraison ?",
        p: "Nous livrons à votre adresse, installons le climatiseur et le kit fenêtre, puis le mettons en route.",
        liens: [{ href: "/comment-ca-marche", texte: "Comment ça marche, étape par étape" }],
      },
    ],
    faq: [
      { q: `En combien de temps êtes-vous livré à ${ville} ?`, r: "Sous 24h, sur un créneau de 2 heures." },
      { q: `Faut-il des travaux à ${ville} ?`, r: "Non, la gaine passe par la fenêtre avec un kit de calfeutrage." },
    ],
    voirAussi: [parent, ...voirAussi],
    dept,
  };
}

function pageDepartement({ chemin, nom, numero, title, description, villes, autres, voirAussi }) {
  return {
    chemin,
    parent: "/zones-de-livraison",
    nomCourt: `${nom} (${numero})`,
    type: "departement",
    title,
    description,
    h1: `Location de climatiseur ${numero === "93" ? "en" : numero === "94" ? "dans le" : "dans les"} ${nom} (${numero})`,
    enBref: `LOOTACLIM livre et installe des climatiseurs mobiles ${numero === "93" ? "en" : numero === "94" ? "dans le" : "dans les"} ${nom} (${numero}) sous 24h, sans travaux, à partir de {prixMin} € par jour.`,
    intro: `Vous habitez ou travaillez ${numero === "93" ? "en" : numero === "94" ? "dans le" : "dans les"} ${nom} ? On vous livre un climatiseur mobile, on l'installe et on le reprend à la fin de la location, comme à Paris.`,
    sections: [
      {
        h2: `Quelles communes du ${numero} sont livrées ?`,
        p: "Nous livrons toutes les communes du département. Voici les principales, chacune avec sa page dédiée :",
        h3: [
          ...villes.map((v) => ({ titre: v.nom, p: v.texte, lien: { href: v.chemin, texte: `Location de climatiseur à ${v.nom}` } })),
          { titre: `Et aussi : ${autres}`, p: "Livraison sous 24h, comme partout dans le département." },
        ],
      },
      { h2: `Quels délais de livraison dans le ${numero} ?`, p: "Sous 24h, sur un créneau de 2 heures, comme à Paris." },
      {
        h2: "Quel climatiseur choisir ?",
        p: "SEINE pour une chambre ou un studio ({seine.surface} m²), RIVOLI pour un salon ({rivoli.surface} m²), TROCADÉRO pour un grand séjour ou un local professionnel ({trocadero.surface} m²).",
        liens: [{ href: "/climatiseurs", texte: "Comparer les 3 climatiseurs" }],
      },
    ],
    faq: [
      { q: `Livrez-vous partout ${numero === "93" ? "en" : numero === "94" ? "dans le" : "dans les"} ${nom} ?`, r: "Oui, dans toutes les communes du département, sous 24h." },
      { q: "Le prix est-il le même qu'à Paris ?", r: "Oui : à partir de {prixMin} € par jour, et {livraison} € pour la livraison et la reprise." },
    ],
    voirAussi,
  };
}

// ---------------------------------------------------------------------------

export const PAGES_SEO = [
  // ========================= OFFRE =========================
  {
    chemin: "/tarifs",
    nomCourt: "Tarifs",
    type: "page",
    title: "Prix location climatiseur Paris : dès {prixMin} €/jour, tarif dégressif | Lootaclim",
    description:
      "Combien coûte la location d'un climatiseur à Paris ? Nos tarifs par jour, semaine et mois, installation comprise. Annulation sans frais.",
    h1: "Prix de location d'un climatiseur mobile à Paris",
    enBref:
      "La location d'un climatiseur mobile chez LOOTACLIM coûte à partir de {seine.prix} € par jour (SEINE), {rivoli.prix} € (RIVOLI) ou {trocadero.prix} € (TROCADÉRO), avec un prix dégressif à la semaine et au mois.",
    intro:
      "Pas de frais cachés, pas d'abonnement : vous payez les jours de location réservés. Voici le détail des prix et de ce qui est compris.",
    sections: [
      {
        h2: "Combien coûte la location d'un climatiseur par jour ?",
        p: "Le prix dépend du modèle, donc de la surface à rafraîchir.",
        tableau: "prix",
        h3: [
          { titre: "SEINE : dès {seine.prix} €/jour", p: "Pour une chambre ou un studio jusqu'à {seine.surface} m².", lien: { href: "/climatiseurs/seine", texte: "Découvrir SEINE" } },
          { titre: "RIVOLI : dès {rivoli.prix} €/jour", p: "Pour un salon ou une pièce de vie jusqu'à {rivoli.surface} m².", lien: { href: "/climatiseurs/rivoli", texte: "Découvrir RIVOLI" } },
          { titre: "TROCADÉRO : dès {trocadero.prix} €/jour", p: "Pour les grands espaces, bureaux et boutiques jusqu'à {trocadero.surface} m².", lien: { href: "/climatiseurs/trocadero", texte: "Découvrir TROCADÉRO" } },
        ],
      },
      {
        h2: "Peut-on louer un climatiseur à la semaine ou au mois ?",
        p: "Oui, et c'est plus intéressant : le prix par jour baisse de {remise7} % dès 7 jours de location et de {remise30} % dès 30 jours. Une vague de chaleur dure rarement un seul jour.",
      },
      {
        h2: "Qu'est-ce qui est inclus dans le prix ?",
        p: "Le prix par jour comprend le climatiseur, le kit de calfeutrage et l'installation. La livraison et la reprise sont facturées {livraison} € par location, quelle que soit sa durée.",
      },
      {
        h2: "Faut-il payer une caution ?",
        p: "Oui, sous forme d'empreinte bancaire : elle n'est jamais débitée, sauf dégât constaté au retour. Son montant dépend du modèle : {seine.caution} € pour SEINE, {rivoli.caution} € pour RIVOLI, {trocadero.caution} € pour TROCADÉRO.",
      },
      {
        h2: "Louer ou acheter : qu'est-ce qui revient le moins cher ?",
        p: "Pour quelques semaines par an, la location gagne presque toujours : pas d'achat, pas de stockage dans un appartement déjà petit, pas d'entretien.",
      },
    ],
    faq: [
      { q: "Y a-t-il des frais d'annulation ?", r: "Non, l'annulation est sans frais avant la livraison." },
      { q: "La livraison est-elle comprise ?", r: "La livraison et la reprise coûtent {livraison} € par location, quelle que soit sa durée. L'installation est comprise." },
    ],
    voirAussi: ["/climatiseurs", "/comment-ca-marche", "/faq"],
  },
  {
    chemin: "/comment-ca-marche",
    nomCourt: "Comment ça marche",
    type: "page",
    title: "Location climatiseur avec installation à Paris : livré, posé en 24h chrono",
    description:
      "Choisissez, on livre et on installe en 24h sur un créneau de 2h, puis on reprend la machine. Kit fenêtre posé, sans perçage ni travaux. Tout est expliqué.",
    h1: "Location de climatiseur avec installation : comment ça marche ?",
    enBref:
      "Louer un climatiseur chez LOOTACLIM se fait en trois étapes : vous réservez en ligne, on livre et on installe sous 24h sans travaux, puis on reprend la machine à la fin.",
    intro:
      "Pas de perçage, pas d'installateur à attendre, pas de carton à porter : on s'occupe de tout, de votre porte jusqu'à la mise en route.",
    sections: [
      {
        h2: "Étape 1 : choisir son climatiseur et ses dates",
        p: "Choisissez le modèle selon la surface de votre pièce, puis vos dates de début et de fin. Le paiement et la caution se font en ligne.",
        liens: [{ href: "/climatiseurs", texte: "Quel climatiseur pour quelle surface ?" }],
      },
      {
        h2: "Étape 2 : livraison et installation sous 24h",
        p: "Nous arrivons sur le créneau de 2 heures que vous avez choisi, installons le climatiseur, posons le kit fenêtre et vérifions qu'il souffle bien froid avant de partir.",
      },
      {
        h2: "Étape 3 : reprise en fin de location",
        p: "À la date prévue, nous revenons démonter et reprendre le climatiseur. La caution est libérée.",
      },
      {
        h2: "Faut-il faire des travaux pour installer un climatiseur mobile ?",
        p: "Non. Un climatiseur mobile est monobloc : il n'a pas d'unité extérieure. Seule la gaine d'air chaud sort par une fenêtre entrouverte. C'est pour cela qu'il convient aux locataires et aux copropriétés.",
      },
      {
        h2: "Comment on installe le kit de calfeutrage fenêtre ?",
        p: "Le kit est une toile qui ferme l'espace autour de la gaine, pour que l'air chaud ne rentre pas. Il se fixe sans perçage et s'enlève sans trace.",
        h3: [
          { titre: "Fenêtre classique", p: "La toile se fixe sur le cadre et la gaine passe au milieu." },
          { titre: "Porte-fenêtre", p: "Le kit couvre toute la hauteur, avec une fermeture éclair pour passer." },
        ],
        liens: [{ href: "/blog/kit-calfeutrage-fenetre-climatiseur", texte: "Tout savoir sur le kit de calfeutrage" }],
      },
    ],
    faq: [
      { q: "Dois-je être présent ?", r: "Oui, ou une personne de confiance, pendant le créneau de livraison." },
      { q: "Combien de temps dure l'installation ?", r: "Quelques minutes : on pose le kit fenêtre, on branche le climatiseur et on vérifie qu'il souffle froid." },
    ],
    voirAussi: ["/livraison-climatiseur-24h", "/tarifs", "/faq"],
  },
  {
    chemin: "/livraison-climatiseur-24h",
    nomCourt: "Livraison 24h",
    type: "page",
    title: "Climatiseur mobile livré en 24h à Paris : louez sans attendre | Lootaclim",
    description:
      "Plus de stock en magasin ? Louez un climatiseur mobile livré et installé en 24h à Paris et petite couronne, créneau de 2h. Sans travaux, dès {prixMin} €/jour.",
    h1: "Climatiseur mobile livré en 24h à Paris",
    enBref:
      "En pleine canicule, LOOTACLIM livre et installe un climatiseur mobile chez vous sous 24h, à Paris et en petite couronne, sur un créneau de 2 heures.",
    intro:
      "Les magasins sont en rupture, les sites annoncent une semaine de délai, et il fait 32 °C dans votre chambre. C'est exactement pour ce moment-là qu'on a créé LOOTACLIM.",
    sections: [
      {
        h2: "Plus de climatiseur en magasin : où en trouver un rapidement ?",
        p: "À chaque vague de chaleur, les climatiseurs mobiles disparaissent des rayons. Louer chez LOOTACLIM, c'est avoir une machine réservée pour vous, livrée et branchée le lendemain.",
      },
      {
        h2: "Comment se passe la livraison en 24h ?",
        p: "Vous réservez en ligne, choisissez un créneau, et nous arrivons avec le climatiseur et le kit fenêtre.",
        h3: [
          { titre: "Un créneau de 2 heures au choix", p: "Vous n'attendez pas toute la journée." },
          { titre: "Installation comprise", p: "On installe, on branche, on vérifie : vous profitez du frais dès notre départ." },
        ],
      },
      {
        h2: "Quelles zones sont livrées en 24h ?",
        p: "Les 20 arrondissements de Paris et la petite couronne : Hauts-de-Seine (92), Seine-Saint-Denis (93), Val-de-Marne (94).",
        liens: [{ href: "/zones-de-livraison", texte: "Voir toutes les zones de livraison" }],
      },
      {
        h2: "Pourquoi réserver avant la canicule ?",
        p: "Notre parc de climatiseurs est limité. Quand Météo-France annonce une vague de chaleur, réservez sans attendre, ou dès le début de l'été.",
      },
    ],
    faq: [
      { q: "La livraison 24h est-elle plus chère ?", r: "Non : la livraison et la reprise coûtent {livraison} € par location, que vous réserviez une semaine à l'avance ou la veille." },
      { q: "Peut-on être livré le soir ?", r: "Vous choisissez votre créneau de 2 heures au moment de réserver, parmi ceux encore disponibles." },
    ],
    voirAussi: ["/comment-ca-marche", "/zones-de-livraison", "/tarifs"],
  },
  {
    chemin: "/location-climatiseur-particulier",
    nomCourt: "Particuliers",
    type: "page",
    title: "Location climatiseur particulier à Paris : chambre, studio, appartement",
    description:
      "Dormez enfin au frais : location de climatiseur mobile pour chambre, studio ou appartement à Paris. Silencieux, sans travaux, livré et installé en 24h.",
    h1: "Location de climatiseur pour particulier : chambre, studio, appartement",
    enBref:
      "LOOTACLIM loue des climatiseurs mobiles aux particuliers à Paris : pour une chambre, un studio ou un appartement, livrés et installés sous 24h, sans travaux, dès {prixMin} € par jour.",
    intro:
      "Studio sous les toits, chambre plein sud, salon qui dépasse les 30 °C : à Paris, la chaleur d'été rend les nuits courtes et le télétravail pénible. Louer un climatiseur, c'est la solution la plus simple quand on est locataire.",
    sections: [
      {
        h2: "Quel climatiseur pour une chambre ?",
        p: "Choisissez SEINE : jusqu'à {seine.surface} m² et seulement {seine.bruit} dB.",
        h3: [{ titre: "Le bruit, critère n°1 pour dormir", p: "Au-delà de 50 dB, beaucoup de gens finissent par éteindre leur clim pour dormir. Un modèle silencieux, c'est une vraie nuit au frais." }],
        liens: [{ href: "/climatiseurs/seine", texte: "Découvrir SEINE, le climatiseur silencieux" }],
      },
      {
        h2: "Quel climatiseur pour un appartement ?",
        p: "Climatisez d'abord la pièce où vous passez le plus de temps : la chambre la nuit, le salon le jour. Un climatiseur mobile se déplace facilement d'une pièce à l'autre.",
        h3: [
          { titre: "Studio", p: "SEINE suffit pour un studio jusqu'à {seine.surface} m²." },
          { titre: "Salon et pièce de vie", p: "RIVOLI jusqu'à {rivoli.surface} m², TROCADÉRO jusqu'à {trocadero.surface} m²." },
        ],
      },
      {
        h2: "Appartement au dernier étage ou sous les combles : que faire ?",
        p: "Ce sont les logements les plus chauds de Paris. Prenez un modèle un cran plus puissant que ce que la surface indique, et fermez volets et rideaux en journée.",
        liens: [{ href: "/blog/quelle-puissance-climatiseur-surface", texte: "Calculer la bonne puissance" }],
      },
      {
        h2: "Peut-on climatiser son bureau en télétravail ?",
        p: "Oui : un climatiseur mobile se met dans la pièce où vous travaillez et se déplace le soir dans la chambre.",
      },
      {
        h2: "Pourquoi louer plutôt qu'acheter quand on est particulier ?",
        p: "Pas d'achat, pas de stockage dans un appartement déjà petit, pas d'entretien. Et rien à demander au propriétaire : aucun perçage.",
      },
    ],
    faq: [
      { q: "Ai-je besoin de l'accord de mon propriétaire ?", r: "Non, puisqu'il n'y a ni travaux ni perçage." },
      { q: "Peut-on changer le climatiseur de pièce ?", r: "Oui, il est sur roulettes. Il suffit d'une fenêtre dans la nouvelle pièce pour faire passer la gaine." },
    ],
    voirAussi: ["/blog/dormir-quand-il-fait-chaud", "/climatiseurs", "/tarifs"],
  },
  {
    chemin: "/location-climatiseur-bureau",
    nomCourt: "Professionnels",
    type: "page",
    title: "Location climatiseur bureau et commerce à Paris : livré et installé en 24h",
    description:
      "Bureau, boutique ou cabinet trop chaud ? Louez un climatiseur mobile à Paris, livré et installé en 24h, sans travaux. Devis rapide pour les professionnels.",
    h1: "Location de climatiseur pour bureau et professionnels à Paris",
    enBref:
      "LOOTACLIM loue des climatiseurs mobiles aux professionnels à Paris : bureaux, commerces et cabinets, livrés et installés sous 24h, sans travaux.",
    intro:
      "Une équipe qui suffoque, des clients qui ne restent pas, un ordinateur qui chauffe : la chaleur coûte cher à une entreprise. La location vous dépanne dès le lendemain, sans engager de travaux.",
    sections: [
      {
        h2: "Comment climatiser un bureau sans travaux ?",
        p: "Avec un climatiseur mobile : aucune unité extérieure, aucune autorisation de copropriété, seulement une gaine par la fenêtre. Idéal en attendant une installation fixe, ou pour un local loué.",
      },
      {
        h2: "Location de climatiseur pour commerces et boutiques",
        p: "TROCADÉRO ({trocadero.puissance} kW, déshumidification) rafraîchit une boutique jusqu'à {trocadero.surface} m². Pour plus grand, nous combinons plusieurs appareils.",
        liens: [{ href: "/climatiseurs/trocadero", texte: "Découvrir TROCADÉRO" }],
      },
      {
        h2: "Cabinets, salles de réunion, salles techniques",
        p: "Cabinets, salles de réunion, petits locaux : choisissez le modèle selon la surface de la pièce.",
        liens: [{ href: "/climatiseurs", texte: "Comparer les 3 climatiseurs" }],
      },
      {
        h2: "Comment obtenir un devis professionnel ?",
        p: "Écrivez-nous en précisant la surface, le nombre de pièces et les dates : nous vous répondons avec une proposition adaptée.",
        liens: [{ href: "/contact", texte: "Nous écrire" }],
      },
    ],
    faq: [
      { q: "Proposez-vous la location longue durée ?", r: "Oui, avec un prix dégressif : -{remise30} % sur le prix par jour dès 30 jours de location." },
      { q: "Pouvez-vous équiper plusieurs pièces ?", r: "Oui, indiquez-nous le nombre de pièces et leur surface : nous livrons et installons plusieurs appareils en une fois." },
    ],
    voirAussi: ["/climatiseurs/trocadero", "/tarifs", "/contact"],
  },
  {
    chemin: "/faq",
    nomCourt: "FAQ",
    type: "page",
    title: "FAQ location climatiseur : caution, livraison, installation | Lootaclim",
    description:
      "Caution, délai de livraison, installation sans travaux, bruit la nuit, annulation : toutes les réponses sur la location de climatiseur mobile à Paris.",
    h1: "FAQ : toutes les questions sur la location de climatiseur",
    enBref:
      "Toutes les réponses sur la location de climatiseur mobile chez LOOTACLIM : réservation, livraison, installation, caution, bruit et reprise.",
    intro: "Vous ne trouvez pas votre réponse ? Écrivez-nous, on répond nous-mêmes.",
    faqDepuisSections: true,
    sections: [
      {
        h2: "Réservation",
        h3: [
          { titre: "Combien de temps à l'avance faut-il réserver ?", p: "Nous livrons sous 24h, mais en pleine canicule le stock part vite : réservez dès l'annonce d'une vague de chaleur." },
          { titre: "Peut-on annuler ?", p: "Oui, sans frais tant que le climatiseur n'est pas livré." },
        ],
      },
      {
        h2: "Livraison et installation",
        h3: [
          { titre: "Faut-il être présent à la livraison ?", p: "Oui, vous ou une personne de confiance, pendant le créneau de 2 heures choisi." },
          { titre: "Faut-il percer un mur ?", p: "Non. La gaine passe par une fenêtre avec un kit de calfeutrage, sans perçage." },
        ],
      },
      {
        h2: "Caution et paiement",
        h3: [
          { titre: "Comment fonctionne la caution ?", p: "C'est une empreinte bancaire, jamais débitée sauf dégât constaté au retour : {seine.caution} € pour SEINE, {rivoli.caution} € pour RIVOLI, {trocadero.caution} € pour TROCADÉRO." },
          { titre: "Combien coûte la livraison ?", p: "La livraison et la reprise coûtent {livraison} € par location, quelle que soit sa durée." },
        ],
      },
      {
        h2: "Utilisation",
        h3: [
          { titre: "Le climatiseur est-il bruyant la nuit ?", p: "SEINE fonctionne à {seine.bruit} dB, assez bas pour dormir. RIVOLI ({rivoli.bruit} dB) et TROCADÉRO ({trocadero.bruit} dB) conviennent mieux aux pièces de jour." },
          { titre: "Combien consomme-t-il ?", p: "Environ 1 à 2 € d'électricité par jour pour 8 heures d'utilisation, selon le modèle. Le détail est dans notre article sur la consommation.", lien: { href: "/blog/consommation-climatiseur-mobile", texte: "Lire l'article sur la consommation" } },
        ],
      },
      {
        h2: "Fin de location",
        h3: [{ titre: "Comment se passe la reprise ?", p: "Nous revenons à la date prévue, démontons le kit et reprenons la machine. La caution est libérée." }],
      },
    ],
    voirAussi: ["/tarifs", "/comment-ca-marche", "/contact"],
  },

  // ========================= MODÈLES =========================
  {
    chemin: "/climatiseurs",
    nomCourt: "Nos climatiseurs",
    type: "page",
    title: "Location climatiseur mobile à Paris : 3 modèles de {seine.surface} à {trocadero.surface} m² | Lootaclim",
    description:
      "Studio, salon ou bureau : comparez nos 3 climatiseurs mobiles en location à Paris ({seine.surface}, {rivoli.surface} et {trocadero.surface} m²). Livré et installé en 24h, dès {prixMin} €/jour !",
    h1: "Nos climatiseurs mobiles en location à Paris",
    enBref:
      "LOOTACLIM propose trois climatiseurs mobiles en location à Paris : SEINE pour {seine.surface} m², RIVOLI pour {rivoli.surface} m² et TROCADÉRO pour {trocadero.surface} m², livrés et installés sous 24h.",
    intro:
      "Studio, chambre, salon ou bureau : chaque pièce a son climatiseur. Voici comment choisir le bon modèle en une minute, avec la surface comme premier critère.",
    sections: [
      {
        h2: "Quel climatiseur mobile pour quelle surface ?",
        p: "Mesurez la pièce à rafraîchir : jusqu'à {seine.surface} m², choisissez SEINE ; jusqu'à {rivoli.surface} m², RIVOLI ; au-delà et jusqu'à {trocadero.surface} m², TROCADÉRO. Si la pièce est sous les toits ou plein sud, prenez le modèle au-dessus.",
        h3: [{ titre: "Tableau comparatif : surface, puissance, bruit, prix", tableau: "comparatif" }],
      },
      {
        h2: "SEINE, le silencieux pour chambre et studio",
        p: "Avec {seine.bruit} dB, SEINE est notre climatiseur mobile le plus silencieux. Il rafraîchit une chambre ou un studio jusqu'à {seine.surface} m² sans vous empêcher de dormir.",
        liens: [{ href: "/climatiseurs/seine", texte: "Voir la fiche SEINE" }],
      },
      {
        h2: "RIVOLI, le polyvalent pour le salon",
        p: "RIVOLI et ses {rivoli.puissance} kW rafraîchissent un salon ou une pièce de vie jusqu'à {rivoli.surface} m², même quand le soleil tape l'après-midi.",
        liens: [{ href: "/climatiseurs/rivoli", texte: "Voir la fiche RIVOLI" }],
      },
      {
        h2: "TROCADÉRO, le puissant pour grands espaces",
        p: "TROCADÉRO développe {trocadero.puissance} kW et déshumidifie l'air. Il est fait pour les grands séjours, les bureaux et les boutiques jusqu'à {trocadero.surface} m².",
        liens: [{ href: "/climatiseurs/trocadero", texte: "Voir la fiche TROCADÉRO" }],
      },
      {
        h2: "Qu'est-ce qui est inclus dans la location ?",
        p: "L'installation avec le kit fenêtre et la mise en route sont comprises. La livraison et la reprise sont facturées {livraison} € par location, quelle que soit sa durée.",
      },
    ],
    faq: [
      { q: "Quel climatiseur pour une chambre ?", r: "SEINE : il est le plus silencieux ({seine.bruit} dB) et couvre jusqu'à {seine.surface} m²." },
      { q: "Quel climatiseur pour un salon de 30 m² ?", r: "RIVOLI, qui couvre jusqu'à {rivoli.surface} m²." },
    ],
    voirAussi: ["/tarifs", "/blog/quelle-puissance-climatiseur-surface", "/comment-ca-marche"],
  },
  {
    chemin: "/climatiseurs/seine",
    parent: "/climatiseurs",
    nomCourt: "SEINE",
    type: "produit",
    produit: "seine",
    title: "Climatiseur mobile silencieux {seine.surface} m² en location à Paris – SEINE | Lootaclim",
    description:
      "SEINE, le climatiseur mobile silencieux ({seine.bruit} dB) pour chambre et studio jusqu'à {seine.surface} m². En location à Paris dès {seine.prix} €/jour, livré et installé en 24h chrono.",
    h1: "SEINE : climatiseur mobile silencieux pour chambre jusqu'à {seine.surface} m²",
    enBref:
      "SEINE est un climatiseur mobile silencieux ({seine.bruit} dB, {seine.puissance} kW) pour chambre et studio jusqu'à {seine.surface} m², en location à Paris dès {seine.prix} € par jour, livré et installé sous 24h.",
    intro:
      "Dormir enfin au frais, sans le ronronnement d'une machine bruyante. SEINE est le climatiseur mobile que nous recommandons pour les chambres et les studios parisiens.",
    sections: [
      {
        h2: "Pourquoi SEINE est-il assez silencieux pour dormir ?",
        p: "Parce qu'il fonctionne à {seine.bruit} dB, le niveau d'une conversation à voix basse. C'est le critère n°1 pour une chambre : un climatiseur trop bruyant finit éteint au milieu de la nuit.",
        h3: [{ titre: "{seine.bruit} dB : à quoi ça correspond ?", p: "À peu près le bruit d'une bibliothèque calme. Pour comparaison, beaucoup de climatiseurs mobiles d'entrée de gamme dépassent 50 dB." }],
      },
      {
        h2: "Pour quelle pièce choisir SEINE ?",
        p: "Pour toute pièce jusqu'à {seine.surface} m², avec une fenêtre pour faire passer la gaine d'évacuation.",
        h3: [
          { titre: "Chambre", p: "Lancez-le une heure avant de vous coucher, puis laissez-le tourner à vitesse réduite la nuit." },
          { titre: "Studio", p: "Un seul appareil suffit pour rafraîchir la pièce de vie et le coin nuit d'un studio parisien." },
        ],
      },
      {
        h2: "Caractéristiques techniques",
        p: "Puissance : {seine.puissance} kW. Surface : jusqu'à {seine.surface} m². Niveau sonore : {seine.bruit} dB. Évacuation : gaine par la fenêtre avec kit de calfeutrage.",
      },
      {
        h2: "Combien coûte la location de SEINE ?",
        p: "À partir de {seine.prix} € par jour, avec -{remise7} % dès 7 jours et -{remise30} % dès 30 jours. Caution par empreinte bancaire : {seine.caution} €, jamais débitée sauf dégât.",
        liens: [{ href: "/tarifs", texte: "Tous les tarifs" }],
      },
    ],
    faq: [
      { q: "SEINE peut-il rafraîchir un salon ?", r: "Seulement s'il fait moins de {seine.surface} m². Au-delà, choisissez RIVOLI." },
      { q: "Peut-on le laisser allumé toute la nuit ?", r: "Oui. Réglez-le sur une vitesse basse et une température de 5 à 7 °C sous la température extérieure." },
      { q: "Faut-il une fenêtre ?", r: "Oui, pour faire sortir l'air chaud par la gaine. Nous installons le kit de calfeutrage." },
    ],
    voirAussi: ["/climatiseurs/rivoli", "/blog/dormir-quand-il-fait-chaud", "/location-climatiseur-particulier"],
  },
  {
    chemin: "/climatiseurs/rivoli",
    parent: "/climatiseurs",
    nomCourt: "RIVOLI",
    type: "produit",
    produit: "rivoli",
    title: "Climatiseur mobile {rivoli.surface} m² en location à Paris, salon – RIVOLI | Lootaclim",
    description:
      "RIVOLI rafraîchit salons et pièces de vie jusqu'à {rivoli.surface} m² avec {rivoli.puissance} kW. Location de climatiseur mobile à Paris dès {rivoli.prix} €/jour, livré et installé sous 24h.",
    h1: "RIVOLI : climatiseur mobile pour salon jusqu'à {rivoli.surface} m²",
    enBref:
      "RIVOLI est un climatiseur mobile de {rivoli.puissance} kW pour salons et pièces de vie jusqu'à {rivoli.surface} m², en location à Paris dès {rivoli.prix} € par jour, livré et installé sous 24h.",
    intro:
      "Le salon, c'est la pièce où l'on vit quand il fait chaud : repas, télétravail, soirées. RIVOLI est taillé pour les pièces de vie parisiennes, des appartements anciens aux immeubles récents.",
    sections: [
      { h2: "Pour quelles pièces choisir RIVOLI ?", p: "Pour un salon, une salle à manger ou une grande chambre entre {seine.surface} et {rivoli.surface} m²." },
      {
        h2: "Est-ce assez puissant pour un salon parisien ?",
        p: "Oui pour la plupart des salons jusqu'à {rivoli.surface} m². Si votre salon a de hauts plafonds haussmanniens ou de grandes baies plein sud, choisissez plutôt TROCADÉRO.",
        liens: [{ href: "/climatiseurs/trocadero", texte: "Voir TROCADÉRO" }],
      },
      { h2: "Caractéristiques techniques", p: "Puissance : {rivoli.puissance} kW. Surface : jusqu'à {rivoli.surface} m². Niveau sonore : {rivoli.bruit} dB. Évacuation : gaine par la fenêtre avec kit de calfeutrage." },
      {
        h2: "Combien coûte la location de RIVOLI ?",
        p: "À partir de {rivoli.prix} € par jour, avec -{remise7} % dès 7 jours et -{remise30} % dès 30 jours. Caution par empreinte bancaire : {rivoli.caution} €.",
        liens: [{ href: "/tarifs", texte: "Tous les tarifs" }],
      },
    ],
    faq: [
      { q: "RIVOLI convient-il à une chambre ?", r: "Oui, mais SEINE est plus silencieux pour dormir." },
      { q: "Peut-on le déplacer d'une pièce à l'autre ?", r: "Oui, il est sur roulettes, à condition de pouvoir repasser la gaine par une fenêtre." },
    ],
    voirAussi: ["/climatiseurs/seine", "/climatiseurs/trocadero", "/blog/quelle-puissance-climatiseur-surface"],
  },
  {
    chemin: "/climatiseurs/trocadero",
    parent: "/climatiseurs",
    nomCourt: "TROCADÉRO",
    type: "produit",
    produit: "trocadero",
    title: "Climatiseur mobile {trocadero.puissance} kW en location à Paris – TROCADÉRO | Lootaclim",
    description:
      "TROCADÉRO, {trocadero.puissance} kW avec déshumidification, pour grands séjours, bureaux et boutiques. Location de climatiseur mobile à Paris dès {trocadero.prix} €/jour, livré en 24h.",
    h1: "TROCADÉRO : climatiseur mobile {trocadero.puissance} kW pour grandes pièces",
    enBref:
      "TROCADÉRO est notre climatiseur mobile le plus puissant ({trocadero.puissance} kW) avec déshumidification, pour les pièces jusqu'à {trocadero.surface} m², en location à Paris dès {trocadero.prix} € par jour.",
    intro:
      "Grand séjour, bureau partagé, boutique : certaines pièces demandent plus de puissance. TROCADÉRO rafraîchit et assèche l'air des grands espaces.",
    sections: [
      {
        h2: "Quel climatiseur mobile pour 40 m² ?",
        p: "Pour une pièce de 35 à 40 m², il faut environ 3,5 à 4 kW de puissance frigorifique. TROCADÉRO, notre modèle le plus puissant ({trocadero.puissance} kW), est annoncé jusqu'à {trocadero.surface} m² dans une pièce bien isolée et ombragée.",
        liens: [{ href: "/blog/quelle-puissance-climatiseur-surface", texte: "Calculer la puissance qu'il vous faut" }],
      },
      { h2: "Un climatiseur puissant mais silencieux ?", p: "À {trocadero.bruit} dB, TROCADÉRO reste discret pour une pièce de vie ou un bureau. Pour une chambre, préférez SEINE." },
      { h2: "À quoi sert la déshumidification ?", p: "Un air humide paraît plus chaud. En retirant l'humidité, TROCADÉRO améliore le confort même sans baisser beaucoup la température." },
      {
        h2: "Grands séjours, bureaux, boutiques : pour qui ?",
        p: "Pour les séjours de plus de {rivoli.surface} m², les petits open spaces, les cabinets et les commerces.",
        liens: [{ href: "/location-climatiseur-bureau", texte: "Location pour les professionnels" }],
      },
      { h2: "Caractéristiques techniques", p: "Puissance : {trocadero.puissance} kW. Surface : jusqu'à {trocadero.surface} m². Niveau sonore : {trocadero.bruit} dB. Mode déshumidification." },
      {
        h2: "Combien coûte la location de TROCADÉRO ?",
        p: "À partir de {trocadero.prix} € par jour, avec -{remise7} % dès 7 jours et -{remise30} % dès 30 jours. Caution par empreinte bancaire : {trocadero.caution} €.",
        liens: [{ href: "/tarifs", texte: "Tous les tarifs" }],
      },
    ],
    faq: [
      { q: "Et pour une pièce sous les toits ou très exposée ?", r: "Comptez large : la chaleur du toit ou d'une grande baie vitrée peut demander 15 à 25 % de puissance en plus. Dans ce cas, mieux vaut viser une pièce plus petite que la surface annoncée." },
      { q: "Et au-delà de {trocadero.surface} m² ?", r: "Il vaut mieux deux appareils, placés chacun dans une zone de la pièce." },
      { q: "Est-il adapté à un bureau ?", r: "Oui, c'est le modèle que nous recommandons pour les bureaux et commerces." },
    ],
    voirAussi: ["/climatiseurs/rivoli", "/location-climatiseur-bureau", "/tarifs"],
  },

  // ========================= ZONES =========================
  {
    chemin: "/zones-de-livraison",
    nomCourt: "Zones de livraison",
    type: "page",
    title: "Location climatiseur Île-de-France : Paris & petite couronne | Lootaclim",
    description:
      "LOOTACLIM livre et installe votre climatiseur mobile dans les 20 arrondissements de Paris et en petite couronne (92, 93, 94) en 24h. Et votre commune ?",
    h1: "Location de climatiseur à Paris et en Île-de-France : zones de livraison",
    enBref:
      "LOOTACLIM livre et installe ses climatiseurs mobiles dans les 20 arrondissements de Paris et en petite couronne : Hauts-de-Seine (92), Seine-Saint-Denis (93) et Val-de-Marne (94).",
    intro: "Vérifiez en un coup d'œil si nous livrons chez vous, et dans quels délais.",
    sections: [
      {
        h2: "Livrez-vous dans tout Paris ?",
        p: "Oui, partout dans Paris intra-muros.",
        h3: [{ titre: "Les 20 arrondissements", p: "Du 1er au 20e arrondissement, sous 24h." }],
      },
      {
        h2: "Hauts-de-Seine (92)",
        p: "Boulogne-Billancourt, Neuilly-sur-Seine, Issy-les-Moulineaux, Levallois-Perret, Courbevoie et toutes les communes du 92.",
        liens: [{ href: "/location-climatiseur-hauts-de-seine", texte: "Location de climatiseur dans les Hauts-de-Seine" }],
      },
      {
        h2: "Seine-Saint-Denis (93)",
        p: "Montreuil, Saint-Denis, Saint-Ouen, Pantin, Bagnolet et toutes les communes du 93.",
        liens: [{ href: "/location-climatiseur-seine-saint-denis", texte: "Location de climatiseur en Seine-Saint-Denis" }],
      },
      {
        h2: "Val-de-Marne (94)",
        p: "Vincennes, Ivry-sur-Seine, Saint-Maur-des-Fossés, Créteil, Nogent-sur-Marne et toutes les communes du 94.",
        liens: [{ href: "/location-climatiseur-val-de-marne", texte: "Location de climatiseur dans le Val-de-Marne" }],
      },
      {
        h2: "Quels sont les délais de livraison ?",
        p: "Sous 24h, sur un créneau de 2 heures que vous choisissez.",
        liens: [{ href: "/livraison-climatiseur-24h", texte: "Tout sur la livraison en 24h" }],
      },
    ],
    faq: [
      { q: "Livrez-vous en grande couronne ?", r: "Pas pour l'instant : nous livrons Paris et la petite couronne (92, 93, 94). Écrivez-nous si vous êtes juste à côté." },
      { q: "Le prix de livraison change-t-il selon la commune ?", r: "Non : {livraison} € par location, livraison et reprise comprises, partout dans la zone." },
    ],
    voirAussi: ["/livraison-climatiseur-24h", "/tarifs", "/comment-ca-marche"],
  },
  pageDepartement({
    chemin: "/location-climatiseur-hauts-de-seine",
    nom: "Hauts-de-Seine",
    numero: "92",
    title: "Location climatiseur Hauts-de-Seine (92) : Boulogne, Neuilly, Issy en 24h",
    description:
      "Location de climatiseur mobile dans les Hauts-de-Seine : Boulogne, Neuilly, Issy, Levallois… Livré et installé sous 24h, sans travaux, dès {prixMin} €/jour !",
    villes: [
      { nom: "Boulogne-Billancourt", chemin: "/location-climatiseur-hauts-de-seine/boulogne-billancourt", texte: "Appartements plein sud et grands immeubles récents, livrés sous 24h." },
      { nom: "Neuilly-sur-Seine", chemin: "/location-climatiseur-hauts-de-seine/neuilly-sur-seine", texte: "Immeubles anciens et hauts plafonds : sans aucun perçage." },
    ],
    autres: "Issy-les-Moulineaux, Levallois-Perret, Courbevoie",
    voirAussi: ["/zones-de-livraison", "/location-climatiseur-seine-saint-denis", "/location-climatiseur-val-de-marne"],
  }),
  pageVille({
    chemin: "/location-climatiseur-hauts-de-seine/boulogne-billancourt",
    parent: "/location-climatiseur-hauts-de-seine",
    ville: "Boulogne-Billancourt",
    dept: "92",
    title: "Location climatiseur Boulogne-Billancourt : livré et installé en 24h chrono",
    description:
      "Location de climatiseur mobile à Boulogne-Billancourt : livré et installé chez vous en 24h, sur créneau de 2h, sans travaux. Dès {prixMin} € par jour. Réservez.",
    enBref: "LOOTACLIM livre et installe des climatiseurs mobiles à Boulogne-Billancourt sous 24h, sans travaux, à partir de {prixMin} € par jour.",
    intro:
      "Juste à côté du 16e, Boulogne-Billancourt compte beaucoup d'appartements exposés plein sud et de grands immeubles récents qui chauffent vite l'été. On vous livre le frais, sans travaux.",
    quartiers: "Centre-ville, Billancourt, Point-du-Jour, Rives de Seine, Silly-Gallieni, Parchamp-Albert-Kahn",
    h2Local: "Grands immeubles et bureaux : comment rafraîchir sans travaux ?",
    texteLocal:
      "Dans les résidences récentes et les bureaux, installer une clim fixe demande souvent l'accord de la copropriété. Un climatiseur mobile s'installe par la fenêtre, sans toucher à la façade.",
    choix: "Studio ou chambre : SEINE ({seine.surface} m²). Salon : RIVOLI ({rivoli.surface} m²). Grand séjour ou bureau : TROCADÉRO ({trocadero.surface} m²).",
    voirAussi: ["/location-climatiseur-hauts-de-seine/neuilly-sur-seine", "/climatiseurs"],
  }),
  pageVille({
    chemin: "/location-climatiseur-hauts-de-seine/neuilly-sur-seine",
    parent: "/location-climatiseur-hauts-de-seine",
    ville: "Neuilly-sur-Seine",
    dept: "92",
    title: "Location climatiseur Neuilly-sur-Seine : livré, installé en 24h | Lootaclim",
    description:
      "Location de climatiseur mobile à Neuilly-sur-Seine, livré et installé en 24h sur créneau de 2h. Parfait pour l'ancien : aucun perçage. Dès {prixMin} € par jour.",
    enBref: "LOOTACLIM livre et installe des climatiseurs mobiles à Neuilly-sur-Seine sous 24h, sans perçage, à partir de {prixMin} € par jour.",
    intro:
      "Entre le 17e et La Défense, Neuilly-sur-Seine compte de nombreux immeubles anciens aux hauts plafonds, où l'installation d'une clim fixe est souvent compliquée. Le climatiseur mobile est la solution la plus simple.",
    quartiers: "Sablons, Bagatelle, Saint-James, centre-ville, Madrid",
    h2Local: "Appartements anciens et hauts plafonds : quel climatiseur ?",
    texteLocal:
      "Avec plus de 3 m sous plafond, il y a plus d'air à refroidir : prenez un modèle plus puissant que ce que la surface indique, par exemple TROCADÉRO pour un salon de 30 m².",
    choix: "Chambre : SEINE, le plus silencieux. Salon à hauts plafonds : TROCADÉRO. Bureau ou cabinet : TROCADÉRO.",
    voirAussi: ["/location-climatiseur-hauts-de-seine/boulogne-billancourt", "/climatiseurs/trocadero"],
  }),
  pageDepartement({
    chemin: "/location-climatiseur-seine-saint-denis",
    nom: "Seine-Saint-Denis",
    numero: "93",
    title: "Location climatiseur Seine-Saint-Denis (93) : Montreuil, Saint-Denis en 24h",
    description:
      "Location de climatiseur mobile en Seine-Saint-Denis : Montreuil, Saint-Denis, Pantin, Bagnolet… Livré et installé en 24h, sans travaux, dès {prixMin} €/jour.",
    villes: [
      { nom: "Montreuil", chemin: "/location-climatiseur-seine-saint-denis/montreuil", texte: "Appartements, maisons et ateliers sous verrière, livrés sous 24h." },
      { nom: "Saint-Denis", chemin: "/location-climatiseur-seine-saint-denis/saint-denis", texte: "Du centre historique aux bureaux de la Plaine." },
    ],
    autres: "Saint-Ouen, Pantin, Bagnolet",
    voirAussi: ["/zones-de-livraison", "/location-climatiseur-hauts-de-seine", "/location-climatiseur-val-de-marne"],
  }),
  pageVille({
    chemin: "/location-climatiseur-seine-saint-denis/montreuil",
    parent: "/location-climatiseur-seine-saint-denis",
    ville: "Montreuil",
    dept: "93",
    title: "Location climatiseur Montreuil (93) : livré et installé chez vous en 24h",
    description:
      "Location de climatiseur mobile à Montreuil : livré et installé en 24h, sur créneau de 2h, sans travaux. Appartement, maison ou atelier, dès {prixMin} € par jour.",
    enBref: "LOOTACLIM livre et installe des climatiseurs mobiles à Montreuil sous 24h, sans travaux, à partir de {prixMin} € par jour.",
    intro:
      "Aux portes du 20e, Montreuil mêle appartements, maisons et anciens ateliers transformés en logements ou bureaux, souvent sous verrière. Des lieux qui deviennent vite étouffants l'été.",
    quartiers: "Bas-Montreuil, Croix-de-Chavaux, Mairie, Robespierre, Villiers-Barbusse",
    h2Local: "Ateliers, lofts et verrières : comment les rafraîchir ?",
    texteLocal:
      "Les grandes verrières font entrer beaucoup de chaleur. Occultez-les en journée et choisissez TROCADÉRO, qui rafraîchit et déshumidifie les grands volumes jusqu'à {trocadero.surface} m².",
    choix: "Chambre ou studio : SEINE. Salon : RIVOLI. Atelier ou loft : TROCADÉRO.",
    voirAussi: ["/location-climatiseur-seine-saint-denis/saint-denis", "/climatiseurs/trocadero"],
  }),
  pageVille({
    chemin: "/location-climatiseur-seine-saint-denis/saint-denis",
    parent: "/location-climatiseur-seine-saint-denis",
    ville: "Saint-Denis",
    dept: "93",
    title: "Location climatiseur Saint-Denis (93) : livré, installé en 24h | Lootaclim",
    description:
      "Location de climatiseur mobile à Saint-Denis : livré et installé en 24h sur créneau de 2h, pour les logements et bureaux de la Plaine. Dès {prixMin} € / jour.",
    enBref: "LOOTACLIM livre et installe des climatiseurs mobiles à Saint-Denis sous 24h, pour les particuliers et les bureaux, à partir de {prixMin} € par jour.",
    intro:
      "Du centre historique autour de la basilique jusqu'aux bureaux de la Plaine Saint-Denis près du Stade de France, la ville mêle logements et entreprises. Les deux ont besoin de fraîcheur l'été.",
    quartiers: "Centre-ville, Plaine Saint-Denis, Pleyel, Basilique, Franc-Moisin",
    h2Local: "Bureaux de la Plaine Saint-Denis : une clim en 24h ?",
    texteLocal:
      "Oui. Pour un bureau ou une salle de réunion, TROCADÉRO rafraîchit jusqu'à {trocadero.surface} m², livré et installé le lendemain de votre réservation.",
    choix: "Chambre : SEINE. Salon : RIVOLI. Bureau ou commerce : TROCADÉRO.",
    voirAussi: ["/location-climatiseur-seine-saint-denis/montreuil", "/location-climatiseur-bureau"],
  }),
  pageDepartement({
    chemin: "/location-climatiseur-val-de-marne",
    nom: "Val-de-Marne",
    numero: "94",
    title: "Location climatiseur Val-de-Marne (94) : Vincennes, Ivry, Saint-Maur en 24h",
    description:
      "Location de climatiseur mobile dans le Val-de-Marne : Vincennes, Ivry, Saint-Maur, Créteil… Livré et installé en 24h, sans travaux, à partir de {prixMin} €/jour.",
    villes: [
      { nom: "Vincennes", chemin: "/location-climatiseur-val-de-marne/vincennes", texte: "Immeubles anciens où la clim fixe est rarement autorisée." },
      { nom: "Ivry-sur-Seine", chemin: "/location-climatiseur-val-de-marne/ivry-sur-seine", texte: "Logements récents et bureaux d'Ivry-Port, livrés sous 24h." },
    ],
    autres: "Saint-Maur, Créteil, Nogent",
    voirAussi: ["/zones-de-livraison", "/location-climatiseur-hauts-de-seine", "/location-climatiseur-seine-saint-denis"],
  }),
  pageVille({
    chemin: "/location-climatiseur-val-de-marne/vincennes",
    parent: "/location-climatiseur-val-de-marne",
    ville: "Vincennes",
    dept: "94",
    title: "Location climatiseur Vincennes (94) : livré et installé chez vous en 24h",
    description:
      "Location de climatiseur mobile à Vincennes : livré et installé en 24h, sur créneau de 2h, sans travaux, à Vincennes et Saint-Mandé. Dès {prixMin} € par jour.",
    enBref: "LOOTACLIM livre et installe des climatiseurs mobiles à Vincennes sous 24h, sans travaux, à partir de {prixMin} € par jour.",
    intro:
      "Collée au 12e, entre le château et le bois, Vincennes compte de nombreux immeubles anciens où une clim fixe est rarement autorisée. Le climatiseur mobile est fait pour ça.",
    quartiers: "Centre-ville, Diderot, Bérault, Château, Domaine du Bois",
    h2Local: "Copropriété : a-t-on le droit d'installer une clim ?",
    texteLocal:
      "Une clim fixe avec unité extérieure demande généralement l'accord de la copropriété. Un climatiseur mobile, lui, ne touche pas à la façade : la gaine passe simplement par une fenêtre.",
    choix: "Chambre : SEINE. Salon : RIVOLI. Grand séjour : TROCADÉRO.",
    voirAussi: ["/location-climatiseur-val-de-marne/ivry-sur-seine", "/location-climatiseur-particulier"],
  }),
  pageVille({
    chemin: "/location-climatiseur-val-de-marne/ivry-sur-seine",
    parent: "/location-climatiseur-val-de-marne",
    ville: "Ivry-sur-Seine",
    dept: "94",
    title: "Location climatiseur Ivry-sur-Seine : livré et installé en 24h sans travaux",
    description:
      "Location de climatiseur mobile à Ivry-sur-Seine : livré et installé en 24h, sur créneau de 2h, sans travaux, pour logements et bureaux. Dès {prixMin} € par jour.",
    enBref: "LOOTACLIM livre et installe des climatiseurs mobiles à Ivry-sur-Seine sous 24h, sans travaux, à partir de {prixMin} € par jour.",
    intro:
      "Aux portes du 13e, Ivry-sur-Seine mêle immeubles récents, anciennes cités et nouveaux quartiers de bureaux, comme Ivry-Port. Partout, l'été en ville se fait sentir.",
    quartiers: "Centre-ville, Ivry-Port, Petit-Ivry, Plateau, Confluence",
    h2Local: "Appartement récent ou bureau : quel modèle ?",
    texteLocal:
      "Les logements récents bien isolés gardent mieux la fraîcheur : un modèle à la bonne surface suffit. Pour un bureau ou un local d'activité, TROCADÉRO couvre jusqu'à {trocadero.surface} m².",
    choix: "Chambre : SEINE. Salon : RIVOLI. Bureau : TROCADÉRO.",
    voirAussi: ["/location-climatiseur-val-de-marne/vincennes", "/climatiseurs"],
  }),

  // ========================= BLOG =========================
  {
    chemin: "/blog",
    nomCourt: "Conseils",
    type: "blog",
    title: "Blog Lootaclim : nos conseils pour rester au frais à Paris l'été",
    description:
      "Puissance, consommation, calfeutrage, nuits de canicule : nos conseils pour choisir et utiliser un climatiseur mobile et rafraîchir votre logement à Paris.",
    h1: "Nos conseils pour rester au frais à Paris",
    intro:
      "Choisir la bonne puissance, poser un kit de calfeutrage, mieux dormir pendant la canicule : nos réponses aux questions qu'on se pose tous quand Paris passe les 30 °C.",
    sections: [],
    voirAussi: [],
  },
  {
    chemin: "/blog/quelle-puissance-climatiseur-surface",
    parent: "/blog",
    nomCourt: "Quelle puissance de clim ?",
    type: "article",
    date: DATE_ARTICLES,
    title: "Quelle puissance de climatiseur pour 20, 30 ou 40 m² ? Le calcul simple",
    description:
      "kW, BTU, m² : comment calculer la puissance de climatiseur dont vous avez besoin selon la surface, l'étage et l'exposition. Tableau simple et exemples.",
    h1: "Quelle puissance de climatiseur pour votre surface ?",
    enBref:
      "Pour une pièce standard, comptez environ 100 watts de puissance frigorifique par m² : 2 kW pour 20 m², 3 kW pour 30 m², 4 kW pour 40 m². Ajoutez 15 à 25 % sous les toits ou plein sud.",
    intro:
      "Un climatiseur trop faible tourne à fond sans jamais atteindre la bonne température ; trop puissant, il coûte plus cher pour rien. Voici comment calculer simplement la puissance dont vous avez besoin.",
    sections: [
      {
        h2: "Comment calculer la puissance d'une clim par m² ?",
        p: "Multipliez la surface par 100 W. Une chambre de 15 m² demande environ 1,5 kW, un salon de 30 m² environ 3 kW. Cette règle vaut pour une hauteur sous plafond d'environ 2,50 m et une isolation moyenne.",
      },
      {
        h2: "kW ou BTU : comment convertir ?",
        p: "1 kW correspond à environ 3 412 BTU/h. Un climatiseur de 9 000 BTU fait donc environ 2,6 kW, un 12 000 BTU environ 3,5 kW.",
      },
      {
        h2: "Quelle puissance pour 20, 30 ou 40 m² ?",
        p: "Voici les repères les plus courants, pour une pièce standard.",
        h3: [{ titre: "Tableau surface / puissance", tableau: "puissance" }],
      },
      {
        h2: "Quels facteurs augmentent le besoin ?",
        p: "Certaines pièces chauffent plus que d'autres, même à surface égale.",
        h3: [
          { titre: "Dernier étage et combles", p: "Le toit accumule la chaleur : ajoutez 15 à 25 %." },
          { titre: "Exposition plein sud", p: "Les grandes fenêtres au soleil font grimper la température l'après-midi : ajoutez environ 10 à 15 %." },
          { titre: "Hauts plafonds haussmanniens", p: "Au-delà de 3 m sous plafond, il y a plus d'air à refroidir : calculez plutôt au volume, environ 40 W par m³." },
        ],
      },
      {
        h2: "Exemples concrets à Paris",
        p: "Studio de 18 m² au 3e étage : environ 2 kW, soit SEINE ({seine.puissance} kW). Chambre de 14 m² sous les toits : 2 kW plutôt que 1,5. Salon haussmannien de 30 m² avec 3,20 m sous plafond : 3,5 kW minimum, soit TROCADÉRO ({trocadero.puissance} kW).",
        liens: [{ href: "/climatiseurs", texte: "Comparer nos 3 climatiseurs" }],
      },
    ],
    faq: [
      { q: "Quelle puissance pour 20 m² ?", r: "Environ 2 kW, soit à peu près 7 000 BTU." },
      { q: "Combien de m² pour 9 000 BTU ?", r: "Environ 25 m² dans une pièce standard (9 000 BTU ≈ 2,6 kW)." },
    ],
    voirAussi: ["/climatiseurs", "/blog/consommation-climatiseur-mobile", "/blog/meilleur-climatiseur-mobile"],
  },
  {
    chemin: "/blog/rafraichir-appartement-canicule",
    parent: "/blog",
    nomCourt: "Rafraîchir une pièce",
    type: "article",
    date: DATE_ARTICLES,
    title: "Rafraîchir un appartement pendant la canicule : les astuces qui marchent",
    description:
      "Volets, courants d'air, linge humide, ventilateur… les astuces efficaces pour rafraîchir une pièce sans clim, et quand il vaut mieux louer un climatiseur.",
    h1: "Comment rafraîchir une pièce pendant la canicule ?",
    enBref:
      "Pour rafraîchir une pièce pendant la canicule : fermez volets et fenêtres le jour, aérez la nuit en créant un courant d'air, coupez les appareils qui chauffent, et utilisez un ventilateur avec un linge humide. Au-delà de 28 °C la nuit, un climatiseur devient la seule solution efficace.",
    intro:
      "Quand le thermomètre dépasse 30 °C plusieurs jours de suite, les appartements parisiens deviennent des fours. Voici les gestes qui marchent vraiment, du plus simple au plus efficace.",
    sections: [
      {
        h2: "Comment bloquer la chaleur pendant la journée ?",
        p: "Fermez fenêtres, volets et rideaux dès que le soleil touche la façade. Un rideau occultant clair renvoie une partie de la chaleur. Éteignez les lampes, le four et les appareils en veille.",
      },
      {
        h2: "Comment rafraîchir une chambre la nuit ?",
        p: "Ouvrez en grand dès que l'air extérieur est plus frais que l'intérieur, souvent après 23 h, et créez un courant d'air entre deux façades. Placez le ventilateur face à la fenêtre ouverte pour aspirer l'air frais.",
      },
      {
        h2: "Les astuces maison qui marchent vraiment",
        p: "Un linge humide devant le ventilateur, une bouteille d'eau congelée devant le souffle, des draps en coton ou en lin, une douche tiède avant de dormir.",
      },
      {
        h2: "Comment rafraîchir un appartement sans clim ?",
        p: "En combinant ces gestes, on gagne souvent quelques degrés. Mais quand les nuits restent au-dessus de 25 °C, l'appartement ne refroidit plus et les gestes ne suffisent plus.",
      },
      {
        h2: "Appartement au dernier étage : que faire ?",
        p: "Sous les toits, la chaleur s'accumule toute la journée. Bloquez le soleil le plus tôt possible et concentrez la fraîcheur dans une seule pièce.",
      },
      {
        h2: "Quand vaut-il mieux louer un climatiseur ?",
        p: "Quand la chambre dépasse 28 °C la nuit, pour un bébé ou une personne âgée, ou si vous télétravaillez. Louer évite d'acheter une machine qui ne servira que quelques semaines.",
        liens: [{ href: "/livraison-climatiseur-24h", texte: "Un climatiseur livré en 24h" }],
      },
    ],
    faq: [
      { q: "Le linge humide devant le ventilateur, ça marche ?", r: "Oui, il rafraîchit un peu l'air soufflé, surtout quand l'air est sec." },
      { q: "Faut-il ouvrir les fenêtres en journée ?", r: "Non : gardez-les fermées tant qu'il fait plus chaud dehors que dedans." },
    ],
    voirAussi: ["/blog/dormir-quand-il-fait-chaud", "/blog/ventilateur-ou-climatiseur", "/livraison-climatiseur-24h"],
  },
  {
    chemin: "/blog/consommation-climatiseur-mobile",
    parent: "/blog",
    nomCourt: "Consommation d'une clim",
    type: "article",
    date: DATE_ARTICLES,
    title: "Consommation d'un climatiseur mobile : combien ça coûte par jour en € ?",
    description:
      "Combien consomme un climatiseur mobile par heure et par jour ? Calcul en kWh et en euros, exemples concrets et 6 conseils pour réduire la facture cet été.",
    h1: "Combien consomme un climatiseur mobile ?",
    enBref:
      "Un climatiseur mobile consomme en général entre 0,7 et 1,3 kWh par heure de fonctionnement selon sa puissance. À environ 0,20 € le kWh, 8 heures d'utilisation coûtent environ 1 à 2 € par jour.",
    intro:
      "Avant de louer, beaucoup se demandent ce que la clim va coûter sur la facture. Voici comment le calculer vous-même.",
    sections: [
      {
        h2: "Quelle est la consommation d'une clim mobile en kWh ?",
        p: "Elle dépend de la puissance électrique absorbée, indiquée sur la fiche technique, souvent 2 à 3 fois plus faible que la puissance frigorifique.",
      },
      {
        h2: "Combien ça coûte par jour en électricité ?",
        p: "Coût = puissance absorbée (kW) × heures d'utilisation × prix du kWh.",
        h3: [
          { titre: "Exemple pour 20 m²", p: "Un appareil de 2 kW frigorifiques absorbe environ 0,7 kW. 8 h × 0,7 kW × 0,20 € ≈ 1,10 € par jour." },
          { titre: "Exemple pour 35 m²", p: "Environ 1 kW absorbé : 8 h × 1 kW × 0,20 € ≈ 1,60 € par jour." },
        ],
      },
      {
        h2: "Puissance absorbée ou puissance frigorifique : quelle différence ?",
        p: "La puissance frigorifique, c'est le froid produit. La puissance absorbée, c'est l'électricité consommée. Le rapport entre les deux (l'EER) mesure l'efficacité : plus il est élevé, moins la clim consomme pour le même froid.",
      },
      {
        h2: "6 conseils pour consommer moins",
        p: "Fermez portes et fenêtres de la pièce. Bloquez le soleil avec les volets. Réglez 5 à 7 °C sous la température extérieure. Fermez bien le kit de calfeutrage. Nettoyez le filtre. Éteignez quand vous partez.",
        liens: [{ href: "/blog/kit-calfeutrage-fenetre-climatiseur", texte: "Bien calfeutrer sa fenêtre" }],
      },
    ],
    faq: [
      { q: "Une clim mobile consomme-t-elle beaucoup ?", r: "Moins qu'on ne le pense pour quelques heures par jour : de l'ordre de 1 à 2 € par jour." },
      { q: "Le prix de l'électricité est-il compris dans la location ?", r: "Non, le climatiseur se branche sur une prise de votre logement : la consommation est sur votre facture d'électricité." },
    ],
    voirAussi: ["/blog/quelle-puissance-climatiseur-surface", "/tarifs", "/blog/meilleur-climatiseur-mobile"],
  },
  {
    chemin: "/blog/dormir-quand-il-fait-chaud",
    parent: "/blog",
    nomCourt: "Dormir quand il fait chaud",
    type: "article",
    date: DATE_ARTICLES,
    title: "Dormir quand il fait chaud : température idéale et astuces anti-chaleur",
    description:
      "Quelle température dans la chambre en été ? Astuces pour mieux dormir pendant la canicule, et comment choisir un climatiseur assez silencieux pour la nuit.",
    h1: "Comment bien dormir quand il fait chaud ?",
    enBref:
      "Pour bien dormir quand il fait chaud, visez une chambre autour de 18 à 20 °C, bloquez la chaleur le jour, aérez la nuit et prenez une douche tiède avant de vous coucher. Si la chambre reste au-dessus de 28 °C, un climatiseur silencieux change tout.",
    intro:
      "Les nuits de canicule sont souvent les plus pénibles : le corps a besoin de fraîcheur pour s'endormir. Voici ce qui aide vraiment.",
    sections: [
      {
        h2: "Quelle est la température idéale dans une chambre ?",
        p: "Autour de 18 à 20 °C pour la plupart des adultes. Avec une clim, inutile de descendre si bas : un écart de 5 à 7 °C avec l'extérieur suffit à bien dormir.",
      },
      {
        h2: "Que faire avant de se coucher ?",
        p: "Une douche tiède (pas froide), un dîner léger, pas d'ordinateur portable qui chauffe sur le lit, et des draps en coton ou en lin.",
      },
      {
        h2: "Comment se rafraîchir la nuit ?",
        p: "Créez un courant d'air, placez un ventilateur près de la fenêtre ouverte, gardez une bouteille d'eau à portée de main.",
        liens: [{ href: "/blog/rafraichir-appartement-canicule", texte: "Toutes les astuces pour rafraîchir une pièce" }],
      },
      {
        h2: "Bébés et personnes âgées : quelles précautions ?",
        p: "Ce sont les plus fragiles face à la chaleur. Faites-les boire régulièrement, découvrez-les et surveillez la température de la pièce. En cas de signe de coup de chaleur, appelez le 15.",
      },
      {
        h2: "Quel climatiseur est assez silencieux pour dormir ?",
        p: "Visez moins de 45 dB. SEINE fonctionne à {seine.bruit} dB : on peut le laisser tourner toute la nuit.",
        liens: [{ href: "/climatiseurs/seine", texte: "Découvrir SEINE" }],
      },
    ],
    faq: [
      { q: "Peut-on dormir avec la clim allumée ?", r: "Oui, avec une vitesse basse et sans viser le lit directement." },
      { q: "À quelle température régler la clim la nuit ?", r: "5 à 7 °C sous la température extérieure, sans descendre sous 24 à 26 °C quand il fait très chaud dehors." },
    ],
    voirAussi: ["/climatiseurs/seine", "/blog/rafraichir-appartement-canicule", "/location-climatiseur-particulier"],
  },
  {
    chemin: "/blog/ventilateur-ou-climatiseur",
    parent: "/blog",
    nomCourt: "Ventilateur ou climatiseur ?",
    type: "article",
    date: DATE_ARTICLES,
    title: "Ventilateur, rafraîchisseur d'air ou climatiseur : lequel choisir cet été ?",
    description:
      "Ventilateur, rafraîchisseur d'air ou climatiseur mobile : efficacité, bruit, consommation et prix. Le comparatif clair pour choisir selon votre pièce.",
    h1: "Ventilateur, rafraîchisseur d'air ou climatiseur : lequel choisir ?",
    enBref:
      "Un ventilateur brasse l'air sans le refroidir, un rafraîchisseur d'air le rafraîchit un peu grâce à l'eau, et seul un climatiseur fait vraiment baisser la température d'une pièce. Au-delà de 28 °C, le climatiseur est le seul vraiment efficace.",
    intro: "Trois appareils, trois prix, trois résultats très différents. Voici comment choisir selon la chaleur et votre pièce.",
    sections: [
      {
        h2: "Ventilateur ou climatiseur : quelle différence ?",
        p: "Le ventilateur crée une sensation de fraîcheur sur la peau mais ne baisse pas la température. Le climatiseur extrait la chaleur de la pièce et la rejette dehors.",
      },
      {
        h2: "Ventilateur ou rafraîchisseur d'air ?",
        p: "Le rafraîchisseur ajoute de l'eau ou de la glace au flux d'air : il rafraîchit de quelques degrés, surtout dans un air sec. Il humidifie aussi la pièce.",
      },
      {
        h2: "Un rafraîchisseur d'air est-il efficace ?",
        p: "Un peu, dans une petite pièce et un air sec. Dans un appartement parisien humide en pleine canicule, l'effet reste limité.",
        liens: [{ href: "/blog/climatiseur-sans-evacuation", texte: "Les « climatiseurs sans évacuation », c'est quoi ?" }],
      },
      {
        h2: "Lequel choisir selon votre pièce ?",
        p: "Chaleur légère : ventilateur. Pièce sèche et petite : rafraîchisseur. Canicule, chambre sous les toits, bébé ou télétravail : climatiseur.",
      },
    ],
    faq: [
      { q: "Un rafraîchisseur remplace-t-il une clim ?", r: "Non, il rafraîchit beaucoup moins." },
      { q: "Un ventilateur consomme-t-il moins qu'une clim ?", r: "Oui, beaucoup moins, mais il ne fait pas baisser la température de la pièce." },
    ],
    voirAussi: ["/blog/climatiseur-sans-evacuation", "/blog/rafraichir-appartement-canicule", "/climatiseurs"],
  },
  {
    chemin: "/blog/climatiseur-sans-evacuation",
    parent: "/blog",
    nomCourt: "Climatiseur sans évacuation",
    type: "article",
    date: DATE_ARTICLES,
    title: "Climatiseur sans évacuation : ça existe ? (2026) | Lootaclim",
    description:
      "Un climatiseur sans évacuation, ça n'existe pas : on vous explique pourquoi, ce que valent les appareils « sans tuyau » et la solution sans travaux.",
    h1: "Climatiseur sans évacuation : est-ce que ça existe vraiment ?",
    enBref:
      "Non, un vrai climatiseur ne peut pas fonctionner sans évacuation : il doit rejeter dehors la chaleur qu'il retire de la pièce. Les appareils vendus « sans évacuation » sont en réalité des rafraîchisseurs d'air, beaucoup moins efficaces.",
    intro:
      "C'est l'une des questions les plus tapées sur Google en été. La réponse est simple, mais elle évite bien des achats décevants.",
    sections: [
      {
        h2: "Pourquoi un climatiseur doit-il évacuer l'air chaud ?",
        p: "Un climatiseur ne fabrique pas du froid : il déplace la chaleur. Sans gaine vers l'extérieur, la chaleur retirée reste dans la pièce, et la température ne baisse pas.",
      },
      {
        h2: "Que valent les climatiseurs vendus « sans évacuation » ?",
        p: "Ce sont des rafraîchisseurs d'air : ils soufflent de l'air passé sur de l'eau. Ils rafraîchissent de quelques degrés au mieux et humidifient la pièce.",
        liens: [{ href: "/blog/ventilateur-ou-climatiseur", texte: "Ventilateur, rafraîchisseur ou climatiseur ?" }],
      },
      {
        h2: "Existe-t-il un climatiseur sans évacuation silencieux ?",
        p: "Les rafraîchisseurs sont souvent silencieux, mais peu efficaces. Pour du silence et du vrai froid, il faut un climatiseur mobile silencieux avec gaine, comme SEINE ({seine.bruit} dB).",
        liens: [{ href: "/climatiseurs/seine", texte: "Découvrir SEINE" }],
      },
      {
        h2: "Comment faire sans percer le mur ?",
        p: "On fait passer la gaine par une fenêtre entrouverte.",
        h3: [
          {
            titre: "Le kit de calfeutrage fenêtre",
            p: "Une toile ferme l'espace autour de la gaine pour que l'air chaud ne rentre pas. Aucun perçage, aucune trace.",
            lien: { href: "/blog/kit-calfeutrage-fenetre-climatiseur", texte: "Comment poser un kit de calfeutrage" },
          },
        ],
      },
      {
        h2: "La solution sans travaux : la location installée",
        p: "Chez LOOTACLIM, on livre le climatiseur et on pose le kit fenêtre pour vous, sous 24h.",
        liens: [{ href: "/comment-ca-marche", texte: "Comment ça marche" }],
      },
    ],
    faq: [
      { q: "Un climatiseur sans tuyau, ça existe ?", r: "Pas un vrai climatiseur. Les « climatiseurs sans tuyau » sont des rafraîchisseurs d'air." },
      { q: "Peut-on faire passer la gaine sans ouvrir la fenêtre ?", r: "Non : la gaine doit sortir dehors. On entrouvre la fenêtre et on ferme l'espace restant avec un kit de calfeutrage." },
    ],
    voirAussi: ["/blog/kit-calfeutrage-fenetre-climatiseur", "/blog/ventilateur-ou-climatiseur", "/climatiseurs"],
  },
  {
    chemin: "/blog/kit-calfeutrage-fenetre-climatiseur",
    parent: "/blog",
    nomCourt: "Kit de calfeutrage",
    type: "article",
    date: DATE_ARTICLES,
    title: "Kit calfeutrage clim : bien calfeutrer une fenêtre pour climatiseur mobile",
    description:
      "Fenêtre classique, porte-fenêtre ou Velux : comment poser un kit de calfeutrage pour climatiseur mobile, quel modèle choisir et les erreurs à ne pas faire.",
    h1: "Kit calfeutrage clim : comment calfeutrer une fenêtre pour climatiseur mobile",
    enBref:
      "Un kit de calfeutrage est une toile qui ferme l'espace autour de la gaine d'un climatiseur mobile passée par la fenêtre. Il empêche l'air chaud de rentrer et se pose sans perçage, sur une fenêtre, une porte-fenêtre ou parfois un Velux.",
    intro:
      "Une gaine passée par une fenêtre grande ouverte, c'est une bonne partie du froid qui s'échappe. Le kit de calfeutrage règle le problème pour quelques euros.",
    sections: [
      {
        h2: "À quoi sert un kit de calfeutrage ?",
        p: "À rendre la fenêtre étanche autour de la gaine. Sans lui, l'air chaud extérieur entre dans la pièce et le climatiseur perd une grande partie de son efficacité.",
      },
      {
        h2: "Comment calfeutrer une fenêtre classique ?",
        p: "Fixez la toile sur le cadre ouvrant et le dormant avec les bandes auto-agrippantes, fermez la fenêtre contre la toile, puis passez la gaine par l'ouverture prévue.",
      },
      {
        h2: "Comment calfeutrer une porte-fenêtre ?",
        p: "Choisissez un kit assez long pour couvrir toute la hauteur, avec une fermeture éclair qui permet de passer.",
      },
      { h2: "Et pour une fenêtre de toit ou un Velux ?", p: "Il existe des kits spécifiques pour fenêtres de toit, adaptés à leur ouverture en biais." },
      {
        h2: "Quel kit de calfeutrage choisir ?",
        p: "Vérifiez la longueur (périmètre de la fenêtre), le type de fixation et le diamètre de l'ouverture pour la gaine.",
      },
      {
        h2: "Les erreurs à éviter",
        p: "Ouvrir la fenêtre en grand, écraser la gaine, la rallonger au-delà de sa longueur, ou laisser des jours entre la toile et le cadre.",
      },
      {
        h2: "Chez LOOTACLIM, le kit est posé pour vous",
        p: "Avec la location, nous fournissons et installons le kit de calfeutrage : vous n'avez rien à acheter ni à poser.",
        liens: [{ href: "/comment-ca-marche", texte: "Comment se passe l'installation" }],
      },
    ],
    faq: [
      { q: "Faut-il percer pour poser un kit ?", r: "Non, il se fixe avec des bandes auto-agrippantes." },
      { q: "Le kit abîme-t-il la fenêtre ?", r: "Non, il se retire sans laisser de trace." },
    ],
    voirAussi: ["/blog/climatiseur-sans-evacuation", "/comment-ca-marche", "/blog/consommation-climatiseur-mobile"],
  },
  {
    chemin: "/blog/meilleur-climatiseur-mobile",
    parent: "/blog",
    nomCourt: "Bien choisir son climatiseur",
    type: "article",
    date: DATE_ARTICLES,
    title: "Meilleur climatiseur mobile 2026 : bien choisir (et faut-il l'acheter ?)",
    description:
      "Silence, puissance, consommation, prix : nos critères pour choisir le meilleur climatiseur mobile en 2026, et pourquoi la location peut être plus maligne.",
    h1: "Meilleur climatiseur mobile 2026 : comment bien choisir ?",
    enBref:
      "Le meilleur climatiseur mobile est celui qui a la bonne puissance pour votre pièce (environ 100 W/m²), un niveau sonore sous 45 dB pour une chambre, une bonne efficacité énergétique et une gaine bien calfeutrée. Pour un usage de quelques semaines, louer évite d'acheter le mauvais modèle.",
    intro:
      "Plutôt qu'un classement de marques qui change chaque année, voici les critères qui font vraiment la différence.",
    sections: [
      {
        h2: "Quel est le meilleur climatiseur mobile ?",
        p: "Celui qui correspond à votre pièce : la surface décide de la puissance, l'usage décide du niveau sonore.",
      },
      {
        h2: "Les 5 critères pour bien choisir",
        p: "Dans l'ordre d'importance pour un appartement parisien :",
        h3: [
          { titre: "Le bruit", p: "Sous 45 dB pour une chambre, sous 50 dB pour une pièce de jour." },
          { titre: "La puissance", p: "Environ 100 W par m², plus sous les toits.", lien: { href: "/blog/quelle-puissance-climatiseur-surface", texte: "Calculer la puissance" } },
          { titre: "La consommation", p: "Regardez la puissance absorbée et la classe énergétique.", lien: { href: "/blog/consommation-climatiseur-mobile", texte: "Combien consomme une clim" } },
          { titre: "Le gaz réfrigérant", p: "Les gaz récents, comme le R290, ont un impact climatique plus faible." },
          { titre: "Le prix", p: "Comparez le prix d'achat avec le coût de location sur votre durée réelle d'utilisation." },
        ],
      },
      {
        h2: "Quelle est la meilleure clim mobile pour une chambre ?",
        p: "Un modèle d'environ 2 kW sous 45 dB, comme SEINE ({seine.bruit} dB).",
        liens: [{ href: "/climatiseurs/seine", texte: "Découvrir SEINE" }],
      },
      {
        h2: "Faut-il acheter ou louer ?",
        p: "Pour quelques semaines par an, la location est souvent plus maligne : pas d'achat, pas de stockage, et vous testez le bon modèle avant de vous décider.",
        liens: [{ href: "/tarifs", texte: "Voir nos tarifs de location" }],
      },
    ],
    faq: [
      { q: "Quel climatiseur mobile est le plus silencieux ?", r: "Visez les modèles sous 45 dB. Chez nous, c'est SEINE, à {seine.bruit} dB." },
      { q: "Quelle puissance choisir pour un salon ?", r: "Environ 100 W par m² : 3 kW pour 30 m², un peu plus sous les toits." },
    ],
    voirAussi: ["/climatiseurs", "/blog/quelle-puissance-climatiseur-surface", "/blog/consommation-climatiseur-mobile"],
  },
];

export function trouverPage(chemin) {
  return PAGES_SEO.find((p) => p.chemin === chemin) ?? null;
}

// Fil d'Ariane d'une page : Accueil > parents > page.
export function filAriane(page) {
  const fil = [];
  let courante = page;
  while (courante) {
    fil.unshift({ nom: courante.nomCourt, chemin: courante.chemin });
    courante = courante.parent ? trouverPage(courante.parent) : null;
  }
  return [{ nom: "Accueil", chemin: "/" }, ...fil];
}

export const ARTICLES = PAGES_SEO.filter((p) => p.type === "article");

// Questions/réponses d'une page (FAQ classique, ou H3 des sections pour /faq).
export function faqDePage(page) {
  if (page.faqDepuisSections) {
    return page.sections.flatMap((s) => (s.h3 ?? []).filter((h) => h.p).map((h) => ({ q: h.titre, r: h.p })));
  }
  return page.faq ?? [];
}
