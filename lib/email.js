// Emails transactionnels (confirmation de réservation) via Resend.
// Ce fichier appelle une API externe : pas de tests unitaires sur l'envoi
// lui-même (comme lib/stripe.js), seulement sur les fonctions pures qui
// construisent le contenu — voir email.test.js.

import { Resend } from "resend";
import { euros, FLOOR_LABELS } from "./constants.js";

const dateFr = (d) =>
  new Date(d).toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  });

// Les valeurs interpolées dans le HTML (prénom, adresse…) viennent du
// formulaire de réservation, qui ne fait que trim/limiter la longueur —
// donc jamais de HTML brut dans un email sans échappement.
const escapeHtml = (value) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

function recapLines(booking) {
  const dropoff = booking.deliveries.find((d) => d.type === "DROPOFF");
  const pickup = booking.deliveries.find((d) => d.type === "PICKUP");

  const lines = [
    ["Référence", booking.reference],
    ["Modèle", booking.product.name],
    ["Livraison", `${dateFr(booking.startDate)} · ${dropoff?.timeSlot ?? ""}`],
    ["Reprise", `${dateFr(booking.endDate)} · ${pickup?.timeSlot ?? ""}`],
    [
      "Adresse",
      `${booking.address.line1}, ${booking.address.zip} ${booking.address.city} (${FLOOR_LABELS[booking.address.floor]})`,
    ],
    ["Total payé", euros(booking.total)],
  ];
  if (booking.depositAmount > 0) {
    lines.push([
      "Caution",
      `${euros(booking.depositAmount)} (bloquée juste avant la livraison, non débitée sauf dégât constaté)`,
    ]);
  }
  return lines;
}

// Contenu de l'email envoyé au client — fonction pure, testée sans réseau.
// Reprend le même récapitulatif que la page /reserver/confirmation/<réf>.
export function buildBookingConfirmationEmail(booking) {
  const lines = recapLines(booking);
  const rowsHtml = lines
    .map(
      ([label, value]) =>
        `<tr><td style="padding:4px 12px 4px 0;color:#5c7d94;">${escapeHtml(label)}</td><td style="padding:4px 0;"><strong>${escapeHtml(value)}</strong></td></tr>`
    )
    .join("");
  const rowsText = lines.map(([label, value]) => `${label} : ${value}`).join("\n");

  const intro = `Votre paiement est confirmé et les dates sont bloquées pour vous. Nous confirmons votre demande rapidement par téléphone ou par email.`;

  return {
    subject: `Votre réservation LOOTACLIM — ${booking.reference}`,
    html: `<div style="font-family:sans-serif;max-width:520px;margin:auto;">
      <h1 style="font-size:20px;">Merci ${escapeHtml(booking.customer.firstName)} !</h1>
      <p>${intro}</p>
      <table>${rowsHtml}</table>
    </div>`,
    text: `Merci ${booking.customer.firstName} !\n\n${intro}\n\n${rowsText}`,
  };
}

// Notification interne envoyée à l'admin à chaque nouvelle réservation
// payée — pour être alerté sans avoir à surveiller le back-office.
export function buildAdminNotificationEmail(booking) {
  const { html, text } = buildBookingConfirmationEmail(booking);
  const contact = `${booking.customer.firstName} ${booking.customer.lastName} · ${booking.customer.email} · ${booking.customer.phone}`;

  return {
    subject: `Nouvelle réservation payée — ${booking.reference} (${booking.customer.firstName} ${booking.customer.lastName})`,
    html: `<p><strong>${escapeHtml(contact)}</strong></p>${html}`,
    text: `${contact}\n\n${text}`,
  };
}

let resendClient = null;
function getResend() {
  const key = process.env.RESEND_API_KEY;
  if (!key) return null;
  if (!resendClient) resendClient = new Resend(key);
  return resendClient;
}

// Envoie l'email de confirmation au client et une notification à l'admin.
// N'échoue jamais bruyamment : la base de données reste la source de
// vérité pour la réservation, une erreur d'envoi est seulement journalisée.
// Sans RESEND_API_KEY configurée, ne fait rien (site utilisable en local
// sans compte Resend).
export async function sendBookingConfirmationEmail(booking) {
  const resend = getResend();
  if (!resend) return;

  const from = process.env.EMAIL_FROM || "LOOTACLIM <onboarding@resend.dev>";

  try {
    await resend.emails.send({ from, to: booking.customer.email, ...buildBookingConfirmationEmail(booking) });
  } catch (error) {
    console.error(`Échec envoi email client (${booking.reference})`, error);
  }

  const adminAddress = process.env.ADMIN_NOTIFICATION_EMAIL;
  if (!adminAddress) return;

  try {
    await resend.emails.send({ from, to: adminAddress, ...buildAdminNotificationEmail(booking) });
  } catch (error) {
    console.error(`Échec envoi email admin (${booking.reference})`, error);
  }
}
