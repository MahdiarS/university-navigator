"use client";
import { Accessibility, ArrowRightLeft, Info, Route as RouteIcon, X } from "lucide-react";
import { useMemo } from "react";
import { Badge } from "@/components/ui/Badge";
import { Button, IconButton } from "@/components/ui/Button";
import { Switch } from "@/components/ui/Switch";
import { formatMeters, routeFailureMessage, type RouteResult } from "@/lib/navigation";
import { toPersianDigits } from "@/lib/search/normalize";
import { PLACE_GROUP_LABEL, type DestinationOption, type PlaceOption } from "@/features/buildings/places";
import { PlaceCombobox, type ComboOption } from "./PlaceCombobox";
import { RouteSteps, type RenderedStep } from "./RouteSteps";

export interface NavigationPanelProps {
  startOptions: readonly PlaceOption[];
  destinationOptions: readonly DestinationOption[];
  startNodeId: string | null;
  destRoomId: string | null;
  accessibleOnly: boolean;
  route: RouteResult | null;
  steps: readonly RenderedStep[];
  /** the "main entrance" option, offered as a one-tap start */
  entranceOption: PlaceOption | null;
  /** explains that the exploded view was switched on to show a multi-floor route */
  autoExploded: boolean;
  onStartChange: (nodeId: string) => void;
  onDestinationChange: (roomId: string) => void;
  onAccessibleChange: (value: boolean) => void;
  onSwap: () => void;
  onClose: () => void;
}

/** Route planning: pick a start and a destination from searchable lists, then read the step-by-step directions. */
export function NavigationPanel(p: NavigationPanelProps) {
  const startCombo = useMemo<ComboOption[]>(
    () => p.startOptions.map((o) => ({ id: o.id, label: o.label, detail: o.detail, group: PLACE_GROUP_LABEL[o.group], searchText: o.searchText })),
    [p.startOptions],
  );
  const destCombo = useMemo<ComboOption[]>(
    () =>
      p.destinationOptions.map((o) => ({
        id: o.roomId,
        label: o.label,
        detail: o.routable ? o.detail : `${o.detail} · مسیر ثبت نشده`,
        searchText: o.searchText,
        disabled: !o.routable,
      })),
    [p.destinationOptions],
  );
  const selectedStartId = p.startOptions.find((o) => o.nodeId === p.startNodeId)?.id ?? null;
  const ok = p.route?.status === "ok" ? p.route : null;
  const failure = p.route && p.route.status !== "ok" ? p.route : null;
  const usesStairs = ok?.transfers.some((t) => t.via === "stairs") ?? false;

  return (
    <section aria-label="مسیریابی" className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-base font-bold">
          <RouteIcon className="size-5 text-blue-600" aria-hidden />
          مسیریابی داخل ساختمان
        </h2>
        <IconButton label="بستن مسیریابی" onClick={p.onClose} className="size-10 border-transparent">
          <X className="size-5" />
        </IconButton>
      </div>

      <div className="space-y-3">
        <PlaceCombobox
          label="نقطه شروع (خودتان انتخاب کنید)"
          placeholder="جستجوی ورودی، اتاق یا راهرو…"
          options={startCombo}
          selectedId={selectedStartId}
          onSelect={(id) => {
            const o = p.startOptions.find((x) => x.id === id);
            if (o) p.onStartChange(o.nodeId);
          }}
          accent="teal"
        />
        {p.entranceOption && p.startNodeId !== p.entranceOption.nodeId && (
          <Button variant="secondary" size="sm" onClick={() => p.onStartChange(p.entranceOption!.nodeId)}>
            شروع از «{p.entranceOption.label}»
          </Button>
        )}
        <div className="flex justify-center">
          <IconButton label="جابه‌جایی مبدأ و مقصد" onClick={p.onSwap} className="size-9" disabled={!p.startNodeId || !p.destRoomId}>
            <ArrowRightLeft className="size-4 rotate-90" />
          </IconButton>
        </div>
        <PlaceCombobox
          label="مقصد"
          placeholder="جستجوی واحد یا اتاق…"
          options={destCombo}
          selectedId={p.destRoomId}
          onSelect={p.onDestinationChange}
          accent="orange"
        />
        <Switch
          checked={p.accessibleOnly}
          onChange={p.onAccessibleChange}
          label="مسیر بدون پله"
          description="فقط اتصال‌هایی که در داده‌ها صراحتاً بدون مانع علامت خورده‌اند"
        />
      </div>

      {!p.startNodeId && (
        <p role="status" className="flex items-start gap-2 rounded-xl bg-gray-100 p-3 text-sm text-gray-700">
          <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
          این سامانه موقعیت شما را خودکار تشخیص نمی‌دهد. لطفاً نقطه شروع را انتخاب کنید.
        </p>
      )}

      {failure && (
        <p role="alert" className="flex items-start gap-2 rounded-xl border border-orange-500/40 bg-orange-100 p-3 text-sm leading-6">
          <Info className="mt-0.5 size-4 shrink-0 text-orange-500" aria-hidden />
          {routeFailureMessage(failure)}
        </p>
      )}

      {ok && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2 rounded-xl bg-blue-100 p-3">
            <span className="text-sm font-bold text-navy-900">حدود {formatMeters(ok.totalDistance)}</span>
            <span className="text-xs text-gray-700">
              {toPersianDigits(ok.floorIds.length)} {ok.floorIds.length > 1 ? "طبقه" : "طبقه (همان طبقه)"}
            </span>
            {ok.stepFree ? (
              <Badge tone="teal">
                <Accessibility className="size-3" aria-hidden />
                بدون پله (طبق داده ثبت‌شده)
              </Badge>
            ) : usesStairs ? (
              <Badge tone="orange">شامل پله</Badge>
            ) : (
              <Badge tone="neutral">دسترسی بدون پله در داده‌ها تأیید نشده</Badge>
            )}
          </div>
          {p.autoExploded && (
            <p className="text-xs text-gray-500">برای نمایش بهتر مسیر چندطبقه، نمای انفجاری فعال شد.</p>
          )}
          <RouteSteps steps={p.steps} />
        </div>
      )}
    </section>
  );
}
