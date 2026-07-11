// Manipulation de dates "civiles" au format "AAAA-MM-JJ" (heure de Paris).
// La logique métier ne manipule jamais d'heures/minutes : cela évite les
// pièges de fuseaux horaires et de changement d'heure. Les chaînes
// "AAAA-MM-JJ" se comparent directement avec < et >.

// "2026-07-30" + 2 → "2026-08-01"
export function addDays(day, n) {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

export function addMonths(day, n) {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1 + n, d)).toISOString().slice(0, 10);
}

// Liste des jours de start à end inclus (vide si end < start)
export function eachDay(start, end) {
  const days = [];
  for (let d = start; d <= end; d = addDays(d, 1)) days.push(d);
  return days;
}

// Nombre de jours inclusif : du 1er au 3 = 3 jours
export function daysBetweenInclusive(start, end) {
  const utc = (day) => {
    const [y, m, d] = day.split("-").map(Number);
    return Date.UTC(y, m - 1, d);
  };
  return Math.round((utc(end) - utc(start)) / 86400000) + 1;
}

// Jour et heure actuels à Paris : { day: "AAAA-MM-JJ", hour: 0-23 }
export function nowInParis(date = new Date()) {
  const parts = new Intl.DateTimeFormat("fr-FR", {
    timeZone: "Europe/Paris",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const get = (type) => parts.find((p) => p.type === type).value;
  return {
    day: `${get("year")}-${get("month")}-${get("day")}`,
    hour: Number(get("hour")) % 24,
  };
}

// Convertit un DateTime de la base (stocké à minuit UTC) en jour civil
export function toDay(date) {
  return date.toISOString().slice(0, 10);
}
