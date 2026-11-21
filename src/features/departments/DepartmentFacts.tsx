import { Clock, Phone } from "lucide-react";
import type { ReactNode } from "react";
import type { Department } from "@/lib/data/types";
import { cn } from "@/lib/utils/cn";

/** Shown whenever a field has no verified value. Never filled with invented details. */
export const NOT_AVAILABLE = "اطلاعات ثبت نشده";

export function Fact({ icon, label, value, ltr }: { icon?: ReactNode; label: string; value: string | null; ltr?: boolean }) {
  return (
    <div className="flex items-start gap-2 text-sm">
      {icon && <span className="mt-0.5 shrink-0 text-gray-500">{icon}</span>}
      <div className="min-w-0">
        <dt className="text-xs text-gray-500">{label}</dt>
        <dd className={cn("text-navy-900", !value && "text-gray-500", ltr && value && "ltr")}>{value ?? NOT_AVAILABLE}</dd>
      </div>
    </div>
  );
}

/** Phone and working hours with an explicit "not available" state. */
export function ContactFacts({ department }: { department: Pick<Department, "phone" | "workingHours"> }) {
  return (
    <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <Fact icon={<Phone className="size-4" aria-hidden />} label="تلفن" value={department.phone} ltr />
      <Fact icon={<Clock className="size-4" aria-hidden />} label="ساعت کاری" value={department.workingHours} />
    </dl>
  );
}

export function ServiceChips({ names }: { names: readonly string[] }) {
  if (names.length === 0) return <p className="text-sm text-gray-500">{NOT_AVAILABLE}</p>;
  return (
    <ul className="flex flex-wrap gap-1.5">
      {names.map((n) => (
        <li key={n} className="rounded-full bg-gray-100 px-2.5 py-1 text-xs text-gray-700">
          {n}
        </li>
      ))}
    </ul>
  );
}
