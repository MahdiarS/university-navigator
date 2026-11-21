"use client";
import { Building2, DoorOpen, Layers, Minus, Plus, RotateCcw } from "lucide-react";
import { useReducer, useState } from "react";
import { DynamicCampusViewer } from "@/components/3d/DynamicCampusViewer";
import { useNavigator } from "@/components/DataProvider";
import { DemoBadge } from "@/components/ui/Badge";
import { ButtonLink, IconButton } from "@/components/ui/Button";
import { toPersianDigits } from "@/lib/search/normalize";
import { findCampusBuilding } from "@/lib/model/campus";
import { initialViewerState, viewerReducer } from "@/lib/model/viewerState";
import { cn } from "@/lib/utils/cn";

/** /campus — interactive schematic campus. Selecting the pilot building shows its summary and the way in. */
export function CampusExplorer() {
  const { data, lookups } = useNavigator();
  const campus = data.manifest.campus;
  const [selected, setSelected] = useState<string | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);
  const [viewer, dispatch] = useReducer(viewerReducer, initialViewerState);

  const entry = findCampusBuilding(campus, selected);
  const building = selected ? lookups.buildingsBySlug.get(selected) : undefined;
  const floors = building ? (lookups.floorsByBuilding.get(building.id) ?? []) : [];
  const roomCount = floors.reduce((n, f) => n + (lookups.roomsByFloor.get(f.id)?.length ?? 0), 0);
  const clickable = campus.buildings.filter((b) => b.clickable && b.slug);

  return (
    <main className="relative flex min-h-0 flex-1 flex-col md:flex-row" aria-label="نقشه سه‌بعدی پردیس">
      <aside className="un-scroll order-2 flex shrink-0 flex-col gap-4 overflow-y-auto border-t border-gray-200 bg-white p-4 md:order-1 md:w-[380px] md:border-e md:border-t-0">
        <div>
          <h1 className="text-lg font-bold">پردیس دانشگاه</h1>
          <p className="mt-1 text-sm leading-7 text-gray-500">
            نمای شماتیک و نمایشی از پردیس. ساختمان را روی نقشه یا از فهرست زیر انتخاب کنید.
          </p>
          {campus.isDemo && <DemoBadge className="mt-2" />}
        </div>

        <ul className="space-y-2" aria-label="ساختمان‌ها">
          {clickable.map((b) => (
            <li key={b.slug}>
              <button
                type="button"
                aria-pressed={selected === b.slug}
                onClick={() => setSelected(b.slug)}
                onMouseEnter={() => setHovered(b.slug)}
                onMouseLeave={() => setHovered(null)}
                className={cn(
                  "flex min-h-14 w-full items-center gap-3 rounded-xl border px-3 text-start transition-colors",
                  selected === b.slug ? "border-orange-500 bg-orange-100" : "border-gray-200 hover:bg-gray-50",
                )}
              >
                <Building2 className="size-5 shrink-0 text-navy-800" aria-hidden />
                <span className="text-[15px] font-medium">{b.label}</span>
              </button>
            </li>
          ))}
        </ul>

        {entry && building ? (
          <section aria-label="ساختمان انتخاب‌شده" className="space-y-3 rounded-xl border border-gray-200 p-4">
            <h2 className="flex flex-wrap items-center gap-2 text-base font-bold">
              {building.name}
              {building.isDemo && <DemoBadge />}
            </h2>
            {building.description && <p className="text-sm leading-7 text-gray-700">{building.description}</p>}
            <dl className="grid grid-cols-2 gap-3 text-sm">
              <div className="flex items-center gap-2"><Layers className="size-4 text-gray-500" aria-hidden /><div><dt className="text-xs text-gray-500">طبقات</dt><dd>{toPersianDigits(floors.length)}</dd></div></div>
              <div className="flex items-center gap-2"><DoorOpen className="size-4 text-gray-500" aria-hidden /><div><dt className="text-xs text-gray-500">اتاق‌ها</dt><dd>{toPersianDigits(roomCount)}</dd></div></div>
            </dl>
            <ButtonLink href={`/buildings/${building.slug}`} size="lg" className="w-full">
              ورود به ساختمان و نقشه داخلی
            </ButtonLink>
          </section>
        ) : (
          <p className="rounded-xl bg-gray-100 p-3 text-sm leading-7 text-gray-700">
            هنوز ساختمانی انتخاب نشده است. روی ساختمان آبی‌تیره کلیک کنید. ساختمان‌های خاکستری فعلاً مدل‌سازی نشده‌اند.
          </p>
        )}
      </aside>

      <div className="relative order-1 h-[58dvh] min-h-0 md:order-2 md:h-auto md:flex-1">
        <DynamicCampusViewer
          campus={campus}
          selectedSlug={selected}
          hoveredSlug={hovered}
          onHover={setHovered}
          onSelect={setSelected}
          cameraCommand={viewer.cameraCommand}
        />
        <div className="absolute end-3 top-3 z-20 flex flex-col gap-2">
          <IconButton label="بزرگ‌نمایی" onClick={() => dispatch({ type: "zoomCamera", factor: 1.3 })} className="shadow-float"><Plus className="size-5" /></IconButton>
          <IconButton label="کوچک‌نمایی" onClick={() => dispatch({ type: "zoomCamera", factor: 1 / 1.3 })} className="shadow-float"><Minus className="size-5" /></IconButton>
          <IconButton label="بازنشانی دوربین" onClick={() => dispatch({ type: "resetCamera" })} className="shadow-float"><RotateCcw className="size-5" /></IconButton>
        </div>
        <div className="pointer-events-none absolute bottom-3 start-3 z-10"><DemoBadge /></div>
      </div>
    </main>
  );
}
