"use client";
import { Building2, SlidersHorizontal } from "lucide-react";
import dynamic from "next/dynamic";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { useNavigator } from "@/components/DataProvider";
import { NavigationPanel } from "@/components/navigation/NavigationPanel";
import { ResultList } from "@/components/search/ResultList";
import { SearchBox } from "@/components/search/SearchBox";
import { DemoBadge } from "@/components/ui/Badge";
import { BottomSheet, type SheetSnap } from "@/components/ui/BottomSheet";
import { Button, ButtonLink, IconButton } from "@/components/ui/Button";
import { Spinner } from "@/components/ui/Spinner";
import { FloorControls } from "@/features/floors/FloorControls";
import { RoomDetails } from "@/features/rooms/RoomDetails";
import { useIsDesktop } from "@/hooks/useMediaQuery";
import { formatMeters } from "@/lib/navigation";
import { toPersianDigits } from "@/lib/search/normalize";
import { roomTitle } from "./places";
import { useExplorer, type Explorer, type ExplorerInitial } from "./useExplorer";
import { CameraTools, ViewSettings } from "./ViewControls";

/** The 3D canvas is loaded on demand (client only): the rest of the page works while it downloads. */
const BuildingViewer = dynamic(() => import("@/components/3d/BuildingViewer"), {
  ssr: false,
  loading: () => (
    <div className="un-viewer-bg grid size-full place-items-center" role="status">
      <span className="flex items-center gap-2 text-sm text-gray-500">
        <Spinner /> در حال بارگذاری نمایشگر سه‌بعدی…
      </span>
    </div>
  ),
});

function Unavailable({ message }: { message: string }) {
  return (
    <main className="mx-auto flex w-full max-w-xl flex-1 flex-col items-center justify-center gap-4 px-4 py-20 text-center">
      <span className="grid size-14 place-items-center rounded-2xl bg-gray-100 text-gray-500">
        <Building2 className="size-7" aria-hidden />
      </span>
      <p className="text-sm text-gray-700">{message}</p>
      <ButtonLink href="/search" variant="primary">
        جستجوی دفاتر و خدمات
      </ButtonLink>
    </main>
  );
}

/**
 * /buildings/[slug]. URL parameters make every search result and department page deep-linkable:
 *   ?room=<roomId>  or  ?dept=<department slug>   select + highlight (and isolate its floor)
 *   &navigate=1                                    open route planning with that destination
 *   &from=<navigation node id>                     pre-select the start point
 */
export function BuildingExplorer({ slug }: { slug: string }) {
  const params = useSearchParams();
  const { lookups, data } = useNavigator();
  const building = lookups.buildingsBySlug.get(slug);
  const model = building ? data.manifest.buildings.find((b) => b.buildingId === building.id) : undefined;

  if (!building || !building.isActive) return <Unavailable message="این ساختمان پیدا نشد یا غیرفعال است." />;
  if (!model) return <Unavailable message="برای این ساختمان هنوز مدل سه‌بعدی ثبت نشده است. می‌توانید از جستجو برای یافتن واحدها استفاده کنید." />;

  const dept = params.get("dept");
  const deptRoom = dept ? lookups.departmentsBySlug.get(dept)?.roomId : null;
  const initial: ExplorerInitial = {
    roomId: params.get("room") ?? deptRoom ?? null,
    navigate: params.get("navigate") === "1",
    startNodeId: params.get("from"),
  };
  // A different query string means a different deep link: start from a clean viewer state.
  return <ExplorerShell key={params.toString()} building={building} model={model} initial={initial} />;
}

