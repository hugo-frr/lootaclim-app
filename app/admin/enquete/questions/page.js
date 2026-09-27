import { requireUser } from "../../auth";
import Link from "next/link";
import { prisma } from "../../../../lib/prisma";
import AdminHeader from "../../AdminHeader";
import AddQuestionForm from "./AddQuestionForm";
import AddChoiceForm from "./AddChoiceForm";
import AutoSaveForm from "../../AutoSaveForm";
import {
  addQuestion,
  updateQuestion,
  toggleQuestion,
  deleteQuestion,
  moveQuestion,
  addChoice,
  deleteChoice,
} from "./actions";

export const dynamic = "force-dynamic";

export const metadata = { title: "Questions de l'enquête — LOOTACLIM" };

const TYPES = {
  choice: "Choix multiple",
  text: "Réponse libre",
  email: "Adresse email",
};

export default async function QuestionsPage() {
  // Le middleware ne vérifie que la signature du jeton : il tourne dans le
  // runtime edge, sans accès à la base. C'est ici qu'on refuse un compte
  // désactivé ou supprimé, sans attendre l'expiration de sa session.
  await requireUser();

  const questions = await prisma.surveyQuestion.findMany({
    include: {
      choices: { orderBy: { position: "asc" }, include: { _count: { select: { answers: true } } } },
      _count: { select: { answers: true } },
    },
    orderBy: { position: "asc" },
  });

  return (
    <div className="stack">
      <AdminHeader />

      <div>
        <span className="eyebrow">Enquête</span>
        <h1 className="section-title">Questions</h1>
        <p className="muted">
          Les modifications s&apos;appliquent immédiatement sur le site. Une
          question désactivée n&apos;est plus posée, mais ses réponses sont
          conservées.
        </p>
      </div>

      {questions.map((q, i) => (
        <div className="card question-carte" key={q.id}>
          <div className="question-entete">
            <div className="question-ordre">
              <form action={moveQuestion}>
                <input type="hidden" name="id" value={q.id} />
                <input type="hidden" name="direction" value="haut" />
                <button type="submit" className="btn-small" disabled={i === 0} aria-label="Monter">
                  ↑
                </button>
              </form>
              <form action={moveQuestion}>
                <input type="hidden" name="id" value={q.id} />
                <input type="hidden" name="direction" value="bas" />
                <button
                  type="submit"
                  className="btn-small"
                  disabled={i === questions.length - 1}
                  aria-label="Descendre"
                >
                  ↓
                </button>
              </form>
            </div>
            <div className="question-meta">
              <span className="pill RENTED">{TYPES[q.type] ?? q.type}</span>
              {!q.required && <span className="pill RETIRED">Facultative</span>}
              {!q.active && <span className="pill CANCELLED">Désactivée</span>}
              <span className="muted">
                {q._count.answers} réponse{q._count.answers > 1 ? "s" : ""}
              </span>
            </div>
          </div>

          <AutoSaveForm action={updateQuestion} className="question-edition">
            <input type="hidden" name="id" value={q.id} />
            <div className="field">
              <label htmlFor={`label-${q.id}`}>Question</label>
              <input id={`label-${q.id}`} name="label" defaultValue={q.label} required />
            </div>
            <div className="field">
              <label htmlFor={`helper-${q.id}`}>Précision sous la question (facultatif)</label>
              <input id={`helper-${q.id}`} name="helper" defaultValue={q.helper ?? ""} />
            </div>
            <label className="checkbox-field">
              <input type="checkbox" name="required" defaultChecked={q.required} />
              Réponse obligatoire
            </label>
          </AutoSaveForm>

          {q.type === "choice" && (
            <div className="question-choix">
              <strong className="muted">Choix proposés</strong>
              <ul>
                {q.choices.map((c) => (
                  <li key={c.id}>
                    <span>{c.label}</span>
                    {c._count.answers > 0 ? (
                      <span className="muted">{c._count.answers} réponse(s) — non supprimable</span>
                    ) : (
                      <form action={deleteChoice}>
                        <input type="hidden" name="id" value={c.id} />
                        <button type="submit" className="linklike">Supprimer</button>
                      </form>
                    )}
                  </li>
                ))}
              </ul>
              <AddChoiceForm action={addChoice} questionId={q.id} />
            </div>
          )}

          <div className="actions-cell question-actions">
            <form action={toggleQuestion}>
              <input type="hidden" name="id" value={q.id} />
              <button type="submit" className="btn-small">
                {q.active ? "Désactiver" : "Réactiver"}
              </button>
            </form>
            {q._count.answers === 0 ? (
              <form action={deleteQuestion}>
                <input type="hidden" name="id" value={q.id} />
                <button type="submit" className="btn-small btn-danger">Supprimer</button>
              </form>
            ) : (
              <span className="muted">
                Suppression impossible : des réponses existent. Désactivez-la plutôt.
              </span>
            )}
          </div>
        </div>
      ))}

      <div className="card">
        <strong className="survey-resultat-titre">Ajouter une question</strong>
        <AddQuestionForm action={addQuestion} />
      </div>

      <Link href="/admin/enquete" className="lien-fleche">
        <span aria-hidden="true">←</span> Voir les résultats
      </Link>
    </div>
  );
}
