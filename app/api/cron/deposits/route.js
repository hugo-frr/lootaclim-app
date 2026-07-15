import { NextResponse } from "next/server";
import { placeDueDeposits } from "../../../../lib/stripe";

// Appelée une fois par jour par Vercel Cron (voir vercel.json). Protégée par
// CRON_SECRET : Vercel ajoute automatiquement l'en-tête Authorization quand
// cette variable est configurée sur le projet.
export async function GET(request) {
  const auth = request.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Non autorisé." }, { status: 401 });
  }
  const result = await placeDueDeposits();
  return NextResponse.json(result);
}
