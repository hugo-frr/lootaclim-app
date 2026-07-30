"use server";

import { prisma } from "../lib/prisma";
import { validateSurvey } from "../lib/survey";

// Enregistre une réponse à l'enquête de marché.
// La validation est refaite ici : le formulaire est manipulable depuis le
// navigateur, seul le serveur fait autorité.
export async function submitSurvey(donnees) {
  const controle = validateSurvey(donnees);
  if (!controle.ok) {
    return { ok: false, erreurs: controle.erreurs };
  }

  try {
    await prisma.surveyResponse.create({ data: controle.valeurs });
  } catch (erreur) {
    // Une enquête ne doit jamais empêcher quelqu'un d'utiliser le site.
    console.error("Enquête : enregistrement impossible —", erreur?.message);
    return { ok: false, erreurs: { global: "Enregistrement impossible pour l'instant." } };
  }

  return { ok: true };
}
