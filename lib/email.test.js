import { test } from "node:test";
import assert from "node:assert/strict";
import { buildBookingConfirmationEmail, buildAdminNotificationEmail } from "./email.js";

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
