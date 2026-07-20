"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "../../lib/prisma";
import { toDay } from "../../lib/dates";
import { slugify } from "../../lib/slug";
import {
  confirmError,
  cancelError,
  deliveryDoneEffects,
  deliveryFailError,
  unitAssignmentError,
  unitStatusChangeError,
  depositReleaseError,
  depositCaptureError,
  kitAssignmentError,
  kitStatusChangeError,
} from "../../lib/transitions";
import {
  placeDepositIfDue,
  placeDueDeposits,
  releaseDepositStripe,
  captureDepositStripe,
  refundBookingStripe,
} from "../../lib/stripe";
import { requireAdmin } from "./auth";

// Toutes les actions suivent le même patron : requireAdmin → transaction qui
// re-vérifie les préconditions et écrit → revalidation → redirection (avec
// bannière ?erreur= le cas échéant). redirect() reste HORS transaction.
function finish(path, error) {
  revalidatePath("/admin");
  redirect(error ? `${path}?erreur=${encodeURIComponent(error)}` : path);
}

// Confirme la réservation et, si l'admin les a choisis dans la même ligne du
// tableau, affecte la machine et/ou le kit en un seul clic — plus besoin de
// confirmer puis d'affecter séparément. Les deux affectations restent
// facultatives à cette étape (comme avant, on peut affecter plus tard).
export async function confirmBooking(formData) {
  await requireAdmin();
  const id = String(formData.get("id") ?? "");
  const unitId = String(formData.get("unitId") ?? "").trim();
  const kitId = String(formData.get("kitId") ?? "").trim();
  let error = null;
  await prisma.$transaction(
    async (tx) => {
      const booking = await tx.booking.findUnique({ where: { id } });
      error = booking ? confirmError(booking) : "Réservation introuvable.";
      if (error) return;

      const data = { status: "CONFIRMED" };
      const b = {
        status: booking.status,
        productId: booking.productId,
        startDay: toDay(booking.startDate),
        endDay: toDay(booking.endDate),
      };

      if (unitId) {
        const unit = await tx.unit.findUnique({
          where: { id: unitId },
          include: { bookings: { select: { id: true, startDate: true, endDate: true, status: true } } },
        });
        if (!unit) {
          error = "Machine introuvable.";
          return;
        }
        const others = unit.bookings
          .filter((x) => x.id !== booking.id)
          .map((x) => ({ startDay: toDay(x.startDate), endDay: toDay(x.endDate), status: x.status }));
        error = unitAssignmentError(b, unit, others);
        if (error) return;
        data.unitId = unitId;
      }

      if (kitId) {
        const kit = await tx.kit.findUnique({
          where: { id: kitId },
          include: { bookings: { select: { id: true, startDate: true, endDate: true, status: true } } },
        });
        if (!kit) {
          error = "Kit introuvable.";
          return;
        }
        const others = kit.bookings
          .filter((x) => x.id !== booking.id)
          .map((x) => ({ startDay: toDay(x.startDate), endDay: toDay(x.endDate), status: x.status }));
        error = kitAssignmentError(b, kit, others);
        if (error) return;
        data.kitId = kitId;
      }

      await tx.booking.update({ where: { id }, data });
    },
    { isolationLevel: "Serializable" }
  );
  if (!error) await placeDepositIfDue(id);
  finish("/admin", error);
}

