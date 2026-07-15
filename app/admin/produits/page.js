import { prisma } from "../../../lib/prisma";
import { euros } from "../../../lib/constants";
import AdminHeader from "../AdminHeader";
import { updateProduct } from "../actions";

export const dynamic = "force-dynamic";

export default async function Produits({ searchParams }) {
  const products = await prisma.product.findMany({ orderBy: { dailyPrice: "asc" } });

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
      {products.map((p) => (
        <form key={p.id} action={updateProduct} className="card">
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
          </div>
          <button type="submit" className="btn btn-primary" style={{ marginTop: 14 }}>
            Enregistrer {p.name}
          </button>
        </form>
      ))}
      <p className="muted">
        Le nom et l&apos;adresse (slug) des modèles ne sont pas modifiables ici :
        ils structurent les liens du site.
      </p>
    </div>
  );
}
