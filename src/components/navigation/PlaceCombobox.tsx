"use client";
import { Check, ChevronDown, Search } from "lucide-react";
import { useId, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils/cn";
import { filterByText } from "@/features/buildings/places";

export interface ComboOption {
  id: string;
  label: string;
  detail?: string;
  group?: string;
  searchText: string;
  disabled?: boolean;
}

/**
 * Searchable picker (ARIA combobox + listbox). The list is rendered in the flow below the input, not in a floating
 * layer, so it can't be clipped by a bottom sheet or a scroll container. Filtering ignores ي/ی, ك/ک and ZWNJ.
 */
export function PlaceCombobox({
  label,
  placeholder,
  options,
  selectedId,
  onSelect,
  accent = "blue",
}: {
  label: string;
  placeholder: string;
  options: readonly ComboOption[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  accent?: "teal" | "orange" | "blue";
}) {
  const uid = useId();
  const listId = `${uid}-list`;
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);

  const selected = options.find((o) => o.id === selectedId) ?? null;
  const filtered = useMemo(() => filterByText(options, query), [options, query]);
  const safeActive = Math.min(active, Math.max(0, filtered.length - 1));

  const choose = (o: ComboOption) => {
    if (o.disabled) return;
    onSelect(o.id);
    setOpen(false);
    setQuery("");
  };

  const dot = accent === "teal" ? "bg-teal-600" : accent === "orange" ? "bg-orange-500" : "bg-blue-600";

  return (
    <div className="relative">
      <label htmlFor={`${uid}-input`} className="mb-1 flex items-center gap-2 text-xs font-medium text-gray-700">
        <span className={cn("size-2 rounded-full", dot)} aria-hidden />
        {label}
      </label>
      <div className="relative">
        <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-gray-500" aria-hidden />
        <input
          id={`${uid}-input`}
          ref={inputRef}
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={open && filtered[safeActive] ? `${uid}-opt-${filtered[safeActive]!.id}` : undefined}
          autoComplete="off"
          value={open ? query : (selected?.label ?? "")}
          placeholder={placeholder}
          onFocus={() => {
            setOpen(true);
            setQuery("");
          }}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
            setActive(0);
          }}
          onBlur={() => window.setTimeout(() => setOpen(false), 120)}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setOpen(true);
              setActive((i) => Math.min(filtered.length - 1, i + 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setActive((i) => Math.max(0, i - 1));
            } else if (e.key === "Enter" && open && filtered[safeActive]) {
              e.preventDefault();
              choose(filtered[safeActive]!);
            } else if (e.key === "Escape") {
              setOpen(false);
            }
          }}
          className="min-h-11 w-full rounded-xl border border-gray-200 bg-white ps-9 pe-9 text-[15px] text-navy-900 placeholder:text-gray-500 focus:border-blue-600"
        />
        <ChevronDown className="pointer-events-none absolute end-3 top-1/2 size-4 -translate-y-1/2 text-gray-500" aria-hidden />
      </div>

      {open && (
        <ul
          id={listId}
          role="listbox"
          aria-label={label}
          className="un-scroll mt-1 max-h-56 overflow-y-auto rounded-xl border border-gray-200 bg-white py-1 shadow-panel"
        >
          {filtered.length === 0 && <li className="px-3 py-3 text-sm text-gray-500">موردی پیدا نشد</li>}
          {filtered.map((o, i) => {
            const prev = filtered[i - 1];
            const showGroup = o.group && o.group !== prev?.group;
            return (
              <li key={o.id} role="presentation">
                {showGroup && <div className="px-3 pb-1 pt-2 text-[11px] font-medium text-gray-500">{o.group}</div>}
                <div
                  id={`${uid}-opt-${o.id}`}
                  role="option"
                  aria-selected={o.id === selectedId}
                  aria-disabled={o.disabled}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => choose(o)}
                  onMouseEnter={() => setActive(i)}
                  className={cn(
                    "flex min-h-11 cursor-pointer items-center justify-between gap-2 px-3 py-1.5",
                    i === safeActive && "bg-gray-100",
                    o.disabled && "cursor-not-allowed opacity-50",
                  )}
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm text-navy-900">{o.label}</span>
                    {o.detail && <span className="block truncate text-xs text-gray-500">{o.detail}</span>}
                  </span>
                  {o.id === selectedId && <Check className="size-4 shrink-0 text-teal-600" aria-hidden />}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
