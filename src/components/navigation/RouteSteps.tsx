import { ArrowUp, ArrowUpDown, CircleDot, CornerUpLeft, CornerUpRight, MapPin, TrendingUp, Undo2, type LucideIcon } from "lucide-react";
import type { DirectionStep } from "@/lib/navigation";
import { cn } from "@/lib/utils/cn";

export interface RenderedStep {
  step: DirectionStep;
  text: string;
}

function iconFor(step: DirectionStep): { Icon: LucideIcon; tone: string } {
  switch (step.kind) {
    case "start":
      return { Icon: CircleDot, tone: "bg-teal-100 text-teal-600" };
    case "arrive":
      return { Icon: MapPin, tone: "bg-orange-100 text-orange-500" };
    case "transfer":
      return { Icon: step.via === "elevator" ? ArrowUpDown : TrendingUp, tone: "bg-navy-800 text-white" };
    case "walk":
      if (step.turn === "left") return { Icon: CornerUpLeft, tone: "bg-blue-100 text-blue-600" };
      if (step.turn === "right") return { Icon: CornerUpRight, tone: "bg-blue-100 text-blue-600" };
      if (step.turn === "u-turn") return { Icon: Undo2, tone: "bg-blue-100 text-blue-600" };
      return { Icon: ArrowUp, tone: "bg-blue-100 text-blue-600" };
  }
}

/** Step-by-step directions, numbered, with an icon per kind of movement. */
export function RouteSteps({ steps }: { steps: readonly RenderedStep[] }) {
  return (
    <ol aria-label="مراحل مسیر" className="relative space-y-1">
      {steps.map(({ step, text }, i) => {
        const { Icon, tone } = iconFor(step);
        const last = i === steps.length - 1;
        return (
          <li key={i} className="relative flex gap-3 pb-3">
            {!last && <span aria-hidden className="absolute start-[15px] top-8 bottom-0 w-px bg-gray-200" />}
            <span className={cn("relative z-10 grid size-8 shrink-0 place-items-center rounded-full", tone)}>
              <Icon className="size-4" aria-hidden />
            </span>
            <p className="min-w-0 pt-1 text-sm leading-6 text-navy-900">{text}</p>
          </li>
        );
      })}
    </ol>
  );
}
