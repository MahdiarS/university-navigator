import { FlaskConical } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils/cn";

type Tone = "neutral" | "blue" | "teal" | "orange" | "demo";
const tones: Record<Tone, string> = {
  neutral: "bg-gray-100 text-gray-700",
  blue: "bg-blue-100 text-blue-600",
  teal: "bg-teal-100 text-teal-600",
  orange: "bg-orange-100 text-orange-500",
  demo: "bg-orange-100 text-gray-700 border border-orange-500/40",
};

export function Badge({ tone = "neutral", className, children }: { tone?: Tone; className?: string; children: ReactNode }) {
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium", tones[tone], className)}>
      {children}
    </span>
  );
}

/** Marks sample content so it can never be mistaken for verified university data. */
export function DemoBadge({ className }: { className?: string }) {
  return (
    <Badge tone="demo" className={className}>
      <FlaskConical className="size-3" aria-hidden />
      داده نمونه
    </Badge>
  );
}
