"use client";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { useNavigator } from "@/components/DataProvider";
import { ResultList } from "@/components/search/ResultList";
import { SearchBox } from "@/components/search/SearchBox";
import { hitMapHref } from "@/components/search/ResultCard";
import { Button } from "@/components/ui/Button";
import { search } from "@/lib/search/engine";

/** Prominent search on the home page: live suggestions in place, Enter/“جستجو” opens the full results page. */
export function HeroSearch() {
  const router = useRouter();
  const { searchIndex } = useNavigator();
  const [query, setQuery] = useState("");
  const hits = useMemo(() => (query.trim() ? search(searchIndex, query, { limit: 5 }) : []), [searchIndex, query]);

  return (
    <form
      role="search"
      className="relative"
      onSubmit={(e) => {
        e.preventDefault();
        router.push(query.trim() ? `/search?q=${encodeURIComponent(query.trim())}` : "/search");
      }}
    >
      <div className="flex gap-2">
        <SearchBox value={query} onChange={setQuery} size="lg" className="flex-1" placeholder="کجا می‌خواهید بروید؟ مثلاً «ثبت‌نام» یا «امور مالی»" />
        <Button type="submit" size="lg" className="hidden sm:inline-flex">جستجو</Button>
      </div>
      {query.trim() && (
        <div className="absolute inset-x-0 top-full z-30 mt-2 rounded-2xl border border-gray-200 bg-white p-2 shadow-float">
          <ResultList hits={hits} onSelect={(hit) => router.push(hitMapHref(hit))} />
          {hits.length > 0 && (
            <button type="submit" className="mt-1 min-h-11 w-full rounded-lg text-sm text-blue-600 hover:bg-gray-50">
              مشاهده‌ی همه‌ی نتایج
            </button>
          )}
        </div>
      )}
    </form>
  );
}
