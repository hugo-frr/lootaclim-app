// Applique les migrations Prisma, mais UNIQUEMENT lors d'un déploiement de
// production.
//
// Pourquoi ce garde-fou : Vercel compile chaque branche poussée, pas seulement
// la production, et il injecte les mêmes variables de base dans tous les
// environnements. Sans ce filtre, une branche d'essai appliquerait ses
// migrations à la base des vrais clients — et une migration ne se rembobine
// pas. Revenir en arrière sur le code ne remet pas la base dans son état
// précédent.
//
// - Sur Vercel en production (VERCEL_ENV=production) : les migrations passent.
// - Sur Vercel en préversion (VERCEL_ENV=preview) : rien, la base reste intacte.
// - En local (VERCEL_ENV absent) : rien. Pour migrer chez soi, lancer
//   explicitement "npx prisma migrate dev".

import { spawnSync } from "node:child_process";

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
});

// Un échec doit arrêter le déploiement : mieux vaut ne rien mettre en ligne
// qu'un site dont le schéma ne correspond pas au code.
process.exit(resultat.status ?? 1);
