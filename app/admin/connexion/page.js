import { login } from "./actions";

export const dynamic = "force-dynamic";

export default function Connexion({ searchParams }) {
  const erreur = searchParams.erreur;
  const suivant = searchParams.suivant ?? "/admin";

  return (
    <div style={{ maxWidth: 420, margin: "40px auto 0" }}>
      <div className="card">
        <span className="eyebrow">Back-office</span>
        <h1 className="section-title" style={{ fontSize: 26 }}>Connexion</h1>
        <form action={login}>
          <input type="hidden" name="suivant" value={suivant} />
          <div className="field">
            <label htmlFor="password">Mot de passe administrateur</label>
            <input id="password" name="password" type="password" required autoFocus />
          </div>
          <button type="submit" className="btn btn-primary" style={{ width: "100%", marginTop: 14 }}>
            Se connecter
          </button>
        </form>
        {erreur && <p className="form-error" role="alert">{erreur}</p>}
      </div>
    </div>
  );
}
