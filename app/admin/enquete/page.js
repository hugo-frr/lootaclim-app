import { requireUser } from "../auth";
import Link from "next/link";
import { prisma } from "../../../lib/prisma";
import { summarise } from "../../../lib/survey";
import AdminHeader from "../AdminHeader";

export const dynamic = "force-dynamic";

export const metadata = { title: "Enquête de marché — LOOTACLIM" };

// Une colonne par question, dans l'ordre du questionnaire.
function csv(questions, reponses) {
  const echappe = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const colonnes = ["date", ...questions.map((q) => q.label)];
  const lignes = reponses.map((r) => {
    const par = new Map(r.answers.map((a) => [a.questionId, a]));
    return [
      r.createdAt.toISOString().slice(0, 10),
      ...questions.map((q) => {
        const a = par.get(q.id);
        if (!a) return "";
        return a.choice?.label ?? a.text ?? "";
      }),
    ].map(echappe).join(",");
  });
  return [colonnes.map(echappe).join(","), ...lignes].join("\n");
}

export default async function EnquetePage() {
  // Le middleware ne vérifie que la signature du jeton : il tourne dans le
  // runtime edge, sans accès à la base. C'est ici qu'on refuse un compte
  // désactivé ou supprimé, sans attendre l'expiration de sa session.
  await requireUser();

  const questions = await prisma.surveyQuestion.findMany({
    include: { choices: { orderBy: { position: "asc" } } },
    orderBy: { position: "asc" },
  });
  const reponses = await prisma.surveyResponse.findMany({
    include: { answers: { include: { choice: true } } },
    orderBy: { createdAt: "desc" },
  });
  const totaux = summarise(questions, reponses);
  // Les emails sont les réponses aux questions de type "email".
  const questionsEmail = new Set(questions.filter((q) => q.type === "email").map((q) => q.id));
  const emails = reponses
    .flatMap((r) => r.answers)
    .filter((a) => questionsEmail.has(a.questionId) && a.text)
    .map((a) => a.text);
  const contenuCsv = csv(questions.filter((q) => q.active), reponses);

  return (
    <div className="stack">
      <AdminHeader />

      <div>
        <span className="eyebrow">Analyse</span>
        <h1 className="section-title">Enquête de marché</h1>
        <Link href="/admin/enquete/questions" className="lien-fleche">
          Modifier les questions <span aria-hidden="true">→</span>
        </Link>
      </div>

      {reponses.length === 0 ? (
        <div className="card">
          <p className="muted">
            Aucune réponse pour l&apos;instant. Le formulaire s&apos;affiche à
            l&apos;arrivée sur la page d&apos;accueil, une seule fois par visiteur.
          </p>
        </div>
      ) : (
        <>
          <div className="kpis">
            <div className="card kpi">
              <div className="num">{reponses.length}</div>
              <div className="lbl">réponses</div>
            </div>
            <div className="card kpi">
              <div className="num">{emails.length}</div>
              <div className="lbl">emails laissés</div>
            </div>
          </div>

          {totaux.map((q) => (
            <div className="card" key={q.id}>
              <strong className="survey-resultat-titre">{q.label}</strong>
              {q.choices.length === 0 ? (
                <p className="muted">Aucune réponse.</p>
              ) : (
                <ul className="survey-resultats">
                  {q.choices.map((c) => (
                    <li key={c.id}>
                      <span className="survey-resultat-label">{c.label}</span>
                      <span className="survey-jauge" aria-hidden="true">
                        <span style={{ width: `${c.percent}%` }} />
                      </span>
                      <span className="survey-resultat-chiffre">
                        {c.percent}% <small>({c.count})</small>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}

          {emails.length > 0 && (
            <div className="card">
              <strong className="survey-resultat-titre">
                Liste d&apos;attente — {emails.length} adresse{emails.length > 1 ? "s" : ""}
              </strong>
              <textarea readOnly rows={Math.min(10, emails.length + 1)} value={emails.join("\n")} />
              <p className="muted" style={{ marginTop: 8 }}>
                Ces personnes ont demandé à être prévenues du lancement.
              </p>
            </div>
          )}

          <div className="card">
            <strong className="survey-resultat-titre">Export</strong>
            <p className="muted" style={{ marginBottom: 12 }}>
              Toutes les réponses au format tableur, à ouvrir dans Excel ou Numbers.
            </p>
            <a
              className="btn-small"
              download="enquete-lootaclim.csv"
              href={`data:text/csv;charset=utf-8,${encodeURIComponent(contenuCsv)}`}
            >
              Télécharger le CSV
            </a>
          </div>
        </>
      )}
    </div>
  );
}
