import { test } from "node:test";
import assert from "node:assert/strict";
import { buildBookingConfirmationEmail, buildAdminNotificationEmail, buildBookingConfirmedEmail } from "./email.js";

const booking = {
  reference: "LC-2026-0042",
  total: 12300,
  depositAmount: 0,
  customer: { firstName: "Julie", lastName: "Martin", email: "julie@example.com", phone: "0601020304" },
  address: { line1: "12 rue de Rivoli", zip: "75004", city: "Paris", floor: "asc" },
  product: { name: "RIVOLI" },
  startDate: "2026-08-01T00:00:00.000Z",
  endDate: "2026-08-04T00:00:00.000Z",
  deliveries: [
    { type: "DROPOFF", timeSlot: "9h-11h" },
    { type: "PICKUP", timeSlot: "14h-16h" },
  ],
};

test("buildBookingConfirmationEmail : sujet et contenu de base", () => {
  const email = buildBookingConfirmationEmail(booking);
  assert.match(email.subject, /LC-2026-0042/);
  assert.match(email.text, /Julie/);
  assert.match(email.text, /RIVOLI/);
  assert.match(email.text, /12 rue de Rivoli/);
  assert.match(email.text, /123,00/);
  assert.match(email.html, /LC-2026-0042/);
});

test("buildBookingConfirmationEmail : pas de mention de caution si depositAmount = 0", () => {
  const email = buildBookingConfirmationEmail(booking);
  assert.doesNotMatch(email.text, /[Cc]aution/);
});

test("buildBookingConfirmationEmail : mention de la caution si depositAmount > 0", () => {
  const email = buildBookingConfirmationEmail({ ...booking, depositAmount: 15000 });
  assert.match(email.text, /150,00.*[Cc]aution|[Cc]aution.*150,00/s);
});

test("buildAdminNotificationEmail : inclut les coordonnées du client et la référence", () => {
  const email = buildAdminNotificationEmail(booking);
  assert.match(email.subject, /LC-2026-0042/);
  assert.match(email.text, /Julie Martin/);
  assert.match(email.text, /julie@example\.com/);
  assert.match(email.text, /0601020304/);
});

test("buildBookingConfirmationEmail : échappe le HTML injecté via les champs du formulaire", () => {
  const malicious = {
    ...booking,
    customer: { ...booking.customer, firstName: "<script>alert(1)</script>" },
    address: { ...booking.address, line1: "<img src=x onerror=alert(2)>" },
  };
  const email = buildBookingConfirmationEmail(malicious);
  assert.doesNotMatch(email.html, /<script>/);
  assert.doesNotMatch(email.html, /<img/);
  assert.match(email.html, /&lt;script&gt;/);
});

test("buildAdminNotificationEmail : échappe aussi la ligne de contact", () => {
  const malicious = {
    ...booking,
    customer: { ...booking.customer, lastName: '"><script>alert(3)</script>' },
  };
  const email = buildAdminNotificationEmail(malicious);
  assert.doesNotMatch(email.html, /<script>/);
});

test("buildBookingConfirmedEmail : court, sans le récapitulatif complet", () => {
  const email = buildBookingConfirmedEmail(booking);
  assert.match(email.subject, /LC-2026-0042/);
  assert.match(email.text, /Julie/);
  assert.match(email.text, /RIVOLI/);
  assert.match(email.text, /LC-2026-0042/);
  // Pas le récap complet du premier email (adresse, prix) : volontairement court.
  assert.doesNotMatch(email.text, /12 rue de Rivoli/);
  assert.doesNotMatch(email.text, /123,00/);
});

test("buildBookingConfirmedEmail : échappe le HTML injecté", () => {
  const malicious = {
    ...booking,
    customer: { ...booking.customer, firstName: "<script>alert(1)</script>" },
  };
  const email = buildBookingConfirmedEmail(malicious);
  assert.doesNotMatch(email.html, /<script>/);
  assert.match(email.html, /&lt;script&gt;/);
});
