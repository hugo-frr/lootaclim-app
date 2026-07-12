"use client";

import { useMemo, useState } from "react";
import { rangeError } from "../../../lib/availability";

const WEEKDAYS = ["lu", "ma", "me", "je", "ve", "sa", "di"];

// Grille d'un mois : cases "AAAA-MM-JJ", complétées par null pour aligner
// le 1er du mois sur son jour de semaine (semaine commençant lundi).
function monthGrid(year, month) {
  const first = new Date(Date.UTC(year, month, 1));
  const lead = (first.getUTCDay() + 6) % 7; // lundi = 0
  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const cells = Array(lead).fill(null);
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push(
      `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`
    );
  }
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

function monthName(year, month) {
  return new Date(Date.UTC(year, month, 1)).toLocaleDateString("fr-FR", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

// Libellé accessible d'un jour ("mercredi 15 juillet") — ancré à midi pour
// éviter tout glissement de jour entre fuseaux horaires.
const dayLabel = (day) =>
  new Date(`${day}T12:00:00`).toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });

// Calendrier de sélection d'une plage : premier clic = début, deuxième = fin
// (re-clic pour recommencer). Les jours complets ou hors bornes sont grisés.
export default function Calendar({
  minDay,
  maxDay,
  fullDays,
  startDay,
  endDay,
  onSelect,
  onHint,
}) {
  const full = useMemo(() => new Set(fullDays), [fullDays]);
  const [offset, setOffset] = useState(0); // 1er des 2 mois affichés

  const [minY, minM] = minDay.split("-").map(Number);
  const [maxY, maxM] = maxDay.split("-").map(Number);
  const totalMonths = (maxY - minY) * 12 + (maxM - minM) + 1;
  const maxOffset = Math.max(0, totalMonths - 2);

  const months = [0, 1].map((i) => {
    const d = new Date(Date.UTC(minY, minM - 1 + offset + i, 1));
    return { year: d.getUTCFullYear(), month: d.getUTCMonth() };
  });

  function clickDay(day) {
    onHint(null);
    if (!startDay || (startDay && endDay)) return onSelect(day, null);
    if (day < startDay) return onSelect(day, null);
    const err = rangeError(startDay, day, full, minDay, maxDay);
    if (err) return onHint(err);
    onSelect(startDay, day);
  }

  const inRange = (day) => startDay && endDay && day >= startDay && day <= endDay;
  const isEdge = (day) => day === startDay || day === endDay;

  return (
    <div>
      <div className="cal-header">
        <button
          type="button"
          className="cal-nav"
          onClick={() => setOffset(offset - 1)}
          disabled={offset === 0}
          aria-label="Mois précédents"
        >
          ‹
        </button>
        <button
          type="button"
          className="cal-nav"
          onClick={() => setOffset(offset + 1)}
          disabled={offset >= maxOffset}
          aria-label="Mois suivants"
        >
          ›
        </button>
      </div>
      <div className="cal-months">
        {months.map(({ year, month }) => (
          <div key={`${year}-${month}`}>
            <div className="cal-month-name">{monthName(year, month)}</div>
            <div className="cal-grid">
              {WEEKDAYS.map((w, i) => (
                <div key={`w${i}`} className="cal-weekday">
                  {w}
                </div>
              ))}
              {monthGrid(year, month).map((day, i) =>
                day === null ? (
                  <div key={i} />
                ) : (
                  <button
                    type="button"
                    key={i}
                    className={`cal-day${inRange(day) ? " in-range" : ""}${isEdge(day) ? " edge" : ""}`}
                    disabled={day < minDay || day > maxDay || full.has(day)}
                    onClick={() => clickDay(day)}
                    aria-label={dayLabel(day)}
                  >
                    {Number(day.slice(8))}
                  </button>
                )
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
