"use client";
import { Eye, EyeOff } from "lucide-react";
import type { Floor } from "@/lib/data/types";
import type { OtherFloorsMode } from "@/lib/model/layout";
import { cn } from "@/lib/utils/cn";

/**
 * Floor switcher: "all floors" plus one button per floor (top floor first, like an elevator panel).
 * Picking a floor isolates it; the other floors are then shown semi-transparent or hidden.
 */
export function FloorControls({
  floors,
  activeFloorId,
  otherFloors,
  onSelect,
  onOtherFloorsChange,
}: {
  floors: readonly Floor[];
  activeFloorId: string | "all";
  otherFloors: OtherFloorsMode;
  onSelect: (floorId: string | "all") => void;
  onOtherFloorsChange: (mode: OtherFloorsMode) => void;
}) {
  const ordered = [...floors].sort((a, b) => b.floorNumber - a.floorNumber);
  const item = (active: boolean) =>
    cn(
      "grid min-h-11 min-w-[4.25rem] place-items-center rounded-xl px-2 text-xs font-medium transition-colors",
      active ? "bg-teal-600 text-white shadow" : "text-navy-800 hover:bg-gray-100 active:bg-gray-200",
    );
  return (
    <div className="flex flex-col items-stretch gap-2">
      <div role="group" aria-label="انتخاب طبقه" className="flex flex-col gap-1 rounded-2xl bg-white p-1.5 shadow-float">
        <button type="button" aria-pressed={activeFloorId === "all"} onClick={() => onSelect("all")} className={item(activeFloorId === "all")}>
          همه طبقات
        </button>
        {ordered.map((f) => (
          <button key={f.id} type="button" aria-pressed={activeFloorId === f.id} onClick={() => onSelect(f.id)} className={item(activeFloorId === f.id)}>
            {f.displayName}
          </button>
        ))}
      </div>
      {activeFloorId !== "all" && (
        <div role="group" aria-label="نمایش سایر طبقات" className="flex gap-1 rounded-2xl bg-white p-1.5 shadow-float">
          <button
            type="button"
            aria-pressed={otherFloors === "ghost"}
            aria-label="سایر طبقات شفاف نمایش داده شوند"
            title="سایر طبقات: شفاف"
            onClick={() => onOtherFloorsChange("ghost")}
            className={cn("grid min-h-11 flex-1 place-items-center rounded-xl", otherFloors === "ghost" ? "bg-blue-100 text-blue-600" : "text-gray-500 hover:bg-gray-100")}
          >
            <Eye className="size-4" />
          </button>
          <button
            type="button"
            aria-pressed={otherFloors === "hide"}
            aria-label="سایر طبقات پنهان شوند"
            title="سایر طبقات: پنهان"
            onClick={() => onOtherFloorsChange("hide")}
            className={cn("grid min-h-11 flex-1 place-items-center rounded-xl", otherFloors === "hide" ? "bg-blue-100 text-blue-600" : "text-gray-500 hover:bg-gray-100")}
          >
            <EyeOff className="size-4" />
          </button>
        </div>
      )}
    </div>
  );
}
