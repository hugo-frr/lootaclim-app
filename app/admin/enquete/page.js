import { prisma } from "../../../lib/prisma";
import { summarise } from "../../../lib/survey";
import AdminHeader from "../AdminHeader";

export const dynamic = "force-dynamic";

export const metadata = { title: "Enquête de marché — LOOTACLIM" };

function csv(reponses) {
  const colonnes = [
    "date", "surface", "arrondissement", "logement", "duree",
    "prix_acceptable", "solution_actuelle", "frein", "age", "email",
  ];
  const echappe = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const lignes = reponses.map((r) =>
    [
      r.createdAt.toISOString().slice(0, 10),
      r.surface, r.location, r.housing, r.duration,
      r.priceRange, r.currentSolution, r.blocker, r.ageRange, r.email ?? "",
    ].map(echappe).join(",")
  );
  return [colonnes.join(","), ...lignes].join("\n");
}

export default async function EnquetePage() {
  const reponses = await prisma.surveyResponse.findMany({ orderBy: { createdAt: "desc" } });
  const totaux = summarise(reponses);
  const emails = reponses.filter((r) => r.email).map((r) => r.email);
  const contenuCsv = csv(reponses);

  return (
    <div className="stack">
      <AdminHeader />

      <div>
        <span className="eyebrow">Analyse</span>
        <h1 className="section-title">Enquête de marché</h1>
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
                    <li key={c.value}>
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
              className="btn btn-small"
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
