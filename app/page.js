import Link from "next/link";
import { prisma } from "../lib/prisma";
import { euros } from "../lib/constants";
import Reveal from "./Reveal";
import ModelPhoto from "./ModelPhoto";
import AcStage from "./AcStage";
import ScrollVideo from "./ScrollVideo";
import AcLabels from "./AcLabels";

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

const HERO_FACTS = [
  { label: "🚚 Livraison 24h", detail: "Paris & petite couronne" },
  { label: "💶 dès 12€/jour", detail: "tarif dégressif" },
  { label: "✓ Sans engagement", detail: "caution simple" },
];

// Identifiants des cinq sections, dans l'ordre : ils donnent à la scène 3D les
// positions de bascule d'une étape du scénario à la suivante.
const SECTION_IDS = ["hero", "etapes", "modeles", "reassurance", "cta"];

// Vidéo de fond avancée par le défilement, générée par Motion.
// null tant que le fichier n'existe pas : la scène 3D sert alors de repli.
// Marche à suivre complète dans docs/motion-brief-climatiseur.md.
const HERO_VIDEO = "/videos/hero-clim.mp4";

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
      {/* Le fond doit rester au premier niveau de la page. Placé dans un
          <Reveal>, il serait confiné : un ancêtre porteur d'un transform
          devient le repère des éléments en position:fixed, qui se calent
          alors sur cet ancêtre au lieu de l'écran. */}
      {HERO_VIDEO ? (
        <ScrollVideo src={HERO_VIDEO} poster="/videos/hero-clim.jpg" />
      ) : (
        <AcStage sectionIds={SECTION_IDS} />
      )}
      <section id="hero" className="hero bleed">
        <div className="hero-inner bleed-inner">
          <span className="eyebrow">Paris · Livraison en 24h</span>
          <h1 className="hero-title">
            L&apos;été à Paris,
            <br />
            <span style={{ color: "var(--cool)" }}>enfin frais.</span>
          </h1>
          <p className="hero-sub">
            Louez un climatiseur mobile, livré et installé chez vous. Sans
            travaux, sans engagement, sans transpirer.
          </p>
          <div className="hero-actions">
            <Link href="#modeles" className="btn btn-primary">
              Voir les climatiseurs
            </Link>
            <Link href="#etapes" className="btn btn-ghost">
              Comment ça marche
            </Link>
          </div>
          <div className="hero-facts">
            {HERO_FACTS.map((f) => (
              <span className="hero-fact" key={f.label}>
                {f.label} <small>{f.detail}</small>
              </span>
            ))}
          </div>
        </div>
        <span className="hero-scroll" aria-hidden="true">
          ↓
        </span>
      </section>

      <section id="etapes" className="home-section section-band bleed">
        <Reveal className="bleed-inner">
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
      </section>

      <section id="modeles" className="home-section bleed">
        <Reveal className="bleed-inner">
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
        </Reveal>
      </section>

      <section id="reassurance" className="home-section section-band bleed">
        <Reveal className="bleed-inner">
          <div className="reassurance">
            {REASSURANCE.map((r) => (
              <div className="reassurance-item" key={r.title}>
                <div className="ico">{r.ico}</div>
                <strong>{r.title}</strong>
                <p>{r.text}</p>
              </div>
            ))}
          </div>
          {HERO_VIDEO && <AcLabels forceStatic />}
        </Reveal>
      </section>

      <section id="cta" className="home-section bleed">
        <Reveal className="bleed-inner home-cta">
          <h2 className="section-title">Prêt à retrouver la fraîcheur ?</h2>
          <Link href="#modeles" className="btn btn-primary">
            Voir les climatiseurs
          </Link>
        </Reveal>
      </section>
    </div>
  );
}
