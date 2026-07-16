"use client";

import { useEffect, useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";
import Calendar from "./Calendar";
import { createBooking } from "./actions";
import { quote } from "../../../lib/pricing";
import { deliverySlotsFor, pickupSlotsFor } from "../../../lib/availability";
import { nowInParis } from "../../../lib/dates";
import { euros, FLOOR_LABELS } from "../../../lib/constants";

// "2026-07-15" → "mer. 15 juil." (midi local : pas de glissement de jour)
const dateFr = (day) =>
  new Date(`${day}T12:00:00`).toLocaleDateString("fr-FR", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      className="btn btn-primary"
      disabled={pending}
      style={{ width: "100%", marginTop: 14 }}
    >
      {pending ? "Redirection vers le paiement…" : "Payer et envoyer ma demande"}
    </button>
  );
}

export default function BookingWizard({ product, fullDays, minDay, maxDay }) {
  const [state, formAction] = useFormState(createBooking, {});
  const router = useRouter();

  // Si le serveur refuse (ex. dates prises entre-temps), on recharge les
  // données serveur : le calendrier reflète alors la vraie disponibilité.
  useEffect(() => {
    if (state.error) router.refresh();
  }, [state, router]);

  const [startDay, setStartDay] = useState(null);
  const [endDay, setEndDay] = useState(null);
  const [hint, setHint] = useState(null);
  const [deliverySlot, setDeliverySlot] = useState("");
  const [pickupSlot, setPickupSlot] = useState("");

  const now = nowInParis();
  const datesChosen = Boolean(startDay && endDay);
  const q = datesChosen ? quote(product.dailyPrice, startDay, endDay) : null;
  const deliveryOptions = startDay ? deliverySlotsFor(startDay, now) : [];
  const pickupOptions = datesChosen ? pickupSlotsFor(startDay, endDay, deliverySlot) : [];

  function selectDates(s, e) {
    setStartDay(s);
    setEndDay(e);
    setHint(null);
    setDeliverySlot("");
    setPickupSlot("");
  }

  return (
    <form action={formAction} className="wizard">
      <input type="hidden" name="slug" value={product.slug} />
      <input type="hidden" name="startDay" value={startDay ?? ""} />
      <input type="hidden" name="endDay" value={endDay ?? ""} />

      <div className="wizard-steps">
        <div className="card">
          <h2 className="step-title">
            <span className="step-num">1</span>Vos dates
          </h2>
          <Calendar
            minDay={minDay}
            maxDay={maxDay}
            fullDays={fullDays}
            startDay={startDay}
            endDay={endDay}
            onSelect={selectDates}
            onHint={setHint}
          />
          {hint && <p className="cal-hint">{hint}</p>}
          {!datesChosen && (
            <p className="cal-hint" style={{ color: "#5c7d94" }}>
              {startDay
                ? "Choisissez maintenant votre jour de fin (le même jour est possible : re-cliquez dessus)."
                : "Choisissez votre jour de début."}
            </p>
          )}
        </div>

        {datesChosen && (
          <div className="card">
            <h2 className="step-title">
              <span className="step-num">2</span>Vos coordonnées
            </h2>
            <div className="form-grid">
              <div className="field">
                <label htmlFor="firstName">Prénom</label>
                <input id="firstName" name="firstName" required />
              </div>
              <div className="field">
                <label htmlFor="lastName">Nom</label>
                <input id="lastName" name="lastName" required />
              </div>
              <div className="field">
                <label htmlFor="email">Email</label>
                <input id="email" name="email" type="email" required />
              </div>
              <div className="field">
                <label htmlFor="phone">Téléphone</label>
                <input id="phone" name="phone" type="tel" required />
              </div>
              <div className="field full">
                <label htmlFor="line1">Adresse</label>
                <input id="line1" name="line1" required />
              </div>
              <div className="field">
                <label htmlFor="zip">Code postal</label>
                <input
                  id="zip"
                  name="zip"
                  inputMode="numeric"
                  pattern="(75|92|93|94)[0-9]{3}"
                  title="Nous livrons Paris et la petite couronne : 75, 92, 93 ou 94"
                  required
                />
              </div>
              <div className="field">
                <label htmlFor="city">Ville</label>
                <input id="city" name="city" required />
              </div>
              <div className="field">
                <label htmlFor="floor">Étage</label>
                <select id="floor" name="floor" defaultValue="rdc">
                  {Object.entries(FLOOR_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label htmlFor="accessCode">Code d'accès (facultatif)</label>
                <input id="accessCode" name="accessCode" />
              </div>
              <div className="field full">
                <label
                  htmlFor="wantsKit"
                  style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 400 }}
                >
                  <input type="checkbox" id="wantsKit" name="wantsKit" style={{ width: "auto" }} />
                  Je souhaite un kit de calfeutrage (inclus, sans supplément)
                </label>
              </div>
              <div className="field">
                <label htmlFor="deliverySlot">Livraison le {dateFr(startDay)}</label>
                <select
                  id="deliverySlot"
                  name="deliverySlot"
                  value={deliverySlot}
                  onChange={(e) => {
                    setDeliverySlot(e.target.value);
                    setPickupSlot("");
                  }}
                  required
                >
                  <option value="" disabled>
                    Choisir un créneau…
                  </option>
                  {deliveryOptions.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.id}
                    </option>
                  ))}
                </select>
                {deliveryOptions.length === 0 && (
                  <p className="cal-hint">
                    Plus aucun créneau de livraison aujourd&apos;hui : choisissez un
                    autre jour de début.
                  </p>
                )}
              </div>
              <div className="field">
                <label htmlFor="pickupSlot">Reprise le {dateFr(endDay)}</label>
                <select
                  id="pickupSlot"
                  name="pickupSlot"
                  value={pickupSlot}
                  onChange={(e) => setPickupSlot(e.target.value)}
                  required
                >
                  <option value="" disabled>
                    Choisir un créneau…
                  </option>
                  {pickupOptions.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.id}
                    </option>
                  ))}
                </select>
                {deliverySlot && pickupOptions.length === 0 && (
                  <p className="cal-hint">
                    Pour une location d&apos;un jour, choisissez un créneau de
                    livraison plus tôt dans la journée.
                  </p>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="card recap">
        <h2 className="step-title">
          <span className="step-num">3</span>Récapitulatif
        </h2>
        <div className="recap-line">
          <span>Modèle</span>
          <strong>{product.name}</strong>
        </div>
        <div className="recap-line">
          <span>Capacité</span>
          <span>
            {product.maxAreaM2} m² · {product.powerKw} kW · {product.noiseDb} dB
          </span>
        </div>
        {datesChosen ? (
          <>
            <div className="recap-line">
              <span>Du</span>
              <span>
                {dateFr(startDay)}
                {deliverySlot ? ` · ${deliverySlot}` : ""}
              </span>
            </div>
            <div className="recap-line">
              <span>Au</span>
              <span>
                {dateFr(endDay)}
                {pickupSlot ? ` · ${pickupSlot}` : ""}
              </span>
            </div>
            <div className="recap-line">
              <span>
                {euros(product.dailyPrice)} × {q.days} jour{q.days > 1 ? "s" : ""}
              </span>
              <span>{euros(q.subtotal)}</span>
            </div>
            {q.discount > 0 && (
              <div className="recap-line">
                <span>Remise longue durée (−{Math.round(q.discountRate * 100)} %)</span>
                <span className="neg">−{euros(q.discount)}</span>
              </div>
            )}
            <div className="recap-line">
              <span>Livraison & reprise</span>
              <span>{euros(q.deliveryFee)}</span>
            </div>
            <div className="recap-line total">
              <span>Total</span>
              <span>{euros(q.total)}</span>
            </div>
            {product.depositAmount > 0 && (
              <p style={{ marginTop: 10, fontSize: 12.5, color: "#5c7d94" }}>
                Une caution de {euros(product.depositAmount)} sera bloquée sur
                votre carte juste avant la livraison (non débitée sauf dégât
                constaté).
              </p>
            )}
            <SubmitButton />
            <p style={{ marginTop: 10, fontSize: 12.5, color: "#5c7d94" }}>
              Paiement sécurisé par Stripe. Vous allez être redirigé vers une
              page de paiement, puis vers votre confirmation.
            </p>
          </>
        ) : (
          <p style={{ marginTop: 12, fontSize: 13.5, color: "#5c7d94" }}>
            Choisissez vos dates pour voir le prix.
          </p>
        )}
        {state.error && <p className="form-error" role="alert">{state.error}</p>}
      </div>
    </form>
  );
}