export async function cancelBooking(formData) {
  await requireAdmin();
  const id = String(formData.get("id") ?? "");
  const booking = await prisma.booking.findUnique({ where: { id } });
  let error = booking ? cancelError(booking) : "Réservation introuvable.";

  // Le remboursement de la location se fait AVANT l'écriture en base, hors
  // transaction (un appel réseau ne doit jamais rester dans une transaction
  // ouverte) : s'il échoue, l'annulation est bloquée plutôt que de
  // désynchroniser l'argent et le statut.
  if (!error && booking.paymentId) {
    try {
      await refundBookingStripe(booking);
    } catch {
      error = "Le remboursement Stripe a échoué : réessayez dans un instant.";
    }
  }

  let depositToRelease = null;
  if (!error) {
    await prisma.$transaction(async (tx) => {
      const fresh = await tx.booking.findUnique({ where: { id } });
      error = fresh ? cancelError(fresh) : "Réservation introuvable.";
      if (error) return;
      if (fresh.depositStatus === "HELD") depositToRelease = fresh;
      await tx.booking.update({
        where: { id },
        data: {
          status: "CANCELLED",
          depositStatus: fresh.depositStatus === "HELD" ? "RELEASED" : fresh.depositStatus,
        },
      });
    });
  }

  // La libération de la caution se fait APRÈS l'écriture, à partir de l'état
  // lu au moment de la transaction (fresh) et non de la lecture initiale :
  // une caution posée entre les deux (par la confirmation ou la tâche
  // planifiée) doit quand même être libérée. Si Stripe échoue ici, la
  // réservation reste annulée mais la caution doit être libérée à la main.
  if (!error && depositToRelease) {
    try {
      await releaseDepositStripe(depositToRelease);
    } catch {
      error =
        "Réservation annulée, mais la libération de la caution a échoué : libérez-la manuellement depuis votre tableau de bord Stripe.";
    }
  }

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
      if (effects.kit) {
        await tx.kit.update({ where: { id: delivery.booking.kitId }, data: { status: effects.kit } });
      }
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
  const depositEuros = Number(String(formData.get("depositAmountEuros") ?? "").replace(",", "."));
  const active = formData.get("active") === "oui";

  let error = null;
  if (description.length < 10 || description.length > 500) {
    error = "La description doit faire entre 10 et 500 caractères.";
  } else if (!Number.isFinite(priceEuros) || priceEuros < 1 || priceEuros > 500) {
    error = "Le prix par jour doit être compris entre 1 € et 500 €.";
  } else if (!Number.isFinite(depositEuros) || depositEuros < 0 || depositEuros > 2000) {
    error = "La caution doit être comprise entre 0 € et 2000 €.";
  } else {
    const exists = await prisma.product.findUnique({ where: { id } });
    if (!exists) {
      error = "Modèle introuvable.";
    } else {
      await prisma.product.update({
        where: { id },
        data: {
          description,
          dailyPrice: Math.round(priceEuros * 100),
          depositAmount: Math.round(depositEuros * 100),
          active,
        },
      });
    }
  }
  revalidatePath("/admin/produits");
  revalidatePath("/catalogue");
  redirect(error ? `/admin/produits?erreur=${encodeURIComponent(error)}` : "/admin/produits?ok=1");
}

export async function checkDepositsNow() {
  await requireAdmin();
  const { failed } = await placeDueDeposits();
  finish("/admin", failed > 0 ? `${failed} caution(s) n'ont pas pu être posées — vérifiez le tableau.` : null);
}

export async function releaseDeposit(formData) {
  await requireAdmin();
  const id = String(formData.get("id") ?? "");
  const booking = await prisma.booking.findUnique({ where: { id } });
  let error = booking ? depositReleaseError(booking) : "Réservation introuvable.";
  if (!error) {
    try {
      await releaseDepositStripe(booking);
    } catch {
      error = "La libération Stripe a échoué : réessayez dans un instant.";
    }
  }
  if (!error) {
    await prisma.booking.update({ where: { id }, data: { depositStatus: "RELEASED" } });
  }
  finish("/admin", error);
}

export async function captureDeposit(formData) {
  await requireAdmin();
  const id = String(formData.get("id") ?? "");
  const amountEuros = Number(String(formData.get("montantEuros") ?? "").replace(",", "."));
  const amountCents = Math.round(amountEuros * 100);
  const booking = await prisma.booking.findUnique({ where: { id } });
  let error = booking ? depositCaptureError(booking, amountCents) : "Réservation introuvable.";
  if (!error) {
    try {
      await captureDepositStripe(booking, amountCents);
    } catch {
      error = "L'encaissement Stripe a échoué : réessayez dans un instant.";
    }
  }
  if (!error) {
    await prisma.booking.update({
      where: { id },
      data: { depositStatus: "CAPTURED", capturedAmount: amountCents },
    });
  }
  finish("/admin", error);
}

