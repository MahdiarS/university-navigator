import type { Metadata } from "next";
import { Suspense } from "react";
import { SearchPage } from "@/features/search/SearchPage";

export const metadata: Metadata = { title: "جستجو" };

export default function Page() {
  // useSearchParams needs a Suspense boundary so the rest of the route can be prerendered.
  return (
    <Suspense fallback={<main className="flex-1" />}>
      <SearchPage />
    </Suspense>
  );
}
