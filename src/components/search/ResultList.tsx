import { ChevronLeft } from "lucide-react";
import { DemoBadge } from "@/components/ui/Badge";
import type { SearchHit } from "@/lib/search/engine";
import { toPersianDigits } from "@/lib/search/normalize";

/** Compact result rows (used inside the viewer's side panel and the mobile search dropdown). */
export function ResultList({
  hits,
  onSelect,
  emptyText = "موردی پیدا نشد. عبارت دیگری را امتحان کنید.",
}: {
  hits: readonly SearchHit[];
  onSelect: (hit: SearchHit) => void;
  emptyText?: string;
}) {
  if (hits.length === 0) {
    return <p className="px-2 py-6 text-center text-sm text-gray-500">{emptyText}</p>;
  }
  return (
    <ul className="divide-y divide-gray-100" aria-label="نتایج جستجو">
      {hits.map((hit) => (
        <li key={`${hit.kind}-${hit.id}`}>
          <button
            type="button"
            onClick={() => onSelect(hit)}
            className="flex min-h-14 w-full items-center justify-between gap-3 rounded-lg px-2 py-2 text-start hover:bg-gray-50 active:bg-gray-100"
          >
            <span className="min-w-0">
              <span className="flex items-center gap-2">
                <span className="truncate text-[15px] font-medium text-navy-900">{hit.title}</span>
                {hit.department?.isDemo || hit.room.isDemo ? <DemoBadge className="shrink-0" /> : null}
              </span>
              <span className="block truncate text-xs text-gray-500">
                {hit.floor.displayName} · اتاق {toPersianDigits(hit.room.roomNumber)}
                {hit.services.length > 0 && ` · ${hit.services.slice(0, 2).map((s) => s.serviceName).join("، ")}`}
              </span>
            </span>
            <ChevronLeft className="size-4 shrink-0 text-gray-300" aria-hidden />
          </button>
        </li>
      ))}
    </ul>
  );
}