export async function createProduct(formData) {
  await requireAdmin();
  const name = String(formData.get("name") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const powerKw = Number(String(formData.get("powerKw") ?? "").replace(",", "."));
  const noiseDb = Number(String(formData.get("noiseDb") ?? ""));
  const maxAreaM2 = Number(String(formData.get("maxAreaM2") ?? ""));
  const priceEuros = Number(String(formData.get("dailyPriceEuros") ?? "").replace(",", "."));
  const depositEuros = Number(String(formData.get("depositAmountEuros") ?? "").replace(",", "."));
  const imageUrl = String(formData.get("imageUrl") ?? "").trim();
  const active = formData.get("active") === "oui";

  let error = null;
  if (name.length < 2 || name.length > 60) {
    error = "Le nom doit faire entre 2 et 60 caractères.";
  } else if (description.length < 10 || description.length > 500) {
    error = "La description doit faire entre 10 et 500 caractères.";
  } else if (!Number.isFinite(powerKw) || powerKw < 0.1 || powerKw > 20) {
    error = "La puissance doit être comprise entre 0,1 et 20 kW.";
  } else if (!Number.isInteger(noiseDb) || noiseDb < 20 || noiseDb > 90) {
    error = "Le bruit doit être un nombre entier entre 20 et 90 dB.";
  } else if (!Number.isInteger(maxAreaM2) || maxAreaM2 < 1 || maxAreaM2 > 300) {
    error = "La surface max doit être un nombre entier entre 1 et 300 m².";
  } else if (!Number.isFinite(priceEuros) || priceEuros < 1 || priceEuros > 500) {
    error = "Le prix par jour doit être compris entre 1 € et 500 €.";
  } else if (!Number.isFinite(depositEuros) || depositEuros < 0 || depositEuros > 2000) {
    error = "La caution doit être comprise entre 0 € et 2000 €.";
  } else if (imageUrl.length > 500) {
    error = "Le lien d'image est trop long.";
  }

  if (!error) {
    const base = slugify(name) || "modele";
    let slug = base;
    let n = 2;
    while (await prisma.product.findUnique({ where: { slug }, select: { id: true } })) {
      slug = `${base}-${n}`;
      n += 1;
    }

    await prisma.product.create({
      data: {
        slug,
        name,
        description,
        powerKw,
        noiseDb,
        maxAreaM2,
        dailyPrice: Math.round(priceEuros * 100),
        depositAmount: Math.round(depositEuros * 100),
        active,
        images: imageUrl
          ? { create: [{ url: imageUrl, alt: `Climatiseur ${name} vue de face`, position: 0 }] }
          : undefined,
      },
    });
  }

  revalidatePath("/admin/produits");
  revalidatePath("/catalogue");
  redirect(error ? `/admin/produits?erreur=${encodeURIComponent(error)}` : "/admin/produits?ok=1");
}

export async function createUnit(formData) {
  await requireAdmin();
  const productId = String(formData.get("productId") ?? "");
  const serialNumber = String(formData.get("serialNumber") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim().slice(0, 500);

  let error = null;
  if (serialNumber.length < 3 || serialNumber.length > 40) {
    error = "Le numéro de série doit faire entre 3 et 40 caractères.";
  } else {
    const product = await prisma.product.findUnique({ where: { id: productId } });
    if (!product) {
      error = "Modèle introuvable.";
    } else {
      try {
        await prisma.unit.create({ data: { productId, serialNumber, notes: notes || null } });
      } catch (e) {
        if (e.code !== "P2002") throw e;
        error = "Ce numéro de série existe déjà.";
      }
    }
  }
  finish("/admin", error);
}

export async function createKit(formData) {
  await requireAdmin();
  const serialNumber = String(formData.get("serialNumber") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim().slice(0, 500);

  let error = null;
  if (serialNumber.length < 1 || serialNumber.length > 40) {
    error = "Le numéro du kit doit faire entre 1 et 40 caractères.";
  } else {
    try {
      await prisma.kit.create({ data: { serialNumber, notes: notes || null } });
    } catch (e) {
      if (e.code !== "P2002") throw e;
      error = "Ce numéro de kit existe déjà.";
    }
  }
  finish("/admin", error);
}

export async function saveKit(formData) {
  await requireAdmin();
  const id = String(formData.get("id") ?? "");
  const statut = String(formData.get("statut") ?? "");
  const notes = String(formData.get("notes") ?? "").trim().slice(0, 500);
  let error = null;
  await prisma.$transaction(async (tx) => {
    const kit = await tx.kit.findUnique({ where: { id } });
    if (!kit) {
      error = "Kit introuvable.";
      return;
    }
    error = kitStatusChangeError(kit, statut);
    if (error) return;
    await tx.kit.update({ where: { id }, data: { status: statut, notes: notes || null } });
  });
  finish("/admin", error);
}

export async function assignKit(formData) {
  await requireAdmin();
  const bookingId = String(formData.get("bookingId") ?? "");
  const kitId = String(formData.get("kitId") ?? "");
  let error = null;
  await prisma.$transaction(
    async (tx) => {
      const booking = await tx.booking.findUnique({ where: { id: bookingId } });
      const kit = await tx.kit.findUnique({
        where: { id: kitId },
        include: {
          bookings: { select: { id: true, startDate: true, endDate: true, status: true } },
        },
      });
      if (!booking || !kit) {
        error = "Réservation ou kit introuvable.";
        return;
      }
      const b = {
        status: booking.status,
        startDay: toDay(booking.startDate),
        endDay: toDay(booking.endDate),
      };
      const others = kit.bookings
        .filter((x) => x.id !== booking.id)
        .map((x) => ({ startDay: toDay(x.startDate), endDay: toDay(x.endDate), status: x.status }));
      error = kitAssignmentError(b, kit, others);
      if (error) return;
      await tx.booking.update({ where: { id: bookingId }, data: { kitId } });
    },
    { isolationLevel: "Serializable" }
  );
  finish("/admin", error);
}
