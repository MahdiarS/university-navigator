"use client";
import {
  Building2,
  ChevronsUp,
  DoorOpen,
  Flag,
  Footprints,
  Layers,
  MapPin,
  Minus,
  MoveHorizontal,
  Plus,
  RotateCcw,
  Ruler,
} from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useReducer, useState } from "react";
import type { CampusInteriorProps } from "@/components/3d/CampusInterior";
import { DynamicCampusViewer } from "@/components/3d/DynamicCampusViewer";
import { useNavigator } from "@/components/DataProvider";
import { ResultList } from "@/components/search/ResultList";
import { SearchBox } from "@/components/search/SearchBox";
import { IconButton } from "@/components/ui/Button";
import { RoomDetails } from "@/features/rooms/RoomDetails";
import { campusKey, findCampusBuilding, footprintArea } from "@/lib/model/campus";
import {
  campusEntrances,
  describeCampusRoute,
  entranceName,
  formatWalkMeters,
  formatWalkTime,
  nearestEntrance,
  routeFailureText,
  routeFromEntrance,
} from "@/lib/model/campus-nav";
import { journeyFailureText, planJourney, type JourneyStepKind } from "@/lib/model/journey";
import { roomTitle } from "@/lib/model/places";
import { initialViewerState, viewerReducer } from "@/lib/model/viewerState";
import { search } from "@/lib/search/engine";
import { toPersianDigits } from "@/lib/search/normalize";
import { cn } from "@/lib/utils/cn";

const STEP_ICON: Record<JourneyStepKind, typeof Footprints> = {
  start: MapPin,
  walk: Footprints,
  enter: DoorOpen,
  stairs: ChevronsUp,
  bridge: MoveHorizontal,
  arrive: Flag,
};

/**
 * /campus — the single map of the university: the 3D campus from the site plan, the first floors of the buildings that
 * have an indoor map (1, 2, 3) with the sky bridges between them, search for rooms and people, and one continuous
 * route from the university gate, across the yard, into the building and on to the room.
 *
 * Deep links: ?room=<room id> | ?dept=<department slug> | ?building=<building slug or id>
 */
export function CampusExplorer() {
  const params = useSearchParams();
  // a different query string is a different deep link: start from a clean state
  return (
    <CampusExplorerInner
      key={params.toString()}
      roomParam={params.get("room")}
      deptParam={params.get("dept")}
      buildingParam={params.get("building")}
    />
  );
}

