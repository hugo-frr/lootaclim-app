// Questions de départ de l'enquête de marché.
//
// À lancer une seule fois : `node prisma/seed-enquete.js`. Le script ne fait
// rien si des questions existent déjà — Hugo les modifie ensuite depuis le
// back-office, et on ne veut pas écraser son travail.

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const ARRONDISSEMENTS = [
  ...Array.from({ length: 20 }, (_, i) => (i === 0 ? "1er" : `${i + 1}e`)),
  "Hauts-de-Seine (92)",
  "Seine-Saint-Denis (93)",
  "Val-de-Marne (94)",
  "Ailleurs en Île-de-France",
];

const QUESTIONS = [
  {
    label: "Quelle surface voudriez-vous rafraîchir ?",
    helper: "La pièce principale, celle où vous passez vos soirées.",
    choices: [
      "Moins de 20 m² — une chambre, un studio",
      "20 à 35 m² — un séjour",
      "35 à 50 m²",
      "Plus de 50 m²",
    ],
  },
  {
    label: "Où habitez-vous ?",
    helper: "Pour savoir où concentrer nos livraisons.",
    choices: ARRONDISSEMENTS,
  },
  {
    label: "Vous êtes plutôt…",
    helper: "Un locataire ne peut pas installer de climatiseur fixe.",
    choices: ["Locataire", "Propriétaire"],
  },
  {
    label: "Combien de temps loueriez-vous un climatiseur ?",
    choices: [
      "Quelques jours, le temps d'une canicule",
      "Environ une semaine",
      "Deux à trois semaines",
      "Tout l'été",
    ],
  },
  {
    label: "Quel prix par jour vous paraîtrait acceptable ?",
    helper: "Livraison et reprise comprises.",
    choices: ["Moins de 10 €", "10 à 15 €", "15 à 20 €", "20 à 30 €", "Plus de 30 €"],
  },
  {
    label: "Aujourd'hui, comment supportez-vous la chaleur ?",
    choices: [
      "Je subis, je n'ai rien",
      "Un ventilateur",
      "J'ai acheté un climatiseur",
      "Je quitte Paris",
    ],
  },
  {
    label: "Qu'est-ce qui vous ferait le plus hésiter à louer ?",
    choices: [
      "Le prix",
      "L'installation, l'évacuation par la fenêtre",
      "Le bruit",
      "La place que ça prend",
      "Rien, l'idée me convient",
    ],
  },
  {
    label: "Votre tranche d'âge ?",
    choices: [
      "Moins de 25 ans",
      "25 à 34 ans",
      "35 à 49 ans",
      "50 à 64 ans",
      "65 ans et plus",
    ],
  },
  {
    label: "Votre email, pour être prévenu du lancement",
    helper: "Facultatif. Nous ne le transmettons à personne.",
    type: "email",
    required: false,
    choices: [],
  },
];

async function main() {
  const existantes = await prisma.surveyQuestion.count();
  if (existantes > 0) {
    console.log(`${existantes} question(s) déjà en base — rien à faire.`);
    return;
  }

  for (const [position, q] of QUESTIONS.entries()) {
    await prisma.surveyQuestion.create({
      data: {
        label: q.label,
        helper: q.helper ?? null,
        type: q.type ?? "choice",
        required: q.required ?? true,
        position,
        choices: {
          create: q.choices.map((label, i) => ({ label, position: i })),
        },
      },
    });
  }

  const total = await prisma.surveyQuestion.count();
  const choix = await prisma.surveyChoice.count();
  console.log(`✅ ${total} questions créées, ${choix} choix au total.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
