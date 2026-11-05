import { requireUser } from "../auth";
import { prisma } from "../../../lib/prisma";
import { euros } from "../../../lib/constants";
import AdminHeader from "../AdminHeader";
import ImageDropzone from "../../ImageDropzone";
import AutoSaveForm from "../AutoSaveForm";
import { updateProduct, createProduct } from "../actions";

export const dynamic = "force-dynamic";

export default async function Produits({ searchParams }) {
  // Le middleware ne vérifie que la signature du jeton : il tourne dans le
  // runtime edge, sans accès à la base. C'est ici qu'on refuse un compte
  // désactivé ou supprimé, sans attendre l'expiration de sa session.
  await requireUser();

  const products = await prisma.product.findMany({
    include: { images: { orderBy: { position: "asc" } } },
    orderBy: { dailyPrice: "asc" },
  });

  return (
    <div className="stack">
      <AdminHeader />
      <div>
        <span className="eyebrow">Back-office</span>
        <h1 className="section-title">Modèles &amp; prix</h1>
      </div>
      {searchParams.erreur && (
        <p className="form-error" role="alert">{searchParams.erreur}</p>
      )}
      {searchParams.ok && (
        <p className="form-ok" role="status">Modifications enregistrées.</p>
      )}
      <form action={createProduct} className="card">
        <h2 className="step-title">Nouveau modèle</h2>
        <div className="form-grid">
          <div className="field">
            <label htmlFor="new-name">Nom</label>
            <input id="new-name" name="name" required minLength={2} maxLength={60} />
          </div>
          <div className="field full">
            <label htmlFor="new-desc">Description</label>
            <textarea id="new-desc" name="description" rows={3} required minLength={10} maxLength={500} />
          </div>
          <div className="field">
            <label htmlFor="new-power">Puissance (kW)</label>
            <input id="new-power" name="powerKw" inputMode="decimal" required />
          </div>
          <div className="field">
            <label htmlFor="new-noise">Bruit (dB)</label>
            <input id="new-noise" name="noiseDb" inputMode="numeric" required />
          </div>
          <div className="field">
            <label htmlFor="new-area">Surface max (m²)</label>
            <input id="new-area" name="maxAreaM2" inputMode="numeric" required />
          </div>
          <div className="field">
            <label htmlFor="new-price">Prix par jour (€)</label>
            <input id="new-price" name="dailyPriceEuros" inputMode="decimal" required />
          </div>
          <div className="field">
            <label htmlFor="new-deposit">Caution (€)</label>
            <input id="new-deposit" name="depositAmountEuros" inputMode="decimal" required />
          </div>
          <div className="field">
            <label htmlFor="new-active">Visible au catalogue</label>
            <select id="new-active" name="active" defaultValue="oui">
              <option value="oui">Oui</option>
              <option value="non">Non</option>
            </select>
          </div>
          <div className="field full">
            <label>Photo (facultatif)</label>
            <ImageDropzone name="image" />
          </div>
        </div>
        <button type="submit" className="btn btn-primary" style={{ marginTop: 14 }}>
          Créer le modèle
        </button>
      </form>
      {products.map((p) => (
        <AutoSaveForm key={p.id} action={updateProduct} className="card">
          <input type="hidden" name="id" value={p.id} />
          <h2 className="step-title">
            {p.name}{" "}
            <span className="muted">({euros(p.dailyPrice)}/jour actuellement)</span>
          </h2>
          <div className="form-grid">
            <div className="field full">
              <label htmlFor={`desc-${p.id}`}>Description</label>
              <textarea
                id={`desc-${p.id}`}
                name="description"
                defaultValue={p.description}
                rows={3}
                required
                minLength={10}
                maxLength={500}
              />
            </div>
            <div className="field">
              <label htmlFor={`prix-${p.id}`}>Prix par jour (€)</label>
              <input
                id={`prix-${p.id}`}
                name="dailyPriceEuros"
                defaultValue={(p.dailyPrice / 100).toLocaleString("fr-FR")}
                inputMode="decimal"
                required
              />
            </div>
            <div className="field">
              <label htmlFor={`caution-${p.id}`}>Caution (€)</label>
              <input
                id={`caution-${p.id}`}
                name="depositAmountEuros"
                defaultValue={(p.depositAmount / 100).toLocaleString("fr-FR")}
                inputMode="decimal"
                required
              />
            </div>
            <div className="field">
              <label htmlFor={`actif-${p.id}`}>Visible au catalogue</label>
              <select id={`actif-${p.id}`} name="active" defaultValue={p.active ? "oui" : "non"}>
                <option value="oui">Oui</option>
                <option value="non">Non</option>
              </select>
            </div>
            <div className="field full">
              <label>Photo</label>
              <ImageDropzone
                key={p.images[0]?.url ?? "aucune"}
                name="image"
                currentUrl={p.images[0]?.url}
                currentAlt={p.images[0]?.alt}
              />
              {p.images[0] && (
                <label className="checkbox-field">
                  <input type="checkbox" name="removeImage" />
                  Supprimer l&apos;image actuelle
                </label>
              )}
            </div>
          </div>
        </AutoSaveForm>
      ))}
      <p className="muted">
        Le nom et l&apos;adresse (slug) des modèles ne sont pas modifiables ici :
        ils structurent les liens du site.
      </p>
    </div>
  );
}
