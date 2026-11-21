import { Navigation } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { DemoBadge } from "@/components/ui/Badge";
import { buildLookups } from "@/lib/data/lookups";
import { getNavigatorData } from "@/lib/data/repository";
import { toPersianDigits } from "@/lib/search/normalize";

export const metadata: Metadata = { title: "مسیریابی" };

/**
 * /directions
 *   ?to=<department slug | room id>[&from=<navigation node id>]  → opens the building viewer with route planning.
 *   no parameters                                                  → pick a destination.
 * Route calculation itself happens in the building viewer (client side), so this page only resolves a destination.
 */
export default async function DirectionsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const to = first(sp["to"]);
  const from = first(sp["from"]);

  const data = await getNavigatorData();
  const lookups = buildLookups(data);

  if (to) {
    const dept = lookups.departmentsBySlug.get(to);
    const room = dept ? lookups.roomsById.get(dept.roomId) : lookups.roomsById.get(to);
    const floor = room ? lookups.floorsById.get(room.floorId) : undefined;
    const building = floor ? lookups.buildingsById.get(floor.buildingId) : undefined;
    if (room && building?.isActive) {
      const q = new URLSearchParams({ navigate: "1" });
      q.set(dept ? "dept" : "room", dept ? dept.slug : room.id);
      if (from && lookups.nodesById.has(from)) q.set("from", from);
      redirect(`/buildings/${building.slug}?${q.toString()}`);
    }
  }

  const departments = data.departments.filter((d) => d.isActive).sort((a, b) => a.name.localeCompare(b.name, "fa"));
  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-6 md:px-6 md:py-10">
      <h1 className="mb-1 flex items-center gap-2 text-2xl font-bold"><Navigation className="size-6 text-blue-600" aria-hidden />مسیریابی داخل ساختمان</h1>
      <p className="mb-6 text-sm leading-7 text-gray-500">
        مقصد را انتخاب کنید؛ نقطه‌ی شروع را در نقشه خودتان تعیین می‌کنید (موقعیت‌یابی زنده وجود ندارد).
        {to && " مقصد درخواستی پیدا نشد؛ از فهرست زیر انتخاب کنید."}
      </p>
      <ul className="grid gap-2 sm:grid-cols-2">
        {departments.map((d) => {
          const room = lookups.roomsById.get(d.roomId);
          const floor = room ? lookups.floorsById.get(room.floorId) : undefined;
          return (
            <li key={d.id}>
              <Link href={`/directions?to=${d.slug}`} className="flex min-h-16 items-center justify-between gap-3 rounded-xl border border-gray-200 bg-white p-3 hover:bg-gray-50">
                <span className="min-w-0">
                  <span className="flex items-center gap-2 text-[15px] font-medium">{d.name}{d.isDemo && <DemoBadge />}</span>
                  <span className="block text-xs text-gray-500">{floor?.displayName}{room ? ` · اتاق ${toPersianDigits(room.roomNumber)}` : ""}</span>
                </span>
                <Navigation className="size-4 shrink-0 text-blue-600" aria-hidden />
              </Link>
            </li>
          );
        })}
      </ul>
    </main>
  );
}
