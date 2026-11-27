import type { DirectionStep, NavGraph, RouteSuccess, Turn } from "./types";

/**
 * Turns a route into language-neutral, structured steps. Persian wording lives in directions-fa.ts.
 *
 * Handedness: in plan view with +X to the right (east) and +Z towards the bottom (south), a positive
 * cross product h1.x*h2.z - h1.z*h2.x is a clockwise (right) turn for someone walking along h1.
 * Example: heading north (0,-1) then east (1,0) -> cross = 0*0 - (-1)*1 = +1 -> right.
 */
const STRAIGHT_LIMIT_DEG = 35;
const U_TURN_DEG = 150;

export function turnBetween(h1: { x: number; z: number }, h2: { x: number; z: number }): Turn | null {
  const dot = h1.x * h2.x + h1.z * h2.z;
  const cross = h1.x * h2.z - h1.z * h2.x;
  const angle = (Math.atan2(Math.abs(cross), dot) * 180) / Math.PI; // 0..180
  if (angle < STRAIGHT_LIMIT_DEG) return null;
  if (angle >= U_TURN_DEG) return "u-turn";
  return cross > 0 ? "right" : "left";
}

export function buildDirections(graph: NavGraph, route: RouteSuccess): DirectionStep[] {
  const steps: DirectionStep[] = [];
  const first = route.nodes[0]!;
  steps.push({ kind: "start", nodeId: first.id, floorId: first.floorId });

  type Walk = { floorId: string; distance: number; turn: Turn | null; fromNodeId: string; toNodeId: string };
  let walk: Walk | null = null;
  let heading: { x: number; z: number } | null = null;

  const flush = () => {
    if (walk && walk.distance > 0) steps.push({ kind: "walk", ...walk });
    walk = null;
  };

  for (const t of route.traversals) {
    const a = graph.nodes.get(t.from)!;
    const b = graph.nodes.get(t.to)!;
    const vertical = t.edge.edgeType === "stairs" || t.edge.edgeType === "elevator";

    if (vertical && a.floorId !== b.floorId) {
      flush();
      steps.push({
        kind: "transfer",
        via: t.edge.edgeType === "stairs" ? "stairs" : "elevator",
        direction: b.y > a.y ? "up" : "down",
        fromFloorId: a.floorId,
        toFloorId: b.floorId,
        fromNodeId: a.id,
        toNodeId: b.id,
        accessible: t.edge.accessible && t.edge.edgeType !== "stairs",
      });
      heading = null; // the walker's orientation after a staircase / lift is unknown
      continue;
    }

    if (t.edge.edgeType === "bridge") {
      flush();
      steps.push({ kind: "bridge", floorId: a.floorId, distance: t.edge.distance, fromNodeId: a.id, toNodeId: b.id });
      heading = { x: b.x - a.x, z: b.z - a.z };
      continue;
    }

    const h = { x: b.x - a.x, z: b.z - a.z };
    const length = Math.hypot(h.x, h.z);
    if (length === 0) {
      // purely vertical movement inside a floor (e.g. a ramp): no new instruction
      if (walk) walk.toNodeId = b.id;
      continue;
    }

    const turn = heading ? turnBetween(heading, h) : null;
    if (!walk || turn) {
      flush();
      walk = { floorId: a.floorId, distance: 0, turn, fromNodeId: a.id, toNodeId: b.id };
    }
    walk.distance += t.edge.distance;
    walk.toNodeId = b.id;
    heading = h;
  }
  flush();

  const last = route.nodes[route.nodes.length - 1]!;
  steps.push({ kind: "arrive", nodeId: last.id, floorId: last.floorId });
  return steps;
}
