import type { Metadata } from "next";
import { Suspense } from "react";
import { CampusExplorer } from "@/features/campus/CampusExplorer";

export const metadata: Metadata = { title: "پردیس و ساختمان‌ها" };

export default function CampusPage() {
  return (
    <Suspense fallback={<main className="flex-1 p-6 text-sm text-gray-500">در حال بارگذاری نقشه…</main>}>
      <CampusExplorer />
    </Suspense>
  );
}
