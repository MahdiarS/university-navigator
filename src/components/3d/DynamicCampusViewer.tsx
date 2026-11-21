"use client";
import dynamic from "next/dynamic";
import { Spinner } from "@/components/ui/Spinner";

/** The 3D canvas is loaded on demand (client only) so pages render and stay usable while three.js downloads. */
export const DynamicCampusViewer = dynamic(() => import("./CampusViewer"), {
  ssr: false,
  loading: () => (
    <div className="un-viewer-bg grid size-full place-items-center" role="status">
      <span className="flex items-center gap-2 text-sm text-gray-500">
        <Spinner /> در حال بارگذاری نقشه سه‌بعدی…
      </span>
    </div>
  ),
});
