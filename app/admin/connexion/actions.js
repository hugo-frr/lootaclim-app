"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import crypto from "node:crypto";
import { signSession, SESSION_COOKIE, SESSION_DURATION_MS } from "../../../lib/session";
import { throttleLogin, recordLoginFailure, clearLoginFailures } from "../auth";

// Le paramètre "suivant" doit rester dans le back-office (pas de redirection ouverte)
const safeNext = (raw) =>
  typeof raw === "string" && raw.startsWith("/admin") ? raw : "/admin";

// Comparaison en temps constant, insensible aux longueurs différentes :
// on compare les hachés SHA-256 des deux mots de passe.
function passwordsMatch(given, expected) {
  const a = crypto.createHash("sha256").update(given).digest();
  const b = crypto.createHash("sha256").update(expected).digest();
  return crypto.timingSafeEqual(a, b);
}

export async function login(formData) {
  const password = String(formData.get("password") ?? "");
  const next = safeNext(formData.get("suivant"));

  const expected = process.env.ADMIN_PASSWORD;
  const secret = process.env.SESSION_SECRET;
  if (!expected || !secret) {
    redirect(
      "/admin/connexion?erreur=" +
        encodeURIComponent(
          "Administration non configurée : créez le fichier .env (voir la section Connexion du README)."
        )
    );
  }

  const ip = headers().get("x-forwarded-for")?.split(",")[0]?.trim() || "locale";
  await throttleLogin(ip);

  if (!passwordsMatch(password, expected)) {
    recordLoginFailure(ip);
    redirect(
      `/admin/connexion?erreur=${encodeURIComponent("Mot de passe incorrect.")}` +
        `&suivant=${encodeURIComponent(next)}`
    );
  }

  clearLoginFailures(ip);
  cookies().set(SESSION_COOKIE, await signSession(Date.now() + SESSION_DURATION_MS, secret), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_DURATION_MS / 1000,
  });
  redirect(next);
}

export async function logout() {
  cookies().delete(SESSION_COOKIE);
  redirect("/admin/connexion");
}
