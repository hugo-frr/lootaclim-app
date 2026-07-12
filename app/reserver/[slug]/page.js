import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "../../../lib/prisma";
import { capacity, fullDays, minStartDay } from "../../../lib/availability";
import { nowInParis, addMonths, addDays, toDay } from "../../../lib/dates";
import BookingWizard from "./BookingWizard";

export const dynamic = "force-dynamic";

export default async function Reserver({ params }) {
  const product = await prisma.product.findUnique({
    where: { slug: params.slug },
    include: { units: true },
  });
  if (!product || !product.active) notFound();

  const cap = capacity(product.units);
  const now = nowInParis();
  const minDay = minStartDay(now);
  const maxDay = addMonths(now.day, 3);

  const bookings = (
    await prisma.booking.findMany({
      where: { productId: product.id },
      select: { startDate: true, endDate: true, status: true },
    })
  ).map((b) => ({
    startDay: toDay(b.startDate),
    endDay: toDay(b.endDate),
    status: b.status,
  }));

  // +1 jour : le battement de la dernière plage peut dépasser maxDay
  const full = [...fullDays(bookings, cap, now.day, addDays(maxDay, 1))];

  return (
    <div>
      <span className="eyebrow">Réservation</span>
      <h1 className="section-title">Réserver un {product.name}</h1>
      {cap === 0 ? (
        <div className="card">
          <p>
            Ce modèle n&apos;est pas réservable pour le moment.{" "}
            <Link href="/catalogue">Voir les autres modèles</Link>.
          </p>
        </div>
      ) : (
        <BookingWizard
          product={{
            slug: product.slug,
            name: product.name,
            dailyPrice: product.dailyPrice,
            maxAreaM2: product.maxAreaM2,
            powerKw: product.powerKw,
            noiseDb: product.noiseDb,
          }}
          fullDays={full}
          minDay={minDay}
          maxDay={maxDay}
        />
      )}
    </div>
  );
}
