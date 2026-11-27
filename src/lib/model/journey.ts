import type { Lookups } from "@/lib/data/lookups";
import type { Campus, NavigatorData, Room } from "@/lib/data/types";
import { buildDirections, computeRoute, describeStep, type DirectionContext, type NavGraph, type RouteSuccess } from "@/lib/navigation";
import { WALKING_SPEED, type CampusRouteOk } from "@/lib/navigation/campus-route";
import { describeCampusRoute, routeFromEntrance } from "./campus-nav";
import { roomTitle } from "./places";

/**
 * One continuous walk from a university gate to a room: outdoors across the yard to the door of an entrance building,
 * then indoors (stairs, corridors, sky bridges) to the room. The entrance building with the shortest total walk is chosen,
 * so a room in building 2 (which has no street door) is reached through building 1 or 3 and a sky bridge. A room in a building
 * that has its own street door always uses that door.
 */
export type JourneyStepKind = "start" | "walk" | "enter" | "stairs" | "bridge" | "arrive";

export interface JourneyStep {
  kind: JourneyStepKind;
  scope: "outdoor" | "indoor";
  text: string;
}

export interface Journey {
  status: "ok";
  gateId: string;
  room: Room;
  entryBuildingId: string;
  outdoor: CampusRouteOk;
  indoor: RouteSuccess;
  steps: JourneyStep[];
  /** meters, outdoors + indoors */
  totalMeters: number;
  outdoorMeters: number;
  indoorMeters: number;
  durationSec: number;
  /** the indoor path as 3D points (x, elevation, z) */
  indoorPoints: { x: number; y: number; z: number }[];
  /** campus building ids the walk passes through (entrance building first) */
  buildingIds: string[];
  /** ids of sky bridges crossed */
  usesBridge: boolean;
}

export type JourneyFailure = { status: "unknown-room" | "no-door" | "no-entrance" | "no-route" | "unknown-gate" };
export type JourneyResult = Journey | JourneyFailure;

export function planJourney(
  data: NavigatorData,
  lookups: Lookups,
  graph: NavGraph,
  campus: Campus,
  gateId: string,
  roomId: string,
  options: { accessibleOnly?: boolean } = {},
): JourneyResult {
  const room = lookups.roomsById.get(roomId);
  if (!room) return { status: "unknown-room" };
  if (!room.doorNodeId) return { status: "no-door" };
  if (!(campus.entrances ?? []).some((g) => g.id === gateId)) return { status: "unknown-gate" };

  // A room is entered through its own building's street door when that building has one (a few metres saved by cutting
  // through a neighbour and two sky bridges is not a better walk). Only a building without a street door (building 2)
  // is reached through another entrance building and a bridge, choosing the shortest total walk.
  const roomBuildingId = lookups.floorsById.get(room.floorId)?.buildingId;
  const ownDoor = data.entrances.some((e) => e.nodeId && e.buildingId === roomBuildingId);

  let best: { entranceBuildingId: string; outdoor: CampusRouteOk; indoor: RouteSuccess } | null = null;
  let sawEntrance = false;
  for (const e of data.entrances) {
    if (!e.nodeId) continue;
    if (ownDoor && e.buildingId !== roomBuildingId) continue;
    sawEntrance = true;
    const out = routeFromEntrance(campus, gateId, e.buildingId);
    if (out.status !== "ok") continue;
    const inn = computeRoute(graph, e.nodeId, room.doorNodeId, { accessibleOnly: options.accessibleOnly });
    if (inn.status !== "ok") continue;
    if (!best || out.route.length + inn.totalDistance < best.outdoor.length + best.indoor.totalDistance) {
      best = { entranceBuildingId: e.buildingId, outdoor: out.route, indoor: inn };
    }
  }
  if (!best) return { status: sawEntrance ? "no-route" : "no-entrance" };

  const entryBuilding = lookups.buildingsById.get(best.entranceBuildingId);
  const outQuery = routeFromEntrance(campus, gateId, best.entranceBuildingId);
  const outSteps = outQuery.status === "ok" ? describeCampusRoute(campus, outQuery).filter((s) => s.kind !== "arrive") : [];

  const ctx: DirectionContext = {
    node: (id) => graph.nodes.get(id),
    nodeName: (id) => {
      const r = lookups.roomByDoorNode.get(id);
      return r ? roomTitle(r, lookups) : (graph.nodes.get(id)?.label ?? id);
    },
    floorName: (id) => lookups.floorsById.get(id)?.displayName ?? id,
    buildingName: (id) => lookups.buildingsById.get(id)?.name ?? id,
  };
  const steps: JourneyStep[] = outSteps.map((s) => ({ kind: s.kind === "start" ? "start" : "walk", scope: "outdoor", text: s.text }));
  steps.push({ kind: "enter", scope: "indoor", text: `از در وارد ${entryBuilding?.name ?? "ساختمان"} شوید` });
  for (const step of buildDirections(graph, best.indoor)) {
    if (step.kind === "start") continue;
    const kind: JourneyStepKind = step.kind === "transfer" ? "stairs" : step.kind;
    steps.push({ kind, scope: "indoor", text: describeStep(step, ctx) });
  }

  const indoorPoints = best.indoor.nodes.map((n) => ({ x: n.x, y: n.y, z: n.z }));
  const buildingIds = best.indoor.nodes.map((n) => n.buildingId).filter((b, i, a) => i === 0 || b !== a[i - 1]);
  const total = best.outdoor.length + best.indoor.totalDistance;
  return {
    status: "ok",
    gateId,
    room,
    entryBuildingId: best.entranceBuildingId,
    outdoor: best.outdoor,
    indoor: best.indoor,
    steps,
    totalMeters: total,
    outdoorMeters: best.outdoor.length,
    indoorMeters: best.indoor.totalDistance,
    durationSec: total / WALKING_SPEED,
    indoorPoints,
    buildingIds,
    usesBridge: best.indoor.traversals.some((t) => t.edge.edgeType === "bridge"),
  };
}

export function journeyFailureText(status: JourneyFailure["status"]): string {
  switch (status) {
    case "no-door":
      return "مسیر این اتاق هنوز ثبت نشده است.";
    case "no-entrance":
      return "ورودی ساختمان این اتاق در داده‌ها ثبت نشده است.";
    case "no-route":
      return "مسیری از درب دانشگاه تا این اتاق پیدا نشد.";
    default:
      return "برای این مقصد داده‌ای برای مسیریابی ثبت نشده است.";
  }
}
