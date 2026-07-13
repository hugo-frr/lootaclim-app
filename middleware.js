// Verrou du back-office : toute URL /admin/* sans session valide est
// renvoyée vers la page de connexion (avec retour à la page demandée après).
// S'exécute dans le runtime edge : lib/session.js n'utilise que Web Crypto.

import { NextResponse } from "next/server";
import { verifySession, SESSION_COOKIE } from "./lib/session";

export async function middleware(request) {
  const { pathname, search } = request.nextUrl;
  if (pathname.startsWith("/admin/connexion")) return NextResponse.next();

  const token = request.cookies.get(SESSION_COOKIE)?.value ?? "";
  const secret = process.env.SESSION_SECRET ?? "";
  if (secret && (await verifySession(token, secret, Date.now()))) {
    return NextResponse.next();
  }

  const url = new URL("/admin/connexion", request.url);
  url.searchParams.set("suivant", pathname + search);
  return NextResponse.redirect(url);
}

export const config = { matcher: ["/admin/:path*"] };
