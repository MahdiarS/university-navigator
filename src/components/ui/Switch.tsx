import { cn } from "@/lib/utils/cn";

export function Switch({
  checked,
  onChange,
  label,
  description,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  label: string;
  description?: string;
}) {
  return (
    <label className="flex min-h-11 cursor-pointer items-center justify-between gap-3 py-1">
      <span className="min-w-0">
        <span className="block text-sm font-medium text-navy-800">{label}</span>
        {description && <span className="block text-xs text-gray-500">{description}</span>}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={() => onChange(!checked)}
        className={cn(
          "relative h-7 w-12 shrink-0 rounded-full transition-colors",
          checked ? "bg-teal-600" : "bg-gray-300",
        )}
      >
        {/* logical positioning keeps the knob direction correct in RTL */}
        <span
          className={cn(
            "absolute top-0.5 size-6 rounded-full bg-white shadow transition-all",
            checked ? "end-0.5" : "start-0.5",
          )}
        />
      </button>
    </label>
  );
}
