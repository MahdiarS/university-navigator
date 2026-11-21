import { Building2, ExternalLink, Layers, MapPin, Navigation } from "lucide-react";
import Link from "next/link";
import { DemoBadge } from "@/components/ui/Badge";
import { buttonStyles } from "@/components/ui/Button";
import type { SearchHit } from "@/lib/search/engine";
import { toPersianDigits } from "@/lib/search/normalize";

/** Where a search hit lives on the map (deep links understood by /buildings/[slug]). */
export function hitMapHref(hit: SearchHit, navigate = false): string {
  const target = hit.department ? `dept=${hit.department.slug}` : `room=${hit.room.id}`;
  return `/buildings/${hit.building.slug}?${target}${navigate ? "&navigate=1" : ""}`;
}

/** Full-size result card for /search: where it is, what it offers, and the three actions. */
export function ResultCard({ hit }: { hit: SearchHit }) {
  const demo = hit.department?.isDemo || hit.room.isDemo;
  const services = hit.services.map((s) => s.serviceName);
  return (
    <article className="flex flex-col gap-3 rounded-2xl border border-gray-200 bg-white p-4 shadow-panel">
      <header className="space-y-1">
        <h2 className="flex flex-wrap items-center gap-2 text-[17px] font-bold leading-7">
          {hit.department ? (
            <Link href={`/departments/${hit.department.slug}`} className="hover:text-blue-600">{hit.title}</Link>
          ) : (
            hit.title
          )}
          {demo && <DemoBadge />}
        </h2>
        <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-500">
          <span className="flex items-center gap-1"><Building2 className="size-3.5" aria-hidden />{hit.building.name}</span>
          <span className="flex items-center gap-1"><Layers className="size-3.5" aria-hidden />{hit.floor.displayName}</span>
          <span className="flex items-center gap-1"><MapPin className="size-3.5" aria-hidden />اتاق {toPersianDigits(hit.room.roomNumber)}</span>
        </p>
      </header>

      {services.length > 0 && (
        <ul className="flex flex-wrap gap-1.5" aria-label="خدمات">
          {services.slice(0, 4).map((s) => (
            <li key={s} className="rounded-full bg-gray-100 px-2.5 py-1 text-xs text-gray-700">{s}</li>
          ))}
          {services.length > 4 && <li className="px-1 py-1 text-xs text-gray-500">+{toPersianDigits(services.length - 4)} خدمت دیگر</li>}
        </ul>
      )}

      <footer className="mt-auto flex flex-wrap gap-2 pt-1">
        <Link href={hitMapHref(hit, true)} className={buttonStyles("primary", "sm")}>
          <Navigation className="size-4" aria-hidden />
          مسیریابی
        </Link>
        <Link href={hitMapHref(hit)} className={buttonStyles("secondary", "sm")}>
          <MapPin className="size-4" aria-hidden />
          نمایش روی نقشه
        </Link>
        {hit.department && (
          <Link href={`/departments/${hit.department.slug}`} className={buttonStyles("ghost", "sm")}>
            <ExternalLink className="size-4" aria-hidden />
            جزئیات
          </Link>
        )}
      </footer>
    </article>
  );
}
