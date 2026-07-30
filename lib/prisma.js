import { PrismaClient } from "@prisma/client";

// Adresse de la base, résolue à l'exécution.
//
// Selon la façon dont la base Neon a été créée, Vercel expose soit ses noms
// d'origine (DATABASE_URL), soit les noms de compatibilité
// (POSTGRES_PRISMA_URL), soit les deux. Le schéma Prisma lit le second : sans
// cette résolution, un projet où seul DATABASE_URL existe démarrerait puis
// planterait à la première requête, en pleine production.
//
// L'ordre suit la préférence : d'abord l'adresse groupée, seule adaptée à un
// hébergement sans serveur où chaque requête peut ouvrir sa propre connexion.
const ADRESSES = ["POSTGRES_PRISMA_URL", "DATABASE_URL", "POSTGRES_URL"];

function adresseBase() {
  for (const nom of ADRESSES) {
    if (process.env[nom]) return process.env[nom];
  }
  return undefined;
}

function creerClient() {
  const url = adresseBase();
  // Sans adresse, on laisse Prisma lever son erreur habituelle : elle nomme
  // précisément la variable attendue, ce qui est plus utile qu'un message maison.
  if (!url) return new PrismaClient();
  return new PrismaClient({ datasources: { db: { url } } });
}

// En développement, Next.js recharge les modules à chaud : sans ce singleton,
// on créerait une nouvelle connexion à chaque modification de fichier.
const globalForPrisma = globalThis;

export const prisma = globalForPrisma.prisma ?? creerClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
