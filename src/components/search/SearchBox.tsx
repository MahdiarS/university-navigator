"use client";
import { Search, X } from "lucide-react";
import { useId } from "react";
import { cn } from "@/lib/utils/cn";

export function SearchBox({
  value,
  onChange,
  placeholder = "جستجوی دفتر، خدمت، شماره اتاق…",
  autoFocus,
  className,
  size = "md",
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
  className?: string;
  size?: "md" | "lg";
}) {
  const id = useId();
  return (
    <div className={cn("relative", className)}>
      <label htmlFor={id} className="sr-only">
        جستجو
      </label>
      <Search className="pointer-events-none absolute start-4 top-1/2 size-5 -translate-y-1/2 text-gray-500" aria-hidden />
      <input
        id={id}
        type="search"
        inputMode="search"
        enterKeyHint="search"
        autoComplete="off"
        autoFocus={autoFocus}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className={cn(
          "w-full rounded-2xl border border-gray-200 bg-white ps-12 pe-11 text-navy-900 shadow-panel placeholder:text-gray-500 focus:border-blue-600",
          size === "lg" ? "min-h-14 text-base" : "min-h-12 text-[15px]",
        )}
      />
      {value && (
        <button
          type="button"
          aria-label="پاک کردن جستجو"
          onClick={() => onChange("")}
          className="absolute end-2 top-1/2 grid size-9 -translate-y-1/2 place-items-center rounded-lg text-gray-500 hover:bg-gray-100"
        >
          <X className="size-4" />
        </button>
      )}
    </div>
  );
}
