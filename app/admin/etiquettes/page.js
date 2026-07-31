import { requireUser } from "../auth";
import Link from "next/link";
import QRCode from "qrcode";
import { prisma } from "../../../lib/prisma";
import { UNIT_STATUS } from "../../../lib/constants";
import { scanUrl, labelSheets, qrRuns } from "../../../lib/scan";
import AdminHeader from "../AdminHeader";

export const dynamic = "force-dynamic";

export const metadata = { title: "Étiquettes — LOOTACLIM" };

const PAR_PAGE = 24; // planche A4 de 3 colonnes × 8 lignes

// Adresse encodée dans les QR codes.
//
// TOUJOURS celle de la production, même quand on imprime depuis son poste :
// une étiquette est collée sur une machine qui part chez un client. Un QR
// pointant vers localhost serait définitivement inutilisable, et il faudrait
// tout réimprimer.
const SITE = process.env.NEXT_PUBLIC_SITE_URL || "https://www.lootaclim.fr";

export default async function EtiquettesPage({ searchParams }) {
  // Le middleware ne vérifie que la signature du jeton : il tourne dans le
  // runtime edge, sans accès à la base. C'est ici qu'on refuse un compte
  // désactivé ou supprimé, sans attendre l'expiration de sa session.
  await requireUser();

  const modele = searchParams?.modele ?? "";
  const etat = searchParams?.etat ?? "";
  const choisies = String(searchParams?.machines ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const [produits, machines] = await Promise.all([
    prisma.product.findMany({ orderBy: { name: "asc" } }),
    prisma.unit.findMany({
      where: {
        ...(modele ? { productId: modele } : {}),
        ...(etat ? { status: etat } : {}),
      },
      include: { product: true },
      orderBy: { serialNumber: "asc" },
    }),
  ]);

  // Sans sélection explicite, on prépare tout ce que les filtres ont retenu.
  const aImprimer = choisies.length
    ? machines.filter((u) => choisies.includes(u.serialNumber))
    : machines;

  // On récupère la matrice du QR et on dessine les rectangles nous-mêmes,
  // plutôt que d'injecter le SVG produit par la bibliothèque : rien n'est
  // inséré en HTML brut, et le tracé reste vectoriel donc net à l'impression.
  const etiquettes = aImprimer.map((u) => {
    const { modules } = QRCode.create(scanUrl(SITE, u.serialNumber), {
      errorCorrectionLevel: "M",
    });
    return {
      serialNumber: u.serialNumber,
      produit: u.product.name,
      taille: modules.size,
      segments: qrRuns(modules),
    };
  });

  const pages = labelSheets(etiquettes, PAR_PAGE);

  return (
    <div className="stack">
      <div className="sans-impression">
        <AdminHeader />

        <div>
          <span className="eyebrow">Logistique</span>
          <h1 className="section-title">Étiquettes</h1>
          <p className="muted">
            Chaque étiquette porte un QR code qui ouvre la fiche de la machine.
            L&apos;appareil photo d&apos;un téléphone suffit : rien à installer.
          </p>
        </div>

        <div className="card">
          <form className="etiq-filtres">
            <div className="field">
              <label htmlFor="modele">Modèle</label>
              <select id="modele" name="modele" defaultValue={modele}>
                <option value="">Tous</option>
                {produits.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="etat">État</label>
              <select id="etat" name="etat" defaultValue={etat}>
                <option value="">Tous</option>
                {Object.entries(UNIT_STATUS).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
            </div>
            <button type="submit" className="btn-small">Filtrer</button>
          </form>

          <p className="muted" style={{ marginTop: 14 }}>
            {aImprimer.length} étiquette{aImprimer.length > 1 ? "s" : ""} ·{" "}
            {pages.length} page{pages.length > 1 ? "s" : ""} A4
          </p>
          <p className="muted">
            Les QR pointent vers <strong>{SITE}</strong> — l&apos;adresse de
            production, même imprimés depuis votre ordinateur.
          </p>

          {aImprimer.length > 0 && (
            <>
              <p className="muted" style={{ marginTop: 10 }}>
                Imprimez avec la commande de votre navigateur (⌘P). Choisissez du
                papier autocollant plastifié ou vinyle : ces machines sortent et
                prennent la pluie.
              </p>
              <details className="etiq-liste">
                <summary>Voir les machines retenues</summary>
                <ul>
                  {aImprimer.map((u) => (
                    <li key={u.serialNumber}>
                      <Link href={`/admin/scan/${encodeURIComponent(u.serialNumber)}`}>
                        {u.serialNumber}
                      </Link>{" "}
                      <span className="muted">
                        {u.product.name} · {UNIT_STATUS[u.status] ?? u.status}
                      </span>
                    </li>
                  ))}
                </ul>
              </details>
            </>
          )}
        </div>

        {aImprimer.length === 0 && (
          <div className="card">
            <p className="muted">Aucune machine ne correspond à ces filtres.</p>
          </div>
        )}
      </div>

      {pages.map((page, i) => (
        <div className="etiq-planche" key={i}>
          {page.map((e) => (
            <div className="etiquette" key={e.serialNumber}>
              <svg
                className="etiquette-qr"
                viewBox={`0 0 ${e.taille} ${e.taille}`}
                role="img"
                aria-label={`Code de la machine ${e.serialNumber}`}
              >
                <rect width={e.taille} height={e.taille} fill="#fff" />
                {e.segments.map((r) => (
                  <rect
                    key={`${r.x}-${r.y}`}
                    x={r.x}
                    y={r.y}
                    width={r.largeur}
                    height={1}
                    fill="#05122e"
                  />
                ))}
              </svg>
              <div className="etiquette-texte">
                <strong>{e.serialNumber}</strong>
                <span>{e.produit}</span>
              </div>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
