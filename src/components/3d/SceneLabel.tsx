"use client";
import { Html } from "@react-three/drei";
import { createContext, useContext, type ReactNode, type RefObject } from "react";
import { cn } from "@/lib/utils/cn";

/**
 * DOM element (inside the viewer wrapper, outside the canvas) that holds all scene labels. drei's <Html> appends its
 * container to the canvas parent and removes it again on unmount; when the whole viewer is torn down by a client-side
 * navigation that removal can race with React and throw. A container we own always still contains the label.
 */
export const LabelPortalContext = createContext<RefObject<HTMLDivElement | null> | null>(null);

type Tone = "neutral" | "selected" | "destination" | "start" | "info";
const tones: Record<Tone, string> = {
  neutral: "bg-white/95 text-navy-800 border-gray-200",
  info: "bg-navy-800 text-white border-navy-800",
  selected: "bg-blue-600 text-white border-blue-600",
  destination: "bg-orange-500 text-white border-orange-500",
  start: "bg-teal-600 text-white border-teal-600",
};

/**
 * DOM label anchored to a 3D position. Rendered with <Html> so Persian text uses the page font and shaping.
 * It never captures the pointer (orbit / click keep working underneath) and sits below the page UI overlays.
 * Without a DOM (unit tests with the test renderer) it renders nothing.
 */
export function SceneLabel({
  position,
  tone = "neutral",
  children,
}: {
  position: [number, number, number];
  tone?: Tone;
  children: ReactNode;
}) {
  const portal = useContext(LabelPortalContext);
  if (typeof document === "undefined") return null;
  return (
    <Html portal={(portal ?? undefined) as RefObject<HTMLElement> | undefined} position={position} center zIndexRange={[10, 0]} style={{ pointerEvents: "none" }}>
      <div
        dir="rtl"
        className={cn(
          "pointer-events-none max-w-48 select-none truncate whitespace-nowrap rounded-md border px-2 py-0.5 text-xs font-medium shadow-panel",
          tones[tone],
        )}
      >
        {children}
      </div>
    </Html>
  );
}
