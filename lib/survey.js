// Enquête de marché : validation et totaux.
//
// Les questions ne sont plus écrites en dur : elles viennent de la base, pour
// qu'Hugo puisse les modifier, en ajouter et les réordonner depuis le
// back-office sans déploiement. Ce fichier ne connaît donc que leur forme,
// jamais leur contenu — ce qui le garde pur et testable sans base de données.

export const QUESTION_TYPES = ["choice", "text", "email"];

export const MAX_TEXTE = 60;
export const MAX_EMAIL = 120;

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

// Les questions actives, dans l'ordre d'affichage.
export function orderQuestions(questions = []) {
  return [...questions]
    .filter((q) => q.active !== false)
    .sort((a, b) => a.position - b.position)
    .map((q) => ({
      ...q,
      choices: [...(q.choices ?? [])].sort((a, b) => a.position - b.position),
    }));
}

// Une question est-elle correctement remplie ? Renvoie un message d'erreur, ou
// null si tout va bien. Utilisée par le formulaire pour bloquer le passage à
// l'écran suivant, et par le serveur qui refait le contrôle.
export function checkAnswer(question, valeur) {
  const vide = valeur === undefined || valeur === null || String(valeur).trim() === "";

  if (vide) return question.required ? "Réponse attendue." : null;

  const texte = String(valeur).trim();

  if (question.type === "choice") {
    const connu = (question.choices ?? []).some((c) => c.id === texte);
    return connu ? null : "Réponse inattendue.";
  }

  if (question.type === "email") {
    if (texte.length > MAX_EMAIL) return "Adresse email trop longue.";
    return EMAIL.test(texte) ? null : "Adresse email invalide.";
  }

  if (texte.length > MAX_TEXTE) {
    return `Réponse trop longue (${MAX_TEXTE} caractères maximum).`;
  }
  return null;
}

// Contrôle complet, refait côté serveur : un formulaire web se modifie depuis
// le navigateur, on ne fait jamais confiance à ce qui arrive.
export function validateSurvey(questions, donnees = {}) {
  const actives = orderQuestions(questions);
  const erreurs = {};
  const reponses = [];

  for (const question of actives) {
    const brut = donnees[question.id];
    const erreur = checkAnswer(question, brut);
    if (erreur) {
      erreurs[question.id] = erreur;
      continue;
    }

    const vide = brut === undefined || brut === null || String(brut).trim() === "";
    if (vide) continue; // question facultative laissée vide : rien à enregistrer

    const texte = String(brut).trim();
    reponses.push(
      question.type === "choice"
        ? { questionId: question.id, choiceId: texte }
        : {
            questionId: question.id,
            text: question.type === "email" ? texte.toLowerCase() : texte,
          }
    );
  }

  if (Object.keys(erreurs).length > 0) return { ok: false, erreurs };
  if (reponses.length === 0) return { ok: false, erreurs: { global: "Aucune réponse." } };
  return { ok: true, reponses };
}

// Totaux par question, pour la page d'analyse.
// Les choix jamais retenus restent affichés à zéro : une option que personne ne
// coche est une information en soi.
export function summarise(questions, responses = []) {
  const actives = orderQuestions(questions);

  return actives.map((question) => {
    const donnees = responses
      .flatMap((r) => r.answers ?? [])
      .filter((a) => a.questionId === question.id);
    const total = donnees.length;

    if (question.type === "choice") {
      const choices = question.choices.map((choix) => {
        const count = donnees.filter((a) => a.choiceId === choix.id).length;
        return {
          id: choix.id,
          label: choix.label,
          count,
          percent: total > 0 ? Math.round((count / total) * 100) : 0,
        };
      });
      return { id: question.id, label: question.label, type: question.type, total, choices };
    }

    // Réponses libres : on regroupe ce qui a réellement été saisi, du plus
    // cité au moins cité.
    const compte = new Map();
    for (const a of donnees) {
      const brut = (a.text ?? "").trim();
      if (!brut) continue;
      const cle = brut.toLowerCase();
      const actuel = compte.get(cle) ?? { label: brut, count: 0 };
      actuel.count += 1;
      compte.set(cle, actuel);
    }
    const choices = [...compte.entries()]
      .map(([id, { label, count }]) => ({
        id,
        label,
        count,
        percent: total > 0 ? Math.round((count / total) * 100) : 0,
      }))
      .sort((a, b) => b.count - a.count);

    return { id: question.id, label: question.label, type: question.type, total, choices };
  });
}

// Déplacement d'une question dans l'ordre. Renvoie la liste des positions à
// écrire, ou null si le déplacement est impossible (déjà en haut ou en bas).
export function reorder(questions, questionId, direction) {
  const ordonnees = [...questions].sort((a, b) => a.position - b.position);
  const index = ordonnees.findIndex((q) => q.id === questionId);
  if (index === -1) return null;

  const cible = direction === "haut" ? index - 1 : index + 1;
  if (cible < 0 || cible >= ordonnees.length) return null;

  [ordonnees[index], ordonnees[cible]] = [ordonnees[cible], ordonnees[index]];
  // On réécrit toutes les positions : c'est le seul moyen sûr quand l'ordre
  // d'origine comporte des trous ou des doublons.
  return ordonnees.map((q, i) => ({ id: q.id, position: i }));
}
