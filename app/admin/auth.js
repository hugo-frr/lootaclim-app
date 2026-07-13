// Garde d'accès des Server Actions admin + anti-force-brute de la connexion.
// Fichier serveur uniquement (il importe next/headers).

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { verifySession, SESSION_COOKIE } from "../../lib/session";

// Double verrou avec le middleware : à appeler en tête de CHAQUE action admin.
export async function requireAdmin() {
  const token = cookies().get(SESSION_COOKIE)?.value ?? "";
  const secret = process.env.SESSION_SECRET;
  if (!secret || !(await verifySession(token, secret, Date.now()))) {
    redirect("/admin/connexion");
  }
}

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
