"use client";
import { Map } from "lucide-react";
import Link from "next/link";
import { DynamicCampusViewer } from "@/components/3d/DynamicCampusViewer";
import { useNavigator } from "@/components/DataProvider";

const noop = () => {};
const NO_COMMAND = { kind: "none", nonce: 0 } as const;

/** 3D campus preview (slow turntable) built from the supplied site plan; demo-labelled only if the layout is demo data. */
export function CampusPreview() {
  const { data } = useNavigator();
  return (
    <div className="relative aspect-[4/3] w-full overflow-hidden rounded-3xl border border-gray-200 bg-white shadow-panel" aria-label="پیش‌نمایش سه‌بعدی پردیس">
      <DynamicCampusViewer campus={data.manifest.campus} selectedKey={null} hoveredKey={null} onHover={noop} onSelect={noop} cameraCommand={NO_COMMAND} preview />
      <Link href="/campus" className="absolute bottom-3 end-3 inline-flex min-h-10 items-center gap-2 rounded-xl bg-white/95 px-3 text-sm font-medium shadow-float hover:bg-white">
        <Map className="size-4" aria-hidden />
        کاوش پردیس
      </Link>
      <p className="pointer-events-none absolute bottom-3 start-3 hidden rounded-lg bg-white/90 px-2 py-1 text-xs text-gray-500 sm:block">پلان محوطه از نقشهٔ CAD؛ ارتفاع ساختمان‌ها تقریبی است</p>
    </div>
  );
}