function ExplorerShell({
  building,
  model,
  initial,
}: {
  building: Parameters<typeof useExplorer>[0];
  model: Parameters<typeof useExplorer>[1];
  initial: ExplorerInitial;
}) {
  const x = useExplorer(building, model, initial);
  const isDesktop = useIsDesktop();
  const [snap, setSnap] = useState<SheetSnap>(initial.roomId ? "half" : "peek");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const { viewer, dispatch } = x;

  const panel = <PanelContent x={x} onOpen={() => setSnap((s) => (s === "peek" ? "half" : s))} />;

  return (
    <main className="relative flex min-h-0 flex-1 flex-col md:flex-row" aria-label={`نمایشگر سه‌بعدی ${building.name}`}>
      {isDesktop && (
        <aside className="un-scroll flex w-[400px] shrink-0 flex-col gap-4 overflow-y-auto border-e border-gray-200 bg-white p-4">
          <div>
            <p className="flex items-center gap-2 text-xs text-gray-500">
              <Building2 className="size-3.5" aria-hidden />
              {building.name}
              {building.isDemo && <DemoBadge />}
            </p>
          </div>
          <SearchBox value={x.query} onChange={x.setQuery} />
          {panel}
        </aside>
      )}

      <div className="relative min-h-0 flex-1">
        <BuildingViewer
          floors={x.floors}
          rooms={x.rooms}
          model={x.model}
          viewer={viewer}
          roomStates={x.roomStates}
          labelRoomIds={x.labelRoomIds}
          roomLabel={x.roomLabel}
          entranceLabel={x.entranceOption?.label}
          route={x.routeGeometry}
          startPin={x.startPin}
          destinationPin={x.destinationPin}
          cutaway={x.cutaway}
          onHoverRoom={(id) => dispatch({ type: "hoverRoom", roomId: id })}
          onSelectRoom={(id) => {
            x.selectRoomFromMap(id);
            setSnap("half");
          }}
          onClearSelection={x.clearFocus}
          onModelIssue={(m) => {
            console.warn("[3d]", m);
            x.setModelNotice("مدل واقعی این ساختمان بارگذاری نشد؛ مدل نمایشی (دمو) نمایش داده می‌شود.");
          }}
        />

        {/* floors */}
        <div className="absolute start-3 top-20 z-20 md:top-1/2 md:-translate-y-1/2">
          <FloorControls
            floors={x.floors}
            activeFloorId={viewer.activeFloorId}
            otherFloors={viewer.otherFloors}
            onSelect={(id) => dispatch({ type: "selectFloor", floorId: id })}
            onOtherFloorsChange={(mode) => dispatch({ type: "setOtherFloors", mode })}
          />
        </div>

        {/* camera tools + settings */}
        <div className="absolute end-3 top-20 z-20 flex items-start gap-2 md:top-3">
          {settingsOpen && (
            <ViewSettings
              exploded={viewer.exploded}
              distance={viewer.explodeDistance}
              onDistance={(v) => dispatch({ type: "setExplodeDistance", value: v })}
              onDistanceCommit={() => x.focusBuilding(true, viewer.explodeDistance)}
              onAssemble={x.toggleExplode}
              cutaway={x.cutaway}
              onCutaway={x.setCutaway}
              labels={x.showLabels}
              onLabels={x.setShowLabels}
            />
          )}
          <div className="flex flex-col gap-2">
            <CameraTools
              exploded={viewer.exploded}
              onZoom={(factor) => dispatch({ type: "zoomCamera", factor })}
              onReset={() => dispatch({ type: "resetCamera" })}
              onToggleExplode={() => {
                x.toggleExplode();
                if (!viewer.exploded) setSettingsOpen(true);
              }}
            />
            <IconButton label="تنظیمات نمایش" active={settingsOpen} onClick={() => setSettingsOpen((v) => !v)} className="shadow-float">
              <SlidersHorizontal className="size-5" />
            </IconButton>
          </div>
        </div>

        {/* mobile search over the map */}
        {!isDesktop && (
          <div className="absolute inset-x-3 top-3 z-30">
            <SearchBox value={x.query} onChange={x.setQuery} />
            {x.query.trim() && (
              <div className="un-scroll mt-2 max-h-[50dvh] overflow-y-auto rounded-2xl bg-white p-2 shadow-float">
                <ResultList
                  hits={x.hits}
                  onSelect={(hit) => {
                    x.setQuery("");
                    x.selectDestination(hit.room.id);
                    setSnap("half");
                  }}
                />
              </div>
            )}
          </div>
        )}

        <div className="pointer-events-none absolute bottom-3 start-3 z-10 hidden md:block">
          <DemoBadge />
        </div>
        {x.modelNotice && (
          <p role="status" className="absolute inset-x-3 bottom-24 z-20 mx-auto w-fit max-w-md rounded-xl bg-orange-100 px-4 py-2 text-center text-xs shadow-float md:bottom-3">
            {x.modelNotice}
          </p>
        )}
      </div>

      {!isDesktop && (
        <BottomSheet snap={snap} onSnapChange={setSnap} peekContent={<PeekSummary x={x} onNavigate={() => setSnap("full")} />}>
          {panel}
        </BottomSheet>
      )}
    </main>
  );
}

