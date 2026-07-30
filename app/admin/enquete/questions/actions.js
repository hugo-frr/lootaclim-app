"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "../../../../lib/prisma";
import { QUESTION_TYPES, reorder } from "../../../../lib/survey";

function rafraichir() {
  revalidatePath("/admin/enquete/questions");
  revalidatePath("/"); // la page d'accueil affiche le questionnaire
}

function texte(formData, clef, max = 200) {
  return String(formData.get(clef) ?? "").trim().slice(0, max);
}

// Une saisie multiligne devient une liste de choix : sans ça, créer les
// vingt-quatre arrondissements demanderait vingt-quatre allers-retours.
// Les doublons et les lignes vides sont écartés.
function lignes(formData, clef, max = 120) {
  const vues = new Set();
  return String(formData.get(clef) ?? "")
    .split("\n")
    .map((l) => l.trim().slice(0, max))
    .filter((l) => {
      if (!l) return false;
      const cle = l.toLowerCase();
      if (vues.has(cle)) return false;
      vues.add(cle);
      return true;
    });
}

export async function addQuestion(formData) {
  const label = texte(formData, "label");
  if (!label) return;

  const type = QUESTION_TYPES.includes(formData.get("type")) ? formData.get("type") : "choice";
  const dernier = await prisma.surveyQuestion.findFirst({ orderBy: { position: "desc" } });

  const choix = type === "choice" ? lignes(formData, "choices") : [];

  await prisma.surveyQuestion.create({
    data: {
      label,
      helper: texte(formData, "helper") || null,
      type,
      required: formData.get("required") === "on",
      position: (dernier?.position ?? -1) + 1,
      choices: { create: choix.map((label, i) => ({ label, position: i })) },
    },
  });
  rafraichir();
}

export async function updateQuestion(formData) {
  const id = texte(formData, "id", 40);
  const label = texte(formData, "label");
  if (!id || !label) return;

  await prisma.surveyQuestion.update({
    where: { id },
    data: {
      label,
      helper: texte(formData, "helper") || null,
      required: formData.get("required") === "on",
    },
  });
  rafraichir();
}

export async function toggleQuestion(formData) {
  const id = texte(formData, "id", 40);
  const question = await prisma.surveyQuestion.findUnique({ where: { id } });
  if (!question) return;

  await prisma.surveyQuestion.update({
    where: { id },
    data: { active: !question.active },
  });
  rafraichir();
}

// Suppression définitive, autorisée uniquement si personne n'y a répondu.
// Sinon on perdrait des réponses déjà recueillies sans possibilité de retour.
export async function deleteQuestion(formData) {
  const id = texte(formData, "id", 40);
  const reponses = await prisma.surveyAnswer.count({ where: { questionId: id } });
  if (reponses > 0) return;

  await prisma.surveyQuestion.delete({ where: { id } });
  rafraichir();
}

export async function moveQuestion(formData) {
  const id = texte(formData, "id", 40);
  const direction = formData.get("direction") === "haut" ? "haut" : "bas";

  const questions = await prisma.surveyQuestion.findMany({
    select: { id: true, position: true },
  });
  const positions = reorder(questions, id, direction);
  if (!positions) return; // déjà en haut ou en bas

  await prisma.$transaction(
    positions.map((p) =>
      prisma.surveyQuestion.update({ where: { id: p.id }, data: { position: p.position } })
    )
  );
  rafraichir();
}

export async function addChoice(formData) {
  const questionId = texte(formData, "questionId", 40);
  const nouveaux = lignes(formData, "label");
  if (!questionId || nouveaux.length === 0) return;

  const dernier = await prisma.surveyChoice.findFirst({
    where: { questionId },
    orderBy: { position: "desc" },
  });
  const depart = (dernier?.position ?? -1) + 1;

  await prisma.surveyChoice.createMany({
    data: nouveaux.map((label, i) => ({ questionId, label, position: depart + i })),
  });
  rafraichir();
}

// Un choix déjà retenu par quelqu'un n'est pas supprimé : les réponses
// pointeraient dans le vide et le total deviendrait faux.
export async function deleteChoice(formData) {
  const id = texte(formData, "id", 40);
  const utilise = await prisma.surveyAnswer.count({ where: { choiceId: id } });
  if (utilise > 0) return;

  await prisma.surveyChoice.delete({ where: { id } });
  rafraichir();
}