function CampusExplorerInner({
  roomParam,
  deptParam,
  buildingParam,
}: {
  roomParam: string | null;
  deptParam: string | null;
  buildingParam: string | null;
}) {
  const { data, lookups, graph, searchIndex } = useNavigator();
  const campus = data.manifest.campus;
  const interiors = data.manifest.interiors;

  const initialRoomId = roomParam ?? (deptParam ? (lookups.departmentsBySlug.get(deptParam)?.roomId ?? null) : null);
  const buildingOfRoom = (roomId: string | null): string | null => {
    const room = roomId ? lookups.roomsById.get(roomId) : undefined;
    return room ? (lookups.floorsById.get(room.floorId)?.buildingId ?? null) : null;
  };
  const initialBuilding =
    buildingOfRoom(initialRoomId) ??
    (buildingParam ? (lookups.buildingsBySlug.get(buildingParam)?.id ?? lookups.buildingsById.get(buildingParam)?.id ?? null) : null);

  const [selected, setSelected] = useState<string | null>(initialBuilding);
  const [roomId, setRoomId] = useState<string | null>(initialRoomId && lookups.roomsById.has(initialRoomId) ? initialRoomId : null);
  const [hovered, setHovered] = useState<string | null>(null);
  const [hoveredRoom, setHoveredRoom] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [showInterior, setShowInterior] = useState(false);
  const [pickedGate, setPickedGate] = useState<string | null>(null);
  const [viewer, dispatch] = useReducer(viewerReducer, initialViewerState);

  const gates = campusEntrances(campus);
  const entry = findCampusBuilding(campus, selected);
  const room = roomId ? (lookups.roomsById.get(roomId) ?? null) : null;
  const selectable = useMemo(
    () => campus.buildings.filter((b) => b.clickable).sort((a, b) => (a.number ?? 999) - (b.number ?? 999)),
    [campus.buildings],
  );
  const interiorBuildingIds = interiors.floors.map((f) => f.buildingId);

  const selectBuilding = (key: string) => {
    setSelected(key);
    setRoomId(null);
    setPickedGate(null);
  };
  const selectRoom = (id: string) => {
    setRoomId(id);
    setSelected(buildingOfRoom(id));
    setQuery("");
  };

  // ------------------------------------------------------------------ routes
  const gateId = useMemo(() => {
    if (pickedGate) return pickedGate;
    if (selected) return (!room && nearestEntrance(campus, selected)?.entranceId) || gates[0]?.id || null;
    return gates[0]?.id ?? null;
  }, [campus, selected, room, pickedGate, gates]);

  const journey = useMemo(
    () => (room && gateId ? planJourney(data, lookups, graph, campus, gateId, room.id) : null),
    [data, lookups, graph, campus, gateId, room],
  );
  const buildingQuery = useMemo(
    () => (!room && selected && gateId ? routeFromEntrance(campus, gateId, selected) : null),
    [campus, selected, gateId, room],
  );
  const outdoor = journey?.status === "ok" ? journey.outdoor : buildingQuery?.status === "ok" ? buildingQuery.route : null;
  const buildingSteps = buildingQuery?.status === "ok" ? describeCampusRoute(campus, buildingQuery) : [];
  const okJourney = journey?.status === "ok" ? journey : null;

  // frame the whole walk whenever the route changes
  useEffect(() => {
    const pts: { x: number; y: number; z: number }[] = [];
    if (outdoor) pts.push(...outdoor.points.map((p) => ({ x: p.x, y: 0, z: p.z })));
    if (okJourney) pts.push(...okJourney.indoorPoints);
    // the selected building is part of the picture too (a route only reaches its door)
    if (entry?.footprint) pts.push(...entry.footprint.map((p) => ({ x: p.x, y: 0, z: p.z })));
    if (pts.length === 0) return;
    const xs = pts.map((p) => p.x);
    const zs = pts.map((p) => p.z);
    dispatch({
      type: "focusCamera",
      bounds: {
        min: { x: Math.min(...xs) - 16, y: 0, z: Math.min(...zs) - 16 },
        max: { x: Math.max(...xs) + 16, y: 8, z: Math.max(...zs) + 16 },
      },
    });
  }, [outdoor, okJourney, entry]);

  // a building without a route (no entrance data) is framed on its own
  useEffect(() => {
    if (outdoor || !entry?.footprint?.length) return;
    const xs = entry.footprint.map((p) => p.x);
    const zs = entry.footprint.map((p) => p.z);
    dispatch({
      type: "focusCamera",
      bounds: {
        min: { x: Math.min(...xs) - 10, y: 0, z: Math.min(...zs) - 10 },
        max: { x: Math.max(...xs) + 10, y: 8, z: Math.max(...zs) + 10 },
      },
    });
  }, [entry, outdoor]);

  // ------------------------------------------------------------------ search
  const hits = useMemo(() => search(searchIndex, query, { limit: 40 }), [searchIndex, query]);
  const entryId = entry?.id ?? null;
  const entryHasMap = entryId !== null && interiors.floors.some((f) => f.buildingId === entryId);
  const buildingRooms = entryId && entryHasMap ? search(searchIndex, "", { buildingId: entryId, limit: 200 }) : [];

  // ------------------------------------------------------------------ scene data
  const openIds = useMemo(() => {
    if (showInterior) return new Set(interiorBuildingIds);
    const ids = new Set<string>();
    if (selected && interiorBuildingIds.includes(selected)) ids.add(selected);
    for (const b of okJourney?.buildingIds ?? []) if (interiorBuildingIds.includes(b)) ids.add(b);
    return ids;
  }, [showInterior, interiorBuildingIds, selected, okJourney]);
  // Room numbers of a whole building are only written out while browsing that one building: three buildings of
  // labels at the zoom of a whole-campus walk would overlap. With a route, the destination (and the hovered room) is labelled.
  const labelIds = useMemo(
    () => (!room && !showInterior && selected && openIds.has(selected) ? new Set([selected]) : new Set<string>()),
    [room, showInterior, selected, openIds],
  );
  const doorPoints = useMemo(() => data.nodes.filter((n) => n.type === "room-door").map((n) => ({ x: n.x, z: n.z })), [data.nodes]);
  const labels = useMemo(() => {
    const floorIds = new Set(interiors.floors.map((f) => f.floorId));
    return data.rooms
      .filter((r) => floorIds.has(r.floorId))
      .map((r) => {
        const base =
          r.roomType === "office" || r.roomType === "classroom" || r.roomType === "lab" || r.roomType === "meeting"
            ? toPersianDigits(r.roomNumber)
            : r.name.replace(/^لابی و /, "");
        const full = r.id === roomId || r.id === hoveredRoom ? `${toPersianDigits(r.roomNumber)} · ${roomTitle(r, lookups)}` : base;
        return { roomId: r.id, x: r.positionX, z: r.positionZ, text: full };
      });
  }, [data.rooms, interiors.floors, lookups, roomId, hoveredRoom]);

  const interior: CampusInteriorProps = {
    interiors,
    openBuildingIds: openIds,
    labelBuildingIds: labelIds,
    doors: doorPoints,
    labels,
    selectedRoomId: roomId,
    destinationRoomId: roomId,
    hoveredRoomId: hoveredRoom,
    onHoverRoom: setHoveredRoom,
    onSelectRoom: selectRoom,
    route: okJourney ? okJourney.indoorPoints : null,
  };

  return (
    <main className="relative flex min-h-0 flex-1 flex-col md:flex-row" aria-label="نقشه سه‌بعدی پردیس">
      <aside className="un-scroll order-2 flex shrink-0 flex-col gap-4 overflow-y-auto border-t border-gray-200 bg-white p-4 md:order-1 md:w-[400px] md:border-e md:border-t-0">
        <div className="space-y-3">
          <div>
            <h1 className="text-lg font-bold">پردیس و ساختمان‌ها</h1>
            <p className="mt-1 text-sm leading-7 text-gray-500">اتاق یا استاد را جستجو کنید، یا ساختمان را روی نقشه انتخاب کنید.</p>
          </div>
          <SearchBox value={query} onChange={setQuery} placeholder="جستجوی استاد، شماره اتاق یا ساختمان…" />
        </div>

        {query.trim() ? (
          <section aria-label="نتایج جستجو">
            <h2 className="mb-2 px-1 text-sm font-bold">نتایج جستجو ({toPersianDigits(hits.length)})</h2>
            <ResultList hits={hits} onSelect={(hit) => selectRoom(hit.room.id)} />
          </section>
        ) : (
          <>
            {room && (
              <RoomDetails
                room={room}
                onClose={() => {
                  setRoomId(null);
                }}
              />
            )}

            {okJourney && (
              <section aria-label="مسیر از درب دانشگاه تا اتاق" className="space-y-3 rounded-xl border border-gray-200 p-4">
                <h2 className="flex items-center gap-2 text-base font-bold">
                  <Footprints className="size-5 text-blue-600" aria-hidden />
                  مسیر از {entranceName(campus, okJourney.gateId)} تا اتاق {toPersianDigits(okJourney.room.roomNumber)}
                </h2>
                {gates.length > 1 && (
                  <div role="group" aria-label="انتخاب ورودی" className="flex flex-wrap gap-2">
                    {gates.map((g) => (
                      <button
                        key={g.id}
                        type="button"
                        aria-pressed={gateId === g.id}
                        onClick={() => setPickedGate(g.id)}
                        className={cn(
                          "flex min-h-11 items-center gap-1.5 rounded-full border px-3 text-sm",
                          gateId === g.id ? "border-teal-600 bg-teal-600 text-white" : "border-gray-200 hover:bg-gray-50",
                        )}
                      >
                        <DoorOpen className="size-4" aria-hidden />
                        {entranceName(campus, g.id)}
                      </button>
                    ))}
                  </div>
                )}
                <p className="text-sm font-medium" data-testid="journey-summary">
                  {formatWalkMeters(okJourney.totalMeters)} · {formatWalkTime(okJourney.durationSec)}
                  <span className="block text-xs font-normal text-gray-500">
                    {formatWalkMeters(okJourney.outdoorMeters)} در حیاط و {formatWalkMeters(okJourney.indoorMeters)} داخل ساختمان
                    {okJourney.usesBridge ? " (با عبور از پل هوایی)" : ""}
                  </span>
                </p>
                <ol className="space-y-2 text-sm leading-7" data-testid="journey-steps">
                  {okJourney.steps.map((st, i) => {
                    const Icon = STEP_ICON[st.kind];
                    return (
                      <li key={i} className="flex gap-2">
                        <span
                          className={cn(
                            "mt-1 grid size-6 shrink-0 place-items-center rounded-full text-white",
                            st.kind === "arrive" ? "bg-orange-500" : st.scope === "outdoor" ? "bg-blue-600" : "bg-teal-600",
                          )}
                          aria-hidden
                        >
                          <Icon className="size-3.5" />
                        </span>
                        <span>{st.text}</span>
                      </li>
                    );
                  })}
                </ol>
                <p className="text-xs leading-6 text-gray-500">
                  مسیر داخل حیاط تقریبی است (پیاده‌رو در نقشه مشخص نیست). چیدمان داخلی ساختمان‌ها بر پایهٔ نقشه‌های دست‌نویس طراحی شده و دقیق
                  نیست.
                </p>
              </section>
            )}
            {journey && journey.status !== "ok" && (
              <p className="rounded-lg bg-gray-100 p-3 text-sm leading-7 text-gray-700">{journeyFailureText(journey.status)}</p>
            )}

            {!room && (
              <ul className="space-y-2" aria-label="ساختمان‌ها">
                {selectable.map((b) => {
                  const key = campusKey(b);
                  const hasMap = !!b.id && interiorBuildingIds.includes(b.id);
                  return (
                    <li key={key}>
                      <button
                        type="button"
                        aria-pressed={selected === key}
                        onClick={() => selectBuilding(key)}
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
                        <span className="min-w-0 flex-1 text-[15px] font-medium">{b.name ?? b.label}</span>
                        {hasMap && <span className="shrink-0 rounded-full bg-teal-100 px-2 py-0.5 text-xs text-teal-600">نقشهٔ داخلی</span>}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}

            {entry && !room && (
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
                  <p className="text-xs leading-6 text-gray-500">
                    در نقشهٔ CAD برای این شماره خط پیرامونی بسته‌ای وجود ندارد؛ فقط محل آن با پین مشخص شده است.
                  </p>
                )}
                {!entry.doors?.length && entry.clickable && entry.id && !interiorBuildingIds.includes(entry.id) && (
                  <p className="text-xs leading-6 text-gray-500">درِ این ساختمان در نقشه علامت‌گذاری نشده؛ مسیر تا نزدیک‌ترین ضلع می‌رود.</p>
                )}
                {entry.id && interiorBuildingIds.includes(entry.id) ? (
                  <>
                    {!entry.doors?.length && (
                      <p className="rounded-lg bg-gray-100 p-3 text-sm leading-7 text-gray-700">
                        این ساختمان درِ مستقیم از حیاط ندارد؛ از طریق پل هوایی به ساختمان‌های دیگر وصل است.
                      </p>
                    )}
                    <h3 className="text-sm font-bold">اتاق‌های طبقهٔ اول ({toPersianDigits(buildingRooms.length)})</h3>
                    <div className="un-scroll max-h-72 overflow-y-auto rounded-lg border border-gray-100">
                      <ResultList hits={buildingRooms} onSelect={(hit) => selectRoom(hit.room.id)} />
                    </div>
                  </>
                ) : (
                  entry.clickable && (
                    <p className="rounded-lg bg-gray-100 p-3 text-sm leading-7 text-gray-700">نقشهٔ داخلی این ساختمان هنوز ثبت نشده است.</p>
                  )
                )}
              </section>
            )}

            {!room && !entry && (
              <p className="rounded-xl bg-gray-100 p-3 text-sm leading-7 text-gray-700">
                هنوز ساختمانی انتخاب نشده است. روی ساختمان یا شمارهٔ آن کلیک کنید.
              </p>
            )}

            {!room && entry?.clickable && (
              <section aria-label="مسیر پیاده از ورودی دانشگاه" className="space-y-3 rounded-xl border border-gray-200 p-4">
                <h2 className="flex items-center gap-2 text-base font-bold">
                  <Footprints className="size-5 text-blue-600" aria-hidden />
                  مسیر از ورودی دانشگاه
                </h2>
                {buildingQuery && buildingQuery.status !== "ok" && (
                  <p className="rounded-lg bg-gray-100 p-3 text-sm leading-7 text-gray-700">{routeFailureText(buildingQuery.status)}</p>
                )}
                {outdoor && (
                  <>
                    <p className="text-sm font-medium" data-testid="campus-route-summary">
                      {formatWalkMeters(outdoor.length)} · {formatWalkTime(outdoor.durationSec)}
                    </p>
                    <ol className="space-y-2 text-sm leading-7" data-testid="campus-route-steps">
                      {buildingSteps.map((st, i) => (
                        <li key={i} className="flex gap-2">
                          <span
                            className={cn(
                              "mt-1.5 size-2.5 shrink-0 rounded-full",
                              st.kind === "start" ? "bg-teal-600" : st.kind === "arrive" ? "bg-orange-500" : "bg-blue-600",
                            )}
                            aria-hidden
                          />
                          <span>{st.text}</span>
                        </li>
                      ))}
                    </ol>
                    <p className="text-xs leading-6 text-gray-500">
                      مسیر تقریبی است: پیاده‌رو در نقشهٔ CAD مشخص نیست و فرض شده از روی محوطهٔ باز و با فاصله از ساختمان‌ها راه می‌روید.
                    </p>
                  </>
                )}
              </section>
            )}

            {campus.source && <p className="text-xs leading-6 text-gray-500">{campus.source.note}</p>}
          </>
        )}
      </aside>

      <div className="relative order-1 h-[58dvh] min-h-0 md:order-2 md:h-auto md:flex-1">
        <DynamicCampusViewer
          campus={campus}
          selectedKey={selected}
          hoveredKey={hovered}
          onHover={setHovered}
          onSelect={selectBuilding}
          route={outdoor ? { points: outdoor.points } : null}
          routeStartId={outdoor ? gateId : null}
          interior={interior}
          cameraCommand={viewer.cameraCommand}
        />
        <div className="absolute end-3 top-3 z-20 flex flex-col gap-2">
          <IconButton label="بزرگ‌نمایی" onClick={() => dispatch({ type: "zoomCamera", factor: 1.3 })} className="shadow-float">
            <Plus className="size-5" />
          </IconButton>
          <IconButton label="کوچک‌نمایی" onClick={() => dispatch({ type: "zoomCamera", factor: 1 / 1.3 })} className="shadow-float">
            <Minus className="size-5" />
          </IconButton>
          <IconButton label="بازنشانی دوربین" onClick={() => dispatch({ type: "resetCamera" })} className="shadow-float">
            <RotateCcw className="size-5" />
          </IconButton>
          <IconButton
            label="نمای داخلی طبقهٔ اول ساختمان‌های ۱ تا ۳"
            active={showInterior}
            onClick={() => setShowInterior((v) => !v)}
            className="shadow-float"
          >
            <Layers className="size-5" />
          </IconButton>
        </div>
      </div>
    </main>
  );
}
