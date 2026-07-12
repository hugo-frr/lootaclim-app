import { prisma } from "../../lib/prisma";
import { euros } from "../../lib/constants";
import Link from "next/link";

// Cette page est un "Server Component" : elle interroge la base de données
// directement côté serveur, puis envoie du HTML tout prêt au navigateur.
export const dynamic = "force-dynamic"; // toujours des données fraîches

export default async function Catalogue() {
  const products = await prisma.product.findMany({
    where: { active: true },
    include: {
      images: { orderBy: { position: "asc" } },
      units: true,
    },
    orderBy: { dailyPrice: "asc" },
  });

  return (
    <div>
      <span className="eyebrow">Catalogue</span>
      <h1 className="section-title">Choisissez votre fraîcheur</h1>

      <div className="grid3">
        {products.map((p) => {
          const dispo = p.units.filter((u) => u.status === "AVAILABLE").length;
          return (
            <div className="card product-card" key={p.id}>
              <div className="ph">📷 {p.images[0]?.alt ?? "Photo à venir"}</div>
              <h3>{p.name}</h3>
              <div className="specs">
                Jusqu&apos;à {p.maxAreaM2} m² · {p.powerKw} kW · {p.noiseDb} dB
                <br />
                {p.description}
              </div>
              <div className="price">
                {euros(p.dailyPrice)} <small>/ jour</small>
              </div>
              <p style={{ marginTop: 10 }}>
                {dispo > 0 ? (
                  <span className="stock-ok">✓ {dispo} disponible{dispo > 1 ? "s" : ""}</span>
                ) : (
                  <span className="stock-ko">Indisponible actuellement</span>
                )}
              </p>
              {p.units.some((u) => !["RETIRED", "MAINTENANCE"].includes(u.status)) && (
                <Link
                  href={`/reserver/${p.slug}`}
                  className="btn btn-primary"
                  style={{ marginTop: 14, display: "block", textAlign: "center" }}
                >
                  Réserver
                </Link>
              )}
            </div>
          );
        })}
      </div>

      <p style={{ marginTop: 30, fontSize: 13.5, color: "#7b98ab" }}>
        La disponibilité affichée vient en direct de votre stock en base de
        données. Le bouton « Réserver » ouvre le calendrier de disponibilité
        du modèle.
      </p>
    </div>
  );
}
