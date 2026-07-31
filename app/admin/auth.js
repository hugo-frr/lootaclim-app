// Garde d'accès des Server Actions admin + anti-force-brute de la connexion.
// Fichier serveur uniquement (il importe next/headers).

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { readSession, SESSION_COOKIE, SESSION_SECOURS } from "../../lib/session";
import { can } from "../../lib/roles";
import { prisma } from "../../lib/prisma";

/**
 * Qui est connecté, ou null.
 *
 * Le rôle est relu EN BASE à chaque requête, jamais pris dans le jeton :
 * retirer un rôle prend ainsi effet immédiatement, au lieu d'attendre
 * l'expiration de la session (sept jours).
 */
export async function currentUser() {
  const secret = process.env.SESSION_SECRET;
  if (!secret) return null;

  const session = await readSession(
    cookies().get(SESSION_COOKIE)?.value ?? "",
    secret,
    Date.now()
  );
  if (!session) return null;

  // Accès de secours par ADMIN_PASSWORD : aucun compte en base derrière, mais
  // tous les droits. Il garantit qu'on ne peut jamais être verrouillé hors de
  // son propre back-office si la création des comptes tourne mal.
  if (session.userId === SESSION_SECOURS) {
    return { id: null, name: "Accès de secours", email: null, role: "ADMIN", secours: true };
  }

  const user = await prisma.user.findUnique({ where: { id: session.userId } });
  // Un compte désactivé perd l'accès sans qu'on ait à révoquer sa session.
  if (!user || !user.active) return null;
  return { ...user, secours: false };
}

/** Exige d'être connecté. Renvoie l'utilisateur. */
export async function requireUser() {
  const user = await currentUser();
  if (!user) redirect("/admin/connexion");
  return user;
}

/** Exige un droit précis. Renvoie l'utilisateur. */
export async function requireCan(action) {
  const user = await requireUser();
  if (!can(user.role, action)) {
    redirect(`/admin?erreur=${encodeURIComponent("Vous n'avez pas accès à cette fonction.")}`);
  }
  return user;
}

// Conservé le temps que chaque action reçoive le droit qui la concerne
// (étape 5). Signifie aujourd'hui « être connecté », rien de plus.
export const requireAdmin = requireUser;

// Anti-force-brute en mémoire, par IP, fenêtre glissante de 15 minutes.
// Limite assumée : compteur perdu au redémarrage — suffisant en mono-instance.
const attempts = new Map();
const WINDOW_MS = 15 * 60 * 1000;
const MAX_FREE_ATTEMPTS = 5;
const DELAY_MS = 3000;

export async function throttleLogin(ip) {
  const entry = attempts.get(ip);
  if (entry && Date.now() - entry.since > WINDOW_MS) attempts.delete(ip);
  const current = attempts.get(ip);
  if (current && current.count >= MAX_FREE_ATTEMPTS) {
    await new Promise((resolve) => setTimeout(resolve, DELAY_MS));
  }
}

export function recordLoginFailure(ip) {
  const entry = attempts.get(ip) ?? { count: 0, since: Date.now() };
  entry.count += 1;
  attempts.set(ip, entry);
}

export function clearLoginFailures(ip) {
  attempts.delete(ip);
}
