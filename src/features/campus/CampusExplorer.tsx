"use client";
import { Building2, DoorOpen, Footprints, Layers, Minus, Plus, RotateCcw, Ruler } from "lucide-react";
import { useEffect, useMemo, useReducer, useState } from "react";
import { DynamicCampusViewer } from "@/components/3d/DynamicCampusViewer";
import { useNavigator } from "@/components/DataProvider";
import { DemoBadge } from "@/components/ui/Badge";
import { ButtonLink, IconButton } from "@/components/ui/Button";
import { toPersianDigits } from "@/lib/search/normalize";
import { campusKey, findCampusBuilding, footprintArea } from "@/lib/model/campus";
import { campusEntrances, describeCampusRoute, entranceName, formatWalkMeters, formatWalkTime, nearestEntrance, routeFailureText, routeFromEntrance } from "@/lib/model/campus-nav";
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

  const [pickedEntrance, setPickedEntrance] = useState<string | null>(null);

  const select = (key: string) => {
    setSelected(key);
    setPickedEntrance(null);
  };

  const entry = findCampusBuilding(campus, selected);
  const indoor = entry?.slug ? lookups.buildingsBySlug.get(entry.slug) : undefined;
  const selectable = campus.buildings
    .filter((b) => b.clickable)
    .sort((a, b) => (a.number ?? 999) - (b.number ?? 999));
  const entrances = campusEntrances(campus);
  // the entrance chosen by the user, else the one with the shortest walk to the selected building
  const activeEntrance = useMemo(() => {
    if (!selected) return null;
    return pickedEntrance ?? nearestEntrance(campus, selected)?.entranceId ?? entrances[0]?.id ?? null;
  }, [campus, selected, pickedEntrance, entrances]);
  const routeQuery = useMemo(() => (selected && activeEntrance ? routeFromEntrance(campus, activeEntrance, selected) : null), [campus, selected, activeEntrance]);
  const route = routeQuery?.status === "ok" ? routeQuery.route : null;
  const steps = routeQuery?.status === "ok" ? describeCampusRoute(campus, routeQuery) : [];

  // frame the whole walk (entrance -> building) whenever the route changes
  useEffect(() => {
    if (!route) return;
    const xs = route.points.map((p) => p.x);
    const zs = route.points.map((p) => p.z);
    dispatch({ type: "focusCamera", bounds: { min: { x: Math.min(...xs) - 15, y: 0, z: Math.min(...zs) - 15 }, max: { x: Math.max(...xs) + 15, y: 8, z: Math.max(...zs) + 15 } } });
  }, [route]);
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
                  onClick={() => select(key)}
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

        {entry?.clickable && (
          <section aria-label="مسیر پیاده از ورودی دانشگاه" className="space-y-3 rounded-xl border border-gray-200 p-4">
            <h2 className="flex items-center gap-2 text-base font-bold">
              <Footprints className="size-5 text-blue-600" aria-hidden />
              مسیر از ورودی دانشگاه
            </h2>
            {entrances.length > 1 && (
              <div role="group" aria-label="انتخاب ورودی" className="flex flex-wrap gap-2">
                {entrances.map((e) => (
                  <button
                    key={e.id}
                    type="button"
                    aria-pressed={activeEntrance === e.id}
                    onClick={() => setPickedEntrance(e.id)}
                    className={cn(
                      "flex min-h-11 items-center gap-1.5 rounded-full border px-3 text-sm transition-colors",
                      activeEntrance === e.id ? "border-teal-600 bg-teal-600 text-white" : "border-gray-200 hover:bg-gray-50",
                    )}
                  >
                    <DoorOpen className="size-4" aria-hidden />
                    {entranceName(campus, e.id)}
                  </button>
                ))}
              </div>
            )}
            {routeQuery && routeQuery.status !== "ok" && <p className="rounded-lg bg-gray-100 p-3 text-sm leading-7 text-gray-700">{routeFailureText(routeQuery.status)}</p>}
            {route && (
              <>
                <p className="text-sm font-medium" data-testid="campus-route-summary">
                  {formatWalkMeters(route.length)} · {formatWalkTime(route.durationSec)}
                </p>
                <ol className="space-y-2 text-sm leading-7" data-testid="campus-route-steps">
                  {steps.map((st, i) => (
                    <li key={i} className="flex gap-2">
                      <span className={cn("mt-1.5 size-2.5 shrink-0 rounded-full", st.kind === "start" ? "bg-teal-600" : st.kind === "arrive" ? "bg-orange-500" : "bg-blue-600")} aria-hidden />
                      <span>{st.text}</span>
                    </li>
                  ))}
                </ol>
                <p className="text-xs leading-6 text-gray-500">
                  مسیر تقریبی است: در نقشهٔ CAD پیاده‌رو و درِ ساختمان‌ها مشخص نیست؛ فرض شده از روی محوطهٔ باز و با فاصله از ساختمان‌ها راه می‌روید و به نزدیک‌ترین ضلع ساختمان می‌رسید.
                </p>
              </>
            )}
          </section>
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
          onSelect={select}
          route={route ? { points: route.points } : null}
          routeStartId={route ? activeEntrance : null}
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
