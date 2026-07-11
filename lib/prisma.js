import { PrismaClient } from "@prisma/client";

// En développement, Next.js recharge les modules à chaud : sans ce singleton,
// on créerait une nouvelle connexion à chaque modification de fichier.
const globalForPrisma = globalThis;

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
