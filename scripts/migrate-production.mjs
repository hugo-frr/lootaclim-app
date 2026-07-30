// Prépare la connexion à la base et applique les migrations Prisma, mais
// UNIQUEMENT lors d'un déploiement de production.
//
// Pourquoi le garde-fou de production : Vercel compile chaque branche poussée,
// pas seulement la production, et injecte les mêmes variables de base dans tous
// les environnements. Sans ce filtre, une branche d'essai appliquerait ses
// migrations à la base des vrais clients — et une migration ne se rembobine
// pas. Revenir en arrière sur le code ne remet pas la base dans son état
// précédent.
//
// Pourquoi la normalisation des noms : selon la façon dont la base Neon a été
// créée, Vercel expose soit ses noms d'origine (DATABASE_URL,
// DATABASE_URL_UNPOOLED), soit les noms de compatibilité (POSTGRES_PRISMA_URL,
// POSTGRES_URL_NON_POOLING), soit les deux. Le schéma Prisma lit les seconds :
// on comble donc les manques à partir des premiers plutôt que de dépendre du
// nommage exact de l'intégration.

import { spawnSync } from "node:child_process";

// Ce que prisma/schema.prisma exige, et où aller le chercher à défaut.
const REQUIS = [
  {
    cible: "POSTGRES_PRISMA_URL",
    role: "adresse groupée, utilisée par l'application à chaque requête",
    reprises: ["DATABASE_URL", "POSTGRES_URL"],
  },
  {
    cible: "POSTGRES_URL_NON_POOLING",
    role: "adresse directe, exigée par les migrations",
    reprises: ["DATABASE_URL_UNPOOLED", "POSTGRES_URL_NO_SSL"],
  },
];

const manquantes = [];

for (const { cible, role, reprises } of REQUIS) {
  if (process.env[cible]) continue;
  const secours = reprises.find((nom) => process.env[nom]);
  if (secours) {
    process.env[cible] = process.env[secours];
    console.log(`${cible} absente, reprise depuis ${secours}.`);
  } else {
    manquantes.push({ cible, role, reprises });
  }
}

if (manquantes.length > 0) {
  console.error("\n⛔ Impossible de joindre la base de données.\n");
  for (const { cible, role, reprises } of manquantes) {
    console.error(`  ${cible} — ${role}`);
    console.error(`    aucune valeur trouvée, ni sous ce nom ni sous : ${reprises.join(", ")}\n`);
  }
  console.error("À faire dans Vercel : Settings → Environment Variables,");
  console.error("puis saisir ces variables avec les valeurs du fichier .env local.");
  console.error("Vérifier aussi que la base Neon est bien rattachée à ce projet");
  console.error("(onglet Storage de la base → Connected Projects).\n");
  process.exit(1);
}

const environnement = process.env.VERCEL_ENV;

if (environnement !== "production") {
  console.log(
    `Migrations ignorées (VERCEL_ENV=${environnement ?? "absent"}). ` +
      `Elles ne s'appliquent qu'en production.`
  );
  process.exit(0);
}

console.log("Déploiement de production : application des migrations.");
const resultat = spawnSync("npx", ["prisma", "migrate", "deploy"], {
  stdio: "inherit",
  shell: false,
  env: process.env,
});

// Un échec doit arrêter le déploiement : mieux vaut ne rien mettre en ligne
// qu'un site dont le schéma ne correspond pas au code.
process.exit(resultat.status ?? 1);
