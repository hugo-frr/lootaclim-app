"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import crypto from "node:crypto";
import {
  signUserSession,
  SESSION_COOKIE,
  SESSION_DURATION_MS,
  SESSION_SECOURS,
} from "../../../lib/session";
import { prisma } from "../../../lib/prisma";
import { verifyPassword } from "../../../lib/password";
import { homePathFor } from "../../../lib/roles";
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
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const next = safeNext(formData.get("suivant"));
  const secret = process.env.SESSION_SECRET;

  if (!secret) {
    redirect(
      "/admin/connexion?erreur=" +
        encodeURIComponent(
          "Administration non configurée : SESSION_SECRET est absente. En local, " +
            "la renseigner dans le fichier .env ; en ligne, dans les variables " +
            "d'environnement de l'hébergeur, puis redéployer."
        )
    );
  }

  const ip = headers().get("x-forwarded-for")?.split(",")[0]?.trim() || "locale";
  await throttleLogin(ip);

  const echec = () => {
    recordLoginFailure(ip);
    redirect(
      // Message volontairement identique que l'email existe ou non : préciser
      // « compte inconnu » révélerait quelles adresses ont un accès.
      `/admin/connexion?erreur=${encodeURIComponent("Identifiants incorrects.")}` +
        `&suivant=${encodeURIComponent(next)}`
    );
  };

  let userId = SESSION_SECOURS;
  let role = "ADMIN";

  if (email) {
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user || !user.active || !(await verifyPassword(password, user.passwordHash))) echec();
    await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    userId = user.id;
    role = user.role;
  } else {
    // Accès de secours : sans email, on compare au mot de passe d'urgence.
    const secours = process.env.ADMIN_PASSWORD;
    if (!secours || !passwordsMatch(password, secours)) echec();
  }

  clearLoginFailures(ip);
  cookies().set(
    SESSION_COOKIE,
    await signUserSession(userId, Date.now() + SESSION_DURATION_MS, secret),
    {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: SESSION_DURATION_MS / 1000,
    }
  );
  // Un livreur n'a rien à faire sur le tableau de bord : on l'envoie sur ses
  // tournées, sauf s'il visait une page précise.
  redirect(next === "/admin" ? homePathFor(role) : next);
}

export async function logout() {
  cookies().delete(SESSION_COOKIE);
  redirect("/admin/connexion");
}
