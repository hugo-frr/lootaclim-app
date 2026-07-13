"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "../../lib/prisma";
import { toDay } from "../../lib/dates";
import {
  confirmError,
  cancelError,
  deliveryDoneEffects,
  deliveryFailError,
  unitAssignmentError,
  unitStatusChangeError,
} from "../../lib/transitions";
import { requireAdmin } from "./auth";

// Toutes les actions suivent le même patron : requireAdmin → transaction qui
// re-vérifie les préconditions et écrit → revalidation → redirection (avec
// bannière ?erreur= le cas échéant). redirect() reste HORS transaction.
function finish(path, error) {
  revalidatePath("/admin");
  redirect(error ? `${path}?erreur=${encodeURIComponent(error)}` : path);
}

export async function confirmBooking(formData) {
  await requireAdmin();
  const id = String(formData.get("id") ?? "");
  let error = null;
  await prisma.$transaction(async (tx) => {
    const booking = await tx.booking.findUnique({ where: { id } });
    error = booking ? confirmError(booking) : "Réservation introuvable.";
    if (error) return;
    await tx.booking.update({ where: { id }, data: { status: "CONFIRMED" } });
  });
  finish("/admin", error);
}

export async function cancelBooking(formData) {
  await requireAdmin();
  const id = String(formData.get("id") ?? "");
  let error = null;
  await prisma.$transaction(async (tx) => {
    const booking = await tx.booking.findUnique({ where: { id } });
    error = booking ? cancelError(booking) : "Réservation introuvable.";
    if (error) return;
    await tx.booking.update({ where: { id }, data: { status: "CANCELLED" } });
  });
  finish("/admin", error);
}

export async function assignUnit(formData) {
  await requireAdmin();
  const bookingId = String(formData.get("bookingId") ?? "");
  const unitId = String(formData.get("unitId") ?? "");
  let error = null;
  await prisma.$transaction(
    async (tx) => {
      const booking = await tx.booking.findUnique({ where: { id: bookingId } });
      const unit = await tx.unit.findUnique({
        where: { id: unitId },
        include: {
          bookings: { select: { id: true, startDate: true, endDate: true, status: true } },
        },
      });
      if (!booking || !unit) {
        error = "Réservation ou machine introuvable.";
        return;
      }
      const b = {
        status: booking.status,
        productId: booking.productId,
        startDay: toDay(booking.startDate),
        endDay: toDay(booking.endDate),
      };
      const others = unit.bookings
        .filter((x) => x.id !== booking.id)
        .map((x) => ({ startDay: toDay(x.startDate), endDay: toDay(x.endDate), status: x.status }));
      error = unitAssignmentError(b, unit, others);
      if (error) return;
      await tx.booking.update({ where: { id: bookingId }, data: { unitId } });
    },
    { isolationLevel: "Serializable" }
  );
  finish("/admin", error);
}

export async function markDelivery(formData) {
  await requireAdmin();
  const id = String(formData.get("id") ?? "");
  const resultat = String(formData.get("resultat") ?? "");
  let error = null;
  await prisma.$transaction(
    async (tx) => {
      const delivery = await tx.delivery.findUnique({
        where: { id },
        include: { booking: true },
      });
      if (!delivery) {
        error = "Intervention introuvable.";
        return;
      }
      if (resultat === "FAILED") {
        error = deliveryFailError(delivery);
        if (error) return;
        await tx.delivery.update({ where: { id }, data: { status: "FAILED" } });
        return;
      }
      const effects = deliveryDoneEffects(delivery, delivery.booking);
      if (effects.error) {
        error = effects.error;
        return;
      }
      await tx.delivery.update({ where: { id }, data: { status: "DONE" } });
      await tx.booking.update({
        where: { id: delivery.bookingId },
        data: { status: effects.booking },
      });
      await tx.unit.update({
        where: { id: delivery.booking.unitId },
        data: { status: effects.unit },
      });
    },
    { isolationLevel: "Serializable" }
  );
  finish("/admin", error);
}

export async function saveUnit(formData) {
  await requireAdmin();
  const id = String(formData.get("id") ?? "");
  const statut = String(formData.get("statut") ?? "");
  const notes = String(formData.get("notes") ?? "").trim().slice(0, 500);
  let error = null;
  await prisma.$transaction(async (tx) => {
    const unit = await tx.unit.findUnique({ where: { id } });
    if (!unit) {
      error = "Machine introuvable.";
      return;
    }
    error = unitStatusChangeError(unit, statut);
    if (error) return;
    await tx.unit.update({ where: { id }, data: { status: statut, notes: notes || null } });
  });
  finish("/admin", error);
}

export async function updateProduct(formData) {
  await requireAdmin();
  const id = String(formData.get("id") ?? "");
  const description = String(formData.get("description") ?? "").trim();
  const priceEuros = Number(String(formData.get("dailyPriceEuros") ?? "").replace(",", "."));
  const active = formData.get("active") === "oui";

  let error = null;
  if (description.length < 10 || description.length > 500) {
    error = "La description doit faire entre 10 et 500 caractères.";
  } else if (!Number.isFinite(priceEuros) || priceEuros < 1 || priceEuros > 500) {
    error = "Le prix par jour doit être compris entre 1 € et 500 €.";
  } else {
    const exists = await prisma.product.findUnique({ where: { id } });
    if (!exists) {
      error = "Modèle introuvable.";
    } else {
      await prisma.product.update({
        where: { id },
        data: { description, dailyPrice: Math.round(priceEuros * 100), active },
      });
    }
  }
  revalidatePath("/admin/produits");
  revalidatePath("/catalogue");
  redirect(error ? `/admin/produits?erreur=${encodeURIComponent(error)}` : "/admin/produits?ok=1");
}
