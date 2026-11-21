import type { Campus } from "@/lib/data/types";
import {
  buildCampusGraph,
  findCampusRoute,
  type CampusGoal,
  type CampusGraph,
  type CampusRouteOk,
  type CampusRouteResult,
} from "@/lib/navigation/campus-route";
import { toPersianDigits } from "@/lib/search/normalize";
import { findCampusBuilding } from "./campus";

/**
 * Glue between the campus layout and the outdoor routing engine, plus Persian step text.
 * The route is approximate: the plan has no footpaths or building doors (see campus.source.note).
 */
const graphCache = new WeakMap<object, CampusGraph>();

export function campusNavGraph(campus: Campus): CampusGraph | null {
  if (!campus.nav || campus.nav.obstacles.length === 0) return null;
  let g = graphCache.get(campus);
  if (!g) {
    g = buildCampusGraph(campus.nav.obstacles);
    graphCache.set(campus, g);
  }
  return g;
}

export function campusEntrances(campus: Campus) {
  return campus.entrances ?? [];
}

/** «درب ورود ۱» / «درب ورود ۲» — numbered only when several entrances share the same label. */
export function entranceName(campus: Campus, entranceId: string): string {
  const all = campusEntrances(campus);
  const i = all.findIndex((e) => e.id === entranceId);
  if (i < 0) return "ورودی";
  const e = all[i]!;
  const same = all.filter((x) => x.label === e.label).length > 1;
  return same ? `${e.label} ${toPersianDigits(i + 1)}` : e.label;
}

/** Display name for an obstacle id used in route wording (building label, area name, pond). */
export function obstacleName(campus: Campus, obstacleId: string): string {
  const b = campus.buildings.find((x) => x.id === obstacleId);
  if (b) return b.number ? `ساختمان ${toPersianDigits(b.number)}${b.name ? ` (${b.name})` : ""}` : (b.name ?? b.label);
  const a = campus.areas?.find((x) => x.id === obstacleId);
  if (a) return a.name ?? "محوطه";
  if (campus.ponds?.some((p) => p.id === obstacleId)) return "حوض";
  if (obstacleId.startsWith("outside")) return "مرز محوطه";
  if (campus.props?.some((p) => p.id === obstacleId)) return "الاچیق";
  return "مانع";
}

export type CampusRouteQuery =
  | { status: "ok"; route: CampusRouteOk; entranceLabel: string; buildingLabel: string }
  | { status: "unknown-entrance" | "unknown-building" | "no-data" | "unknown-goal" | "same-location" | "no-route" | "blocked-start" };

/** Walking route from one of the university's entrances to a building. */
export function routeFromEntrance(campus: Campus, entranceId: string, buildingKey: string): CampusRouteQuery {
  const graph = campusNavGraph(campus);
  if (!graph) return { status: "no-data" };
  const entrance = campusEntrances(campus).find((e) => e.id === entranceId);
  if (!entrance) return { status: "unknown-entrance" };
  const building = findCampusBuilding(campus, buildingKey);
  if (!building) return { status: "unknown-building" };

  let goal: CampusGoal;
  if (building.entrance) goal = { kind: "point", point: building.entrance };
  else if (graph.obstacles.some((o) => o.id === building.id)) goal = { kind: "obstacle", obstacleId: building.id! };
  else goal = { kind: "point", point: building.position };

  const res: CampusRouteResult = findCampusRoute(graph, { x: entrance.x, z: entrance.z }, goal);
  if (res.status !== "ok") return { status: res.status };
  return { status: "ok", route: res, entranceLabel: entranceName(campus, entrance.id), buildingLabel: building.label };
}

/** The entrance with the shortest walking route to the building (null when none is reachable). */
export function nearestEntrance(campus: Campus, buildingKey: string): { entranceId: string; length: number } | null {
  let best: { entranceId: string; length: number } | null = null;
  for (const e of campusEntrances(campus)) {
    const r = routeFromEntrance(campus, e.id, buildingKey);
    if (r.status === "ok" && (!best || r.route.length < best.length)) best = { entranceId: e.id, length: r.route.length };
  }
  return best;
}

