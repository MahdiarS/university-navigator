import { toPersianDigits } from "@/lib/search/normalize";
import type { DirectionStep, GraphNode, RouteFailure, Turn } from "./types";

/** Persian wording for the language-neutral steps produced by buildDirections(). */
export interface DirectionContext {
  node(nodeId: string): GraphNode | undefined;
  /** Human name for a node: room name for room doors, label otherwise. */
  nodeName(nodeId: string): string;
  floorName(floorId: string): string;
}

const TURN_TEXT: Record<Turn, string> = {
  left: "به چپ بپیچید و",
  right: "به راست بپیچید و",
  "u-turn": "برگردید و",
};

export function formatMeters(distance: number): string {
  const rounded = Math.max(1, Math.round(distance));
  return `${toPersianDigits(rounded)} متر`;
}

export function describeStep(step: DirectionStep, ctx: DirectionContext): string {
  switch (step.kind) {
    case "start":
      return `شروع از «${ctx.nodeName(step.nodeId)}» (${ctx.floorName(step.floorId)})`;
    case "walk": {
      const to = ctx.node(step.toNodeId);
      let landmark = "";
      if (to?.type === "stair") landmark = " تا راه‌پله";
      else if (to?.type === "elevator") landmark = " تا آسانسور";
      else if (to?.type === "room-door") landmark = ` تا ${ctx.nodeName(step.toNodeId)}`;
      else if (to?.type === "junction") landmark = " تا تقاطع راهرو";
      const prefix = step.turn ? `${TURN_TEXT[step.turn]} ` : "";
      return `${prefix}حدود ${formatMeters(step.distance)} مستقیم بروید${landmark}`;
    }
    case "transfer": {
      const means = step.via === "elevator" ? "آسانسور" : "راه‌پله";
      const dir = step.direction === "up" ? "بالا بروید" : "پایین بروید";
      return `با ${means} به ${ctx.floorName(step.toFloorId)} ${dir}`;
    }
    case "arrive":
      return `به مقصد رسیدید: ${ctx.nodeName(step.nodeId)}`;
  }
}

/** Messages for every non-success route status. */
export function routeFailureMessage(failure: RouteFailure): string {
  switch (failure.status) {
    case "unknown-start":
      return "نقطه شروع در داده‌های مسیریابی پیدا نشد. لطفاً نقطه شروع دیگری انتخاب کنید.";
    case "unknown-goal":
      return "برای این مقصد در داده‌های مسیریابی نقطه ورود ثبت نشده است.";
    case "same-location":
      return "شما همین‌جا هستید؛ نقطه شروع و مقصد یکی است.";
    case "no-accessible-route":
      return "مسیر بدون پله برای این مقصد در داده‌های فعلی ثبت نشده است. مسیر موجود از پله یا مسیری می‌گذرد که به‌عنوان «بدون مانع» علامت‌گذاری نشده است.";
    case "no-route":
      return "مسیری میان نقطه شروع و مقصد در داده‌های فعلی پیدا نشد.";
  }
}
