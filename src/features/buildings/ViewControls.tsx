"use client";
import { Layers, Maximize2, Minus, Plus } from "lucide-react";
import { IconButton } from "@/components/ui/Button";
import { Switch } from "@/components/ui/Switch";
import { MAX_EXPLODE_DISTANCE, MIN_EXPLODE_DISTANCE } from "@/lib/model/layout";
import { toPersianDigits } from "@/lib/search/normalize";

/** Camera tools (zoom, reset) and the Exploded View toggle. Orbit and pan are done directly on the model. */
export function CameraTools({
  exploded,
  onZoom,
  onReset,
  onToggleExplode,
}: {
  exploded: boolean;
  onZoom: (factor: number) => void;
  onReset: () => void;
  onToggleExplode: () => void;
}) {
  return (
    <div role="toolbar" aria-label="ابزار دوربین" className="flex flex-col gap-1 rounded-2xl bg-white p-1.5 shadow-float">
      <IconButton label="بزرگ‌نمایی" onClick={() => onZoom(1.35)} className="border-transparent">
        <Plus className="size-5" />
      </IconButton>
      <IconButton label="کوچک‌نمایی" onClick={() => onZoom(1 / 1.35)} className="border-transparent">
        <Minus className="size-5" />
      </IconButton>
      <IconButton label="بازنشانی دوربین" onClick={onReset} className="border-transparent">
        <Maximize2 className="size-5" />
      </IconButton>
      <IconButton label={exploded ? "بازگشت به نمای عادی" : "نمای انفجاری طبقات"} active={exploded} onClick={onToggleExplode} className={exploded ? "" : "border-transparent"}>
        <Layers className="size-5" />
      </IconButton>
    </div>
  );
}

/** Floating card with the exploded-view distance and display options. */
export function ViewSettings({
  exploded,
  distance,
  onDistance,
  onDistanceCommit,
  onAssemble,
  cutaway,
  onCutaway,
  labels,
  onLabels,
}: {
  exploded: boolean;
  distance: number;
  onDistance: (value: number) => void;
  onDistanceCommit: () => void;
  onAssemble: () => void;
  cutaway: boolean;
  onCutaway: (v: boolean) => void;
  labels: boolean;
  onLabels: (v: boolean) => void;
}) {
  return (
    <div className="w-72 max-w-[calc(100vw-1.5rem)] rounded-2xl bg-white p-3 shadow-float">
      {exploded && (
        <div className="mb-2">
          <div className="flex items-center justify-between text-sm">
            <label htmlFor="explode-distance" className="font-medium">
              فاصله طبقات
            </label>
            <span className="text-xs text-gray-500">{toPersianDigits(distance.toFixed(1))} متر (نمایشی)</span>
          </div>
          <input
            id="explode-distance"
            className="un-range"
            type="range"
            min={MIN_EXPLODE_DISTANCE}
            max={MAX_EXPLODE_DISTANCE}
            step={0.5}
            value={distance}
            onChange={(e) => onDistance(Number(e.target.value))}
            onPointerUp={onDistanceCommit}
            onKeyUp={onDistanceCommit}
          />
          <p className="text-[11px] leading-5 text-gray-500">فاصله فقط برای نمایش است و ارتفاع واقعی طبقات را تغییر نمی‌دهد.</p>
          <button type="button" onClick={onAssemble} className="mt-1 min-h-10 w-full rounded-lg bg-gray-100 text-sm font-medium text-navy-800 hover:bg-gray-200">
            بازگشت به نمای عادی (جمع کردن طبقات)
          </button>
        </div>
      )}
      <Switch checked={cutaway} onChange={onCutaway} label="دیوارهای کوتاه (برش)" description="دیدن اتاق‌ها از بالا" />
      <Switch checked={labels} onChange={onLabels} label="برچسب اتاق‌ها" description="در نمای تک‌طبقه" />
    </div>
  );
}
