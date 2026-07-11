import Link from "next/link";

export default function Home() {
  return (
    <div style={{ textAlign: "center", paddingTop: 60 }}>
      <span className="eyebrow">Paris · Livraison en 24h</span>
      <h1 style={{ fontSize: "clamp(44px, 7vw, 84px)", lineHeight: 0.98, margin: "18px 0" }}>
        L&apos;été à Paris,
        <br />
        <span style={{ color: "var(--cool)" }}>enfin frais.</span>
      </h1>
      <p style={{ maxWidth: 460, margin: "0 auto 34px", color: "#33536b", fontWeight: 300, fontSize: 18 }}>
        Louez un climatiseur mobile, livré et installé chez vous. Sans travaux,
        sans engagement, sans transpirer.
      </p>
      <Link href="/catalogue" className="btn btn-primary">
        Voir les climatiseurs
      </Link>
      <p style={{ marginTop: 50, fontSize: 13, color: "#7b98ab" }}>
        (La vitrine 3D animée sera intégrée ici à l&apos;étape « intégration du design »)
      </p>
    </div>
  );
}
