// Crée un compte du back-office. À utiliser une fois pour le premier
// administrateur ; ensuite, tout se fait depuis /admin/equipe.
//
//   node prisma/creer-compte.js "Hugo Férré" hugo@lootaclim.fr ADMIN
//
// Le mot de passe est demandé au clavier, jamais passé en argument : une
// commande reste dans l'historique du terminal, et y laisser un mot de passe
// serait le publier.

import { PrismaClient } from "@prisma/client";
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { hashPassword, passwordError } from "../lib/password.js";
import { ROLES, ROLE_LABELS } from "../lib/roles.js";

const prisma = new PrismaClient();

async function demanderMotDePasse(question) {
  const rl = createInterface({ input: stdin, output: stdout });
  // On masque la frappe : le mot de passe ne doit pas rester affiché à l'écran.
  const surDonnee = () => {};
  rl.output.write = ((ecrire) => (chaine, ...reste) => {
    if (rl.stdoutMuted && !chaine.includes(question)) return true;
    return ecrire.call(rl.output, chaine, ...reste);
  })(stdout.write.bind(stdout));

  const promesse = rl.question(question);
  rl.stdoutMuted = true;
  const reponse = await promesse;
  rl.stdoutMuted = false;
  stdout.write("\n");
  rl.off("line", surDonnee);
  rl.close();
  return reponse;
}

async function main() {
  const [nom, email, role = "ADMIN"] = process.argv.slice(2);

  if (!nom || !email) {
    console.error("\nUsage : node prisma/creer-compte.js \"Prénom Nom\" email@exemple.fr [RÔLE]");
    console.error(`Rôles possibles : ${ROLES.join(", ")}\n`);
    process.exit(1);
  }
  if (!ROLES.includes(role)) {
    console.error(`\n⛔ Rôle inconnu : ${role}. Attendu : ${ROLES.join(", ")}\n`);
    process.exit(1);
  }

  const normalise = email.trim().toLowerCase();
  const existant = await prisma.user.findUnique({ where: { email: normalise } });
  if (existant) {
    console.error(`\n⛔ Un compte existe déjà pour ${normalise}.`);
    console.error("   Modifiez-le depuis /admin/equipe plutôt que de le recréer.\n");
    process.exit(1);
  }

  const motDePasse = await demanderMotDePasse(`Mot de passe pour ${normalise} : `);
  const erreur = passwordError(motDePasse);
  if (erreur) {
    console.error(`\n⛔ ${erreur}\n`);
    process.exit(1);
  }

  await prisma.user.create({
    data: {
      name: nom.trim(),
      email: normalise,
      passwordHash: await hashPassword(motDePasse),
      role,
    },
  });

  console.log(`\n✅ Compte créé : ${nom} (${normalise}) — ${ROLE_LABELS[role]}\n`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
