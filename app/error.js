"use client";

// Page d'erreur générique : remplace l'écran technique de Next.js.
export default function Error({ reset }) {
  return (
    <div style={{ maxWidth: 520, margin: "60px auto 0", textAlign: "center" }}>
      <div className="card">
        <span className="eyebrow">Oups</span>
        <h1 className="section-title" style={{ fontSize: 26 }}>
          Une erreur inattendue est survenue
        </h1>
        <p style={{ fontSize: 14.5, color: "#5c7d94", lineHeight: 1.7, marginBottom: 20 }}>
          Ce n&apos;est pas de votre faute. Vous pouvez réessayer, ou revenir à
          l&apos;accueil — et nous contacter si le problème persiste.
        </p>
        <button type="button" className="btn btn-primary" onClick={() => reset()}>
          Réessayer
        </button>
        <p style={{ marginTop: 14 }}>
          <a href="/" style={{ color: "var(--deep)", fontSize: 14 }}>Retour à l&apos;accueil</a>
        </p>
      </div>
    </div>
  );
}
