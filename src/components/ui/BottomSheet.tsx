"use client";
import { useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils/cn";

export type SheetSnap = "peek" | "half" | "full";

/**
 * Mobile bottom sheet: drag the handle (or tap it) to move between peek / half / full.
 * Rendered only on small screens by its parent (md:hidden); the desktop layout uses a side panel instead.
 */
export function BottomSheet({
  snap,
  onSnapChange,
  peekContent,
  children,
}: {
  snap: SheetSnap;
  onSnapChange: (snap: SheetSnap) => void;
  /** always-visible summary shown in the peek state */
  peekContent?: ReactNode;
  children: ReactNode;
}) {
  const [dragY, setDragY] = useState(0);
  const start = useRef<{ y: number; moved: boolean } | null>(null);

  const heights: Record<SheetSnap, string> = { peek: "5.5rem", half: "46dvh", full: "86dvh" };
  const order: SheetSnap[] = ["peek", "half", "full"];

  const onPointerDown = (e: React.PointerEvent) => {
    start.current = { y: e.clientY, moved: false };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!start.current) return;
    const dy = e.clientY - start.current.y;
    if (Math.abs(dy) > 4) start.current.moved = true;
    setDragY(dy);
  };
  const onPointerUp = () => {
    const s = start.current;
    start.current = null;
    const dy = dragY;
    setDragY(0);
    if (!s) return;
    const i = order.indexOf(snap);
    if (!s.moved) {
      onSnapChange(order[(i + 1) % order.length]!); // tap cycles
    } else if (dy < -40) {
      onSnapChange(order[Math.min(order.length - 1, i + 1)]!);
    } else if (dy > 40) {
      onSnapChange(order[Math.max(0, i - 1)]!);
    }
  };

  return (
    <section
      aria-label="جزئیات مقصد و مسیر"
      className="absolute inset-x-0 bottom-0 z-20 flex flex-col rounded-t-3xl bg-white shadow-float md:hidden"
      style={{
        height: `calc(${heights[snap]} - ${Math.max(0, dragY)}px + ${Math.max(0, -dragY)}px)`,
        transition: dragY === 0 ? "height 220ms ease" : "none",
      }}
    >
      <button
        type="button"
        aria-label="تغییر اندازه پنل"
        className="grid h-7 w-full shrink-0 touch-none place-items-center"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={() => {
          start.current = null;
          setDragY(0);
        }}
      >
        <span className="h-1.5 w-12 rounded-full bg-gray-300" />
      </button>
      {snap === "peek" && peekContent ? <div className="px-4 pb-3">{peekContent}</div> : null}
      <div className={cn("un-scroll min-h-0 flex-1 overflow-y-auto px-4 pb-6", snap === "peek" && "hidden")}>{children}</div>
    </section>
  );
}
