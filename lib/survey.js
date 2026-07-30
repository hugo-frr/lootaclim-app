// Enquête de marché : questions, validation et totaux.
//
// Chaque question éclaire une décision d'entreprise précise — dimensionner le
// parc, valider les prix, cibler les livraisons. Les questions qui n'orientent
// aucune décision ont été écartées : chacune en plus fait chuter le taux de
// réponses complètes.
//
// Aucune donnée sensible n'est demandée : ni revenu, ni nom, ni adresse précise.

export const SURVEY_QUESTIONS = [
  {
    id: "surface",
    label: "Quelle surface voudriez-vous rafraîchir ?",
    choices: [
      { value: "moins-20", label: "Moins de 20 m² — une chambre, un studio" },
      { value: "20-35", label: "20 à 35 m² — un séjour" },
      { value: "35-50", label: "35 à 50 m²" },
      { value: "plus-50", label: "Plus de 50 m²" },
    ],
  },
  {
    id: "location",
    label: "Dans quel arrondissement ou quelle commune ?",
    // Question ouverte : la liste des communes de la petite couronne serait
    // interminable, et un champ court se remplit plus vite qu'un menu déroulant.
    free: true,
    maxLength: 60,
    placeholder: "11e, Montreuil, Boulogne…",
  },
  {
    id: "housing",
    label: "Vous êtes plutôt…",
    choices: [
      { value: "locataire", label: "Locataire" },
      { value: "proprietaire", label: "Propriétaire" },
    ],
  },
  {
    id: "duration",
    label: "Combien de temps loueriez-vous un climatiseur ?",
    choices: [
      { value: "quelques-jours", label: "Quelques jours, le temps d'une canicule" },
      { value: "une-semaine", label: "Environ une semaine" },
      { value: "deux-trois-semaines", label: "Deux à trois semaines" },
      { value: "tout-l-ete", label: "Tout l'été" },
    ],
  },
  {
    id: "priceRange",
    label: "Quel prix par jour vous paraîtrait acceptable ?",
    choices: [
      { value: "moins-10", label: "Moins de 10 €" },
      { value: "10-15", label: "10 à 15 €" },
      { value: "15-20", label: "15 à 20 €" },
      { value: "20-30", label: "20 à 30 €" },
      { value: "plus-30", label: "Plus de 30 €" },
    ],
  },
  {
    id: "currentSolution",
    label: "Aujourd'hui, comment supportez-vous la chaleur ?",
    choices: [
      { value: "rien", label: "Je subis, je n'ai rien" },
      { value: "ventilateur", label: "Un ventilateur" },
      { value: "clim-achetee", label: "J'ai acheté un climatiseur" },
      { value: "je-pars", label: "Je quitte Paris" },
    ],
  },
  {
    id: "blocker",
    label: "Qu'est-ce qui vous ferait le plus hésiter à louer ?",
    choices: [
      { value: "prix", label: "Le prix" },
      { value: "installation", label: "L'installation, l'évacuation par la fenêtre" },
      { value: "bruit", label: "Le bruit" },
      { value: "place", label: "La place que ça prend" },
      { value: "rien", label: "Rien, l'idée me convient" },
    ],
  },
  {
    id: "ageRange",
    label: "Votre tranche d'âge ?",
    choices: [
      { value: "moins-25", label: "Moins de 25 ans" },
      { value: "25-34", label: "25 à 34 ans" },
      { value: "35-49", label: "35 à 49 ans" },
      { value: "50-64", label: "50 à 64 ans" },
      { value: "65-plus", label: "65 ans et plus" },
    ],
  },
];

// Vérification volontairement stricte : un formulaire web se modifie depuis le
// navigateur, on ne fait jamais confiance à ce qui arrive.
export function validateSurvey(donnees = {}) {
  const erreurs = {};
  const valeurs = {};

  for (const question of SURVEY_QUESTIONS) {
    const brut = donnees[question.id];

    if (question.free) {
      const texte = typeof brut === "string" ? brut.trim() : "";
      if (!texte) {
        erreurs[question.id] = "Réponse attendue.";
      } else if (texte.length > question.maxLength) {
        erreurs[question.id] = `Réponse trop longue (${question.maxLength} caractères maximum).`;
      } else {
        valeurs[question.id] = texte;
      }
      continue;
    }

    if (typeof brut !== "string" || !brut) {
      erreurs[question.id] = "Réponse attendue.";
    } else if (!question.choices.some((c) => c.value === brut)) {
      erreurs[question.id] = "Réponse inattendue.";
    } else {
      valeurs[question.id] = brut;
    }
  }

  // L'email est facultatif : c'est lui qui transforme l'enquête en liste
  // d'attente, mais l'exiger ferait fuir une partie des répondants.
  const email = typeof donnees.email === "string" ? donnees.email.trim().toLowerCase() : "";
  if (!email) {
    valeurs.email = null;
  } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) || email.length > 120) {
    erreurs.email = "Adresse email invalide.";
  } else {
    valeurs.email = email;
  }

  if (Object.keys(erreurs).length > 0) return { ok: false, erreurs };
  return { ok: true, valeurs };
}

// Totaux par question, pour la page d'analyse du back-office.
// Les choix jamais retenus sont conservés à zéro : une option qui ne recueille
// aucune réponse est une information en soi.
export function summarise(reponses = []) {
  return SURVEY_QUESTIONS.map((question) => {
    const total = reponses.length;

    // Question ouverte : les choix n'existent pas d'avance, on regroupe ce qui
    // a réellement été saisi. C'est ainsi qu'on voit quels arrondissements
    // ressortent, du plus cité au moins cité.
    if (question.free) {
      const compte = new Map();
      for (const r of reponses) {
        const brut = typeof r?.[question.id] === "string" ? r[question.id].trim() : "";
        if (!brut) continue;
        const cle = brut.toLowerCase();
        const actuel = compte.get(cle) ?? { label: brut, count: 0 };
        actuel.count += 1;
        compte.set(cle, actuel);
      }
      const choices = [...compte.entries()]
        .map(([value, { label, count }]) => ({
          value,
          label,
          count,
          percent: total > 0 ? Math.round((count / total) * 100) : 0,
        }))
        .sort((a, b) => b.count - a.count);
      return { id: question.id, label: question.label, total, free: true, choices };
    }

    const choices = question.choices.map((choix) => {
      const count = reponses.filter((r) => r?.[question.id] === choix.value).length;
      return {
        value: choix.value,
        label: choix.label,
        count,
        percent: total > 0 ? Math.round((count / total) * 100) : 0,
      };
    });
    return { id: question.id, label: question.label, total, choices };
  });
}
