import Link from "next/link";
import { prisma } from "../lib/prisma";
import { euros } from "../lib/constants";
import Reveal from "./Reveal";
import ModelPhoto from "./ModelPhoto";

export const dynamic = "force-dynamic"; // stock des modèles toujours à jour

const STEPS = [
  {
    title: "Choisissez votre modèle",
    text: "Comparez les 3 climatiseurs selon la surface à rafraîchir et réservez vos dates en ligne.",
  },
  {
    title: "Livraison en 24h",
    text: "On vous livre et on installe la machine chez vous, sur le créneau de 2h que vous avez choisi.",
  },
  {
    title: "On reprend en fin de location",
    text: "À la date convenue, on repasse récupérer la machine — rien à faire de votre côté.",
  },
];

const REASSURANCE = [
  { ico: "📍", title: "Paris & petite couronne", text: "Livraison dans tout Paris et la petite couronne." },
  { ico: "🔧", title: "Sans travaux", text: "Aucune installation fixe, aucun perçage." },
  { ico: "💳", title: "Caution simple", text: "Empreinte bancaire, jamais débitée sauf dégât constaté." },
  { ico: "📅", title: "Annulation flexible", text: "Vous changez d'avis ? On annule sans frais avant livraison." },
];

export default async function Home() {
  const products = await prisma.product.findMany({
    where: { active: true },
    include: { units: true, images: { orderBy: { position: "asc" } } },
    orderBy: { dailyPrice: "asc" },
  });

  return (
    <div>
      <section className="hero">
        <div className="hero-copy">
          <span className="eyebrow">Paris · Livraison en 24h</span>
          <h1 style={{ fontSize: "clamp(40px, 6vw, 72px)", lineHeight: 0.98, margin: "18px 0" }}>
            L&apos;été à Paris,
            <br />
            <span style={{ color: "var(--cool)" }}>enfin frais.</span>
          </h1>
          <p style={{ maxWidth: 440, color: "#33536b", fontWeight: 300, fontSize: 18 }}>
            Louez un climatiseur mobile, livré et installé chez vous. Sans
            travaux, sans engagement, sans transpirer.
          </p>
          <Link href="#modeles" className="btn btn-primary" style={{ marginTop: 30, display: "inline-block" }}>
            Voir les climatiseurs
          </Link>
        </div>
        <div className="hero-cards" aria-hidden="true">
          <div className="hero-card hero-card-1">
            🚚 Livraison 24h
            <small>Paris &amp; petite couronne</small>
          </div>
          <div className="hero-card hero-card-2">
            💶 dès 12€
            <small>par jour, dégressif</small>
          </div>
          <div className="hero-card hero-card-3">
            ✓ Sans engagement
            <small>caution simple</small>
          </div>
        </div>
      </section>

      <Reveal className="home-section">
        <span className="eyebrow">Comment ça marche</span>
        <h2 className="section-title">3 étapes, zéro complication</h2>
        <div className="steps">
          {STEPS.map((s, i) => (
            <div className="step" key={s.title}>
              <span className="step-num">{i + 1}</span>
              <strong>{s.title}</strong>
              <p>{s.text}</p>
            </div>
          ))}
        </div>
      </Reveal>

      <Reveal className="home-section">
        <div id="modeles">
          <span className="eyebrow">Nos modèles</span>
          <h2 className="section-title">Choisissez votre fraîcheur</h2>
          {products.map((p, i) => {
            const dispo = p.units.filter((u) => u.status === "AVAILABLE").length;
            const reservable = p.units.some((u) => !["RETIRED", "MAINTENANCE"].includes(u.status));
            const photo = p.images[0];
            return (
              <div className={`model-row ${i % 2 === 1 ? "rev" : ""}`} key={p.id}>
                <ModelPhoto url={photo?.url} alt={photo?.alt ?? `Climatiseur ${p.name}`} />
                <div className="model-info">
                  <h3>{p.name}</h3>
                  <div className="model-badges">
                    <span className="model-badge">Jusqu&apos;à {p.maxAreaM2} m²</span>
                    <span className="model-badge">{p.powerKw} kW</span>
                    <span className="model-badge">{p.noiseDb} dB</span>
                  </div>
                  <p className="desc">{p.description}</p>
                  <div className="price">
                    {euros(p.dailyPrice)} <small>/ jour</small>
                  </div>
                  <p className="avail">
                    {dispo > 0 ? (
                      <span className="stock-ok">✓ {dispo} disponible{dispo > 1 ? "s" : ""}</span>
                    ) : (
                      <span className="stock-ko">Indisponible actuellement</span>
                    )}
                  </p>
                  {reservable && (
                    <Link href={`/reserver/${p.slug}`} className="btn btn-primary">
                      Réserver
                    </Link>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </Reveal>

      <Reveal className="home-section">
        <div className="reassurance">
          {REASSURANCE.map((r) => (
            <div className="reassurance-item" key={r.title}>
              <div className="ico">{r.ico}</div>
              <strong>{r.title}</strong>
              <p>{r.text}</p>
            </div>
          ))}
        </div>
      </Reveal>

      <Reveal className="home-section home-cta">
        <h2 className="section-title" style={{ fontSize: 28 }}>
          Prêt à retrouver la fraîcheur ?
        </h2>
        <Link href="#modeles" className="btn btn-primary">
          Voir les climatiseurs
        </Link>
      </Reveal>
    </div>
  );
}