/** Side panel / bottom-sheet content: route planning, room details, or the list of units. */
function PanelContent({ x, onOpen }: { x: Explorer; onOpen: () => void }) {
  const showResults = x.query.trim() !== "" || (!x.focusedRoom && x.panelMode === "browse");

  if (x.panelMode === "navigate") {
    return (
      <NavigationPanel
        startOptions={x.startOptions}
        destinationOptions={x.destinationOptions}
        startNodeId={x.startNodeId}
        destRoomId={x.destRoomId}
        accessibleOnly={x.accessibleOnly}
        route={x.route}
        steps={x.steps}
        entranceOption={x.entranceOption}
        autoExploded={x.autoExploded}
        onStartChange={(id) => x.updateNavigation({ start: id })}
        onDestinationChange={(id) => x.updateNavigation({ dest: id })}
        onAccessibleChange={(v) => x.updateNavigation({ accessible: v })}
        onSwap={x.swap}
        onClose={x.closeNavigation}
      />
    );
  }

  if (showResults) {
    return (
      <section aria-label="واحدها و خدمات">
        <h2 className="mb-2 px-1 text-sm font-bold">
          {x.query.trim() ? `نتایج جستجو (${toPersianDigits(x.hits.length)})` : "واحدها و اتاق‌های این ساختمان"}
        </h2>
        <ResultList
          hits={x.hits}
          onSelect={(hit) => {
            x.setQuery("");
            x.selectDestination(hit.room.id);
            onOpen();
          }}
        />
      </section>
    );
  }

  if (x.focusedRoom) {
    return (
      <RoomDetails
        room={x.focusedRoom}
        navigating={false}
        onNavigate={x.startNavigation}
        onClose={x.clearFocus}
      />
    );
  }
  return null;
}

function PeekSummary({ x, onNavigate }: { x: Explorer; onNavigate: () => void }) {
  const { lookups } = useNavigator();
  if (x.panelMode === "navigate") {
    return (
      <p className="truncate text-sm font-medium">
        {x.routeOk ? `مسیر: حدود ${formatMeters(x.routeOk.totalDistance)}` : x.startNodeId ? "مسیریابی" : "نقطه شروع را انتخاب کنید"}
      </p>
    );
  }
  const room = x.focusedRoom;
  if (!room) return <p className="text-sm text-gray-500">اتاقی را روی نقشه انتخاب کنید یا جستجو کنید.</p>;
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="min-w-0">
        <p className="truncate text-[15px] font-bold">{roomTitle(room, lookups)}</p>
        <p className="truncate text-xs text-gray-500">
          {lookups.floorsById.get(room.floorId)?.displayName} · اتاق {toPersianDigits(room.roomNumber)}
        </p>
      </div>
      <Button
        size="sm"
        disabled={!room.doorNodeId}
        onClick={() => {
          x.startNavigation(room.id);
          onNavigate();
        }}
      >
        مسیریابی
      </Button>
    </div>
  );
}