const TURN_TEXT = { left: "به چپ بپیچید و", right: "به راست بپیچید و", "u-turn": "برگردید و" } as const;

export function formatWalkMeters(distance: number): string {
  return `${toPersianDigits(Math.max(1, Math.round(distance)))} متر`;
}

export function formatWalkTime(durationSec: number): string {
  const minutes = Math.max(1, Math.round(durationSec / 60));
  return `حدود ${toPersianDigits(minutes)} دقیقه پیاده`;
}

export interface CampusStepText {
  kind: "start" | "walk" | "arrive";
  text: string;
}

/** Legs shorter than this are folded into a neighbour so the list never says "turn left and walk 2 m". */
const MIN_STEP_METERS = 4;

/** Persian step list: start at the entrance, walk legs named by the corner they head for, arrive. */
export function describeCampusRoute(campus: Campus, q: Extract<CampusRouteQuery, { status: "ok" }>): CampusStepText[] {
  const steps: CampusStepText[] = [{ kind: "start", text: `شروع از ${q.entranceLabel} دانشگاه` }];
  const target = q.buildingLabel;

  interface Walk {
    distance: number;
    turn: CampusRouteOk["legs"][number]["turn"];
    cornerOf: string | null;
  }
  const walks: Walk[] = q.route.legs.map((leg) => ({ distance: leg.distance, turn: leg.turn, cornerOf: leg.cornerOf }));
  // a tiny leg is folded forward into the next one (keeping its own turn)...
  for (let i = 0; i < walks.length - 1;) {
    const w = walks[i]!;
    if (w.distance < MIN_STEP_METERS) {
      const next = walks[i + 1]!;
      walks.splice(i, 1);
      next.distance += w.distance;
      next.turn = w.turn;
    } else i++;
  }
  // ...and a tiny final approach is part of the walk before it
  while (walks.length > 1 && walks[walks.length - 1]!.distance < MIN_STEP_METERS) {
    const last = walks.pop()!;
    const prev = walks[walks.length - 1]!;
    prev.distance += last.distance;
    prev.cornerOf = last.cornerOf;
  }
  let lastCorner: string | null = null;
  for (const w of walks) {
    const prefix = w.turn ? `${TURN_TEXT[w.turn]} ` : "";
    let text: string;
    if (!w.cornerOf) text = `${prefix}حدود ${formatWalkMeters(w.distance)} ${w.turn ? "" : "مستقیم "}بروید تا نزدیک‌ترین ضلع ${target}`;
    else if (w.cornerOf === lastCorner)
      text = `${prefix}حدود ${formatWalkMeters(w.distance)} از کنار ${obstacleName(campus, w.cornerOf)} ادامه دهید`;
    else text = `${prefix}حدود ${formatWalkMeters(w.distance)} ${w.turn ? "" : "مستقیم "}بروید تا گوشهٔ ${obstacleName(campus, w.cornerOf)}`;
    lastCorner = w.cornerOf;
    steps.push({ kind: "walk", text: text.replace(/\s+/g, " ") });
  }
  steps.push({ kind: "arrive", text: `به مقصد رسیدید: ${target}` });
  return steps;
}

export function routeFailureText(status: Exclude<CampusRouteQuery["status"], "ok">): string {
  switch (status) {
    case "same-location":
      return "شما همین‌جا هستید.";
    case "no-route":
      return "مسیر پیاده‌ای از این ورودی تا مقصد در داده‌های فعلی پیدا نشد.";
    case "no-data":
      return "داده‌های مسیریابی محوطه در دسترس نیست.";
    default:
      return "برای این ورودی یا مقصد داده‌ای برای مسیریابی ثبت نشده است.";
  }
}
