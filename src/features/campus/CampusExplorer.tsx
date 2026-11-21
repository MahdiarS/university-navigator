"use client";
import { Building2, Layers, Minus, Plus, RotateCcw, Ruler } from "lucide-react";
import { useReducer, useState } from "react";
import { DynamicCampusViewer } from "@/components/3d/DynamicCampusViewer";
import { useNavigator } from "@/components/DataProvider";
import { DemoBadge } from "@/components/ui/Badge";
import { ButtonLink, IconButton } from "@/components/ui/Button";
import { toPersianDigits } from "@/lib/search/normalize";
import { campusKey, findCampusBuilding, footprintArea } from "@/lib/model/campus";
import { initialViewerState, viewerReducer } from "@/lib/model/viewerState";
import { cn } from "@/lib/utils/cn";

/**
 * /campus — interactive 3D campus built from the supplied site plan. Selecting a building shows what the owner told
 * us about it. Indoor maps exist only for buildings that have a model; the fictional demo building is offered
 * separately and clearly labelled, never presented as one of the real buildings.
 */
export function CampusExplorer() {
  const { data, lookups } = useNavigator();
  const campus = data.manifest.campus;
  const [selected, setSelected] = useState<string | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);
  const [viewer, dispatch] = useReducer(viewerReducer, initialViewerState);

  const entry = findCampusBuilding(campus, selected);
  const indoor = entry?.slug ? lookups.buildingsBySlug.get(entry.slug) : undefined;
  const selectable = campus.buildings
    .filter((b) => b.clickable)
    .sort((a, b) => (a.number ?? 999) - (b.number ?? 999));
  const demoBuilding = data.buildings.find((b) => b.isDemo && b.isActive);

  return (
    <main className="relative flex min-h-0 flex-1 flex-col md:flex-row" aria-label="نقشه سه‌بعدی پردیس">
      <aside className="un-scroll order-2 flex shrink-0 flex-col gap-4 overflow-y-auto border-t border-gray-200 bg-white p-4 md:order-1 md:w-[380px] md:border-e md:border-t-0">
        <div>
          <h1 className="text-lg font-bold">پردیس دانشگاه</h1>
          <p className="mt-1 text-sm leading-7 text-gray-500">ساختمان را روی نقشه یا از فهرست زیر انتخاب کنید.</p>
          {campus.isDemo && <DemoBadge className="mt-2" />}
        </div>

        <ul className="space-y-2" aria-label="ساختمان‌ها">
          {selectable.map((b) => {
            const key = campusKey(b);
            return (
              <li key={key}>
                <button
                  type="button"
                  aria-pressed={selected === key}
                  onClick={() => setSelected(key)}
                  onMouseEnter={() => setHovered(key)}
                  onMouseLeave={() => setHovered(null)}
                  className={cn(
                    "flex min-h-14 w-full items-center gap-3 rounded-xl border px-3 text-start transition-colors",
                    selected === key ? "border-orange-500 bg-orange-100" : "border-gray-200 hover:bg-gray-50",
                  )}
                >
                  <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-navy-800 text-sm font-bold text-white">
                    {b.number ? toPersianDigits(b.number) : <Building2 className="size-4" aria-hidden />}
                  </span>
                  <span className="text-[15px] font-medium">{b.name ?? b.label}</span>
                </button>
              </li>
            );
          })}
        </ul>

        {entry ? (
          <section aria-label="ساختمان انتخاب‌شده" className="space-y-3 rounded-xl border border-gray-200 p-4">
            <h2 className="text-base font-bold">{entry.label}</h2>
            {entry.description && <p className="text-sm leading-7 text-gray-700">{entry.description}</p>}
            <dl className="grid grid-cols-2 gap-3 text-sm">
              <div className="flex items-center gap-2">
                <Layers className="size-4 text-gray-500" aria-hidden />
                <div>
                  <dt className="text-xs text-gray-500">تعداد طبقات</dt>
                  <dd>{entry.floors ? toPersianDigits(entry.floors) : "ثبت نشده"}</dd>
                </div>
              </div>
              {entry.kind !== "marker" && (
                <div className="flex items-center gap-2">
                  <Ruler className="size-4 text-gray-500" aria-hidden />
                  <div>
                    <dt className="text-xs text-gray-500">مساحت بنا (از نقشه)</dt>
                    <dd>{entry.footprint ? `${toPersianDigits(Math.round(footprintArea(entry.footprint)))} متر مربع` : "ثبت نشده"}</dd>
                  </div>
                </div>
              )}
            </dl>
            {entry.kind === "marker" && (
              <p className="text-xs leading-6 text-gray-500">در نقشهٔ CAD برای این ساختمان خط پیرامونی بسته‌ای وجود ندارد؛ فقط محل آن با پین مشخص شده است.</p>
            )}
            {indoor ? (
              <ButtonLink href={`/buildings/${indoor.slug}`} size="lg" className="w-full">
                ورود به ساختمان و نقشه داخلی
              </ButtonLink>
            ) : (
              <p className="rounded-lg bg-gray-100 p-3 text-sm leading-7 text-gray-700">نقشهٔ داخلی این ساختمان هنوز ثبت نشده است. پس از دریافت پلان طبقات اضافه می‌شود.</p>
            )}
          </section>
        ) : (
          <p className="rounded-xl bg-gray-100 p-3 text-sm leading-7 text-gray-700">هنوز ساختمانی انتخاب نشده است. روی ساختمان یا شمارهٔ آن کلیک کنید.</p>
        )}

        {campus.source && <p className="text-xs leading-6 text-gray-500">{campus.source.note}</p>}

        {demoBuilding && (
          <section aria-label="ساختمان نمونهٔ آزمایشی" className="space-y-2 rounded-xl border border-dashed border-gray-300 p-4">
            <h2 className="flex flex-wrap items-center gap-2 text-sm font-bold">
              {demoBuilding.name}
              <DemoBadge />
            </h2>
            <p className="text-xs leading-6 text-gray-500">ساختمانی فرضی برای نمایش امکانات نقشهٔ داخلی و مسیریابی. با ساختمان‌های واقعی بالا ارتباطی ندارد.</p>
            <ButtonLink href={`/buildings/${demoBuilding.slug}`} variant="secondary" className="w-full">
              مشاهدهٔ نمونهٔ نقشهٔ داخلی (دمو)
            </ButtonLink>
          </section>
        )}
      </aside>

      <div className="relative order-1 h-[58dvh] min-h-0 md:order-2 md:h-auto md:flex-1">
        <DynamicCampusViewer
          campus={campus}
          selectedKey={selected}
          hoveredKey={hovered}
          onHover={setHovered}
          onSelect={setSelected}
          cameraCommand={viewer.cameraCommand}
        />
        <div className="absolute end-3 top-3 z-20 flex flex-col gap-2">
          <IconButton label="بزرگ‌نمایی" onClick={() => dispatch({ type: "zoomCamera", factor: 1.3 })} className="shadow-float"><Plus className="size-5" /></IconButton>
          <IconButton label="کوچک‌نمایی" onClick={() => dispatch({ type: "zoomCamera", factor: 1 / 1.3 })} className="shadow-float"><Minus className="size-5" /></IconButton>
          <IconButton label="بازنشانی دوربین" onClick={() => dispatch({ type: "resetCamera" })} className="shadow-float"><RotateCcw className="size-5" /></IconButton>
        </div>
        {campus.isDemo && <div className="pointer-events-none absolute bottom-3 start-3 z-10"><DemoBadge /></div>}
      </div>
    </main>
  );
}
