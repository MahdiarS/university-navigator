"use client";
import { SearchX } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { useNavigator } from "@/components/DataProvider";
import { Footer } from "@/components/layout/Footer";
import { ResultCard } from "@/components/search/ResultCard";
import { SearchBox } from "@/components/search/SearchBox";
import { search } from "@/lib/search/engine";
import { toPersianDigits } from "@/lib/search/normalize";
import { cn } from "@/lib/utils/cn";

const SUGGESTIONS = ["ثبت‌نام", "شهریه", "وام", "کارت دانشجویی", "کتابخانه", "نامه اداری"];

/** /search — query + floor filter over the search service; the URL (?q=) is kept in sync so results are shareable. */
export function SearchPage() {
  const params = useSearchParams();
  const { data, searchIndex } = useNavigator();
  const [query, setQueryState] = useState(params.get("q") ?? "");
  const [floorId, setFloorId] = useState<string | null>(null);

  const setQuery = (value: string) => {
    setQueryState(value);
    const url = new URL(window.location.href);
    if (value.trim()) url.searchParams.set("q", value);
    else url.searchParams.delete("q");
    window.history.replaceState(null, "", url);
  };

  const floors = useMemo(() => [...data.floors].sort((a, b) => a.floorNumber - b.floorNumber), [data.floors]);
  const hits = useMemo(() => search(searchIndex, query, { floorId: floorId ?? undefined, limit: 60 }), [searchIndex, query, floorId]);
  const hasQuery = query.trim().length > 0;

  return (
    <>
    <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6 md:px-6 md:py-10">
      <h1 className="mb-1 text-2xl font-bold">جستجوی دفاتر و خدمات</h1>
      <p className="mb-5 text-sm text-gray-500">نام واحد، خدمت، شماره اتاق، طبقه یا کلیدواژه را بنویسید؛ تفاوت «ی/ي» و «ک/ك» اهمیتی ندارد.</p>

      <SearchBox value={query} onChange={setQuery} autoFocus size="lg" />

      <div className="mt-4 flex flex-wrap items-center gap-2" role="group" aria-label="فیلتر طبقه">
        <span className="text-xs text-gray-500">طبقه:</span>
        {[{ id: null as string | null, label: "همه" }, ...floors.map((f) => ({ id: f.id as string | null, label: f.displayName }))].map((f) => (
          <button
            key={f.id ?? "all"}
            type="button"
            aria-pressed={floorId === f.id}
            onClick={() => setFloorId(f.id)}
            className={cn(
              "min-h-9 rounded-full border px-3.5 text-sm",
              floorId === f.id ? "border-teal-600 bg-teal-100 text-teal-600" : "border-gray-200 bg-white text-gray-700 hover:bg-gray-50",
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      {!hasQuery && (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <span className="text-xs text-gray-500">پیشنهاد:</span>
          {SUGGESTIONS.map((s) => (
            <button key={s} type="button" onClick={() => setQuery(s)} className="min-h-9 rounded-full bg-gray-100 px-3.5 text-sm text-gray-700 hover:bg-gray-200">
              {s}
            </button>
          ))}
        </div>
      )}

      <p className="mt-6 text-sm text-gray-500" role="status" aria-live="polite">
        {hasQuery ? `${toPersianDigits(hits.length)} نتیجه` : `همه‌ی واحدها (${toPersianDigits(hits.length)})`}
      </p>

      {hits.length === 0 ? (
        <div className="mt-4 rounded-2xl border border-dashed border-gray-300 bg-white p-10 text-center">
          <SearchX className="mx-auto mb-3 size-8 text-gray-300" aria-hidden />
          <p className="text-sm text-gray-700">نتیجه‌ای پیدا نشد. عبارت کوتاه‌تر یا مترادف را امتحان کنید.</p>
        </div>
      ) : (
        <ul className="mt-3 grid gap-3 md:grid-cols-2">
          {hits.map((hit) => (
            <li key={`${hit.kind}-${hit.id}`} className="contents">
              <ResultCard hit={hit} />
            </li>
          ))}
        </ul>
      )}
    </main>
    <Footer />
    </>
  );
}
