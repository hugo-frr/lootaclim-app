"use server";

import { prisma } from "../lib/prisma";
import { validateSurvey } from "../lib/survey";

// Enregistre une réponse à l'enquête de marché.
// La validation est refaite ici contre les questions réellement en base : le
// formulaire est manipulable depuis le navigateur, seul le serveur fait
// autorité.
export async function submitSurvey(donnees) {
  const questions = await prisma.surveyQuestion.findMany({
    where: { active: true },
    include: { choices: true },
  });

  const controle = validateSurvey(questions, donnees);
  if (!controle.ok) return { ok: false, erreurs: controle.erreurs };

  try {
    await prisma.surveyResponse.create({
      data: { answers: { create: controle.reponses } },
    });
  } catch (erreur) {
    // Une enquête ne doit jamais empêcher quelqu'un d'utiliser le site.
    console.error("Enquête : enregistrement impossible —", erreur?.message);
    return { ok: false, erreurs: { global: "Enregistrement impossible pour l'instant." } };
  }

  return { ok: true };
}
