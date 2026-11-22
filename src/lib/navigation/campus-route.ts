import { MinHeap } from "./heap";
import { turnBetween } from "./directions";
import type { Turn } from "./types";

/**
 * Outdoor (campus-level) walking routes: shortest path on a visibility graph around polygonal obstacles
 * (buildings, sports areas, the pond — already inflated by the walking clearance). Pure geometry, no React/Three.js.
 *
 * Coordinates: meters, X east, Z south. The route is an APPROXIMATION: the site plan has no footpaths or building
 * doors, so people are assumed to walk freely over open ground and to reach a building's nearest face.
 */
export interface Pt {
  x: number;
  z: number;
}

export interface CampusObstacle {
  id: string;
  ring: readonly Pt[];
}

export type CampusGoal =
  /** reach the nearest point of this obstacle (door position unknown) */
  | { kind: "obstacle"; obstacleId: string }
  /** reach one exact point (e.g. a known door) */
  | { kind: "point"; point: Pt };

export interface CampusRouteLeg {
  from: Pt;
  to: Pt;
  /** meters */
  distance: number;
  /** turn made at `from` relative to the previous leg; null for the first leg or when almost straight */
  turn: Turn | null;
  /** obstacle whose corner `to` is (the route bends around it); null for the final leg */
  cornerOf: string | null;
}

export interface CampusRouteOk {
  status: "ok";
  points: Pt[];
  /** meters */
  length: number;
  /** seconds at WALKING_SPEED */
  durationSec: number;
  legs: CampusRouteLeg[];
  arrival: Pt;
}

export type CampusRouteFailure = { status: "unknown-goal" | "same-location" | "no-route" | "blocked-start" };
export type CampusRouteResult = CampusRouteOk | CampusRouteFailure;

/** m/s — relaxed pedestrian pace. */
export const WALKING_SPEED = 1.3;
const GOAL_SAMPLE_SPACING = 2.5;
/** how deep inside an obstacle a point must be to count as "inside" (tolerates points on the boundary) */
const BOUNDARY_TOL = 0.05;
/** a start point inside an obstacle by at most this much is nudged out instead of rejected */
const SNAP_LIMIT = 4;

const dist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.z - b.z);

function cross(o: Pt, a: Pt, b: Pt): number {
  return (a.x - o.x) * (b.z - o.z) - (a.z - o.z) * (b.x - o.x);
}

function distToSegment(p: Pt, a: Pt, b: Pt): number {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const len2 = dx * dx + dz * dz;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.z - a.z) * dz) / len2));
  return Math.hypot(p.x - (a.x + t * dx), p.z - (a.z + t * dz));
}

/** Ray-casting containment test that treats points within BOUNDARY_TOL of the outline as NOT inside. */
export function strictlyInside(p: Pt, ring: readonly Pt[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i]!;
    const b = ring[j]!;
    if (distToSegment(p, a, b) < BOUNDARY_TOL) return false;
    if (a.z > p.z !== b.z > p.z && p.x < ((b.x - a.x) * (p.z - a.z)) / (b.z - a.z) + a.x) inside = !inside;
  }
  return inside;
}

/** true when segment a-b passes through the interior of the polygon (touching or running along the outline is fine). */
export function segmentCrossesInterior(a: Pt, b: Pt, ring: readonly Pt[]): boolean {
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const c = ring[j]!;
    const d = ring[i]!;
    const d1 = cross(a, b, c);
    const d2 = cross(a, b, d);
    const d3 = cross(c, d, a);
    const d4 = cross(c, d, b);
    // proper crossing: strictly opposite sides on both lines (shared endpoints/touching give a zero and are ignored)
    if (((d1 > 1e-7 && d2 < -1e-7) || (d1 < -1e-7 && d2 > 1e-7)) && ((d3 > 1e-7 && d4 < -1e-7) || (d3 < -1e-7 && d4 > 1e-7))) {
      return true;
    }
  }
  // chords that only touch outline vertices (e.g. a rectangle's diagonal) are caught by sampling the segment
  for (const t of [0.1, 0.3, 0.5, 0.7, 0.9]) {
    if (strictlyInside({ x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t }, ring)) return true;
  }
  return false;
}

interface GNode extends Pt {
  /** obstacle this vertex belongs to (null for start / free points) */
  owner: string | null;
}

export interface CampusGraph {
  obstacles: readonly CampusObstacle[];
  nodes: GNode[];
  /** adjacency: node index -> [neighbour index, distance] */
  adj: [number, number][][];
}

const boxCache = new WeakMap<readonly Pt[], [number, number, number, number]>();
function ringBox(ring: readonly Pt[]): [number, number, number, number] {
  let box = boxCache.get(ring);
  if (!box) {
    box = [Infinity, Infinity, -Infinity, -Infinity];
    for (const p of ring) {
      box[0] = Math.min(box[0], p.x);
      box[1] = Math.min(box[1], p.z);
      box[2] = Math.max(box[2], p.x);
      box[3] = Math.max(box[3], p.z);
    }
    boxCache.set(ring, box);
  }
  return box;
}

function isBlocked(a: Pt, b: Pt, obstacles: readonly CampusObstacle[]): boolean {
  const minX = Math.min(a.x, b.x);
  const maxX = Math.max(a.x, b.x);
  const minZ = Math.min(a.z, b.z);
  const maxZ = Math.max(a.z, b.z);
  for (const o of obstacles) {
    const box = ringBox(o.ring);
    if (maxX < box[0] || minX > box[2] || maxZ < box[1] || minZ > box[3]) continue; // bounding boxes disjoint
    if (segmentCrossesInterior(a, b, o.ring)) return true;
  }
  return false;
}

function insideAny(p: Pt, obstacles: readonly CampusObstacle[]): boolean {
  return obstacles.some((o) => strictlyInside(p, o.ring));
}

/** Visibility graph over all obstacle corners that are not swallowed by another (inflated) obstacle. */
export function buildCampusGraph(obstacles: readonly CampusObstacle[]): CampusGraph {
  const nodes: GNode[] = [];
  for (const o of obstacles) {
    for (const p of o.ring) {
      if (insideAny(p, obstacles)) continue;
      nodes.push({ x: p.x, z: p.z, owner: o.id });
    }
  }
  const adj: [number, number][][] = nodes.map(() => []);
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const a = nodes[i]!;
      const b = nodes[j]!;
      if (isBlocked(a, b, obstacles)) continue;
      const d = dist(a, b);
      adj[i]!.push([j, d]);
      adj[j]!.push([i, d]);
    }
  }
  return { obstacles, nodes, adj };
}

/** Points spaced along an outline (always includes the corners). */
function sampleRing(ring: readonly Pt[], spacing: number): Pt[] {
  const out: Pt[] = [];
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i]!;
    const b = ring[(i + 1) % ring.length]!;
    const n = Math.max(1, Math.ceil(dist(a, b) / spacing));
    for (let k = 0; k < n; k++) out.push({ x: a.x + ((b.x - a.x) * k) / n, z: a.z + ((b.z - a.z) * k) / n });
  }
  return out;
}

/** If `p` lies inside an obstacle by a small margin, move it to the nearest point just outside. */
function snapOut(p: Pt, obstacles: readonly CampusObstacle[]): Pt | null {
  const host = obstacles.find((o) => strictlyInside(p, o.ring));
  if (!host) return p;
  let best: Pt | null = null;
  let bestD = Infinity;
  for (let i = 0; i < host.ring.length; i++) {
    const a = host.ring[i]!;
    const b = host.ring[(i + 1) % host.ring.length]!;
    const d = distToSegment(p, a, b);
    if (d < bestD) {
      const dx = b.x - a.x;
      const dz = b.z - a.z;
      const len2 = dx * dx + dz * dz || 1;
      const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.z - a.z) * dz) / len2));
      best = { x: a.x + t * dx, z: a.z + t * dz };
      bestD = d;
    }
  }
  if (!best || bestD > SNAP_LIMIT) return null;
  const out = { x: best.x, z: best.z };
  return insideAny(
    out,
    obstacles.filter((o) => o !== host),
  )
    ? null
    : out;
}

/**
 * Where to stop in front of a door: the point of the (inflated) obstacle ring nearest to the door that is not inside a
 * neighbouring obstacle. The caller then walks the last metre or two straight to the door (see `extendRoute`).
 */
export function doorApproach(graph: CampusGraph, obstacleId: string, door: Pt): Pt | null {
  const host = graph.obstacles.find((o) => o.id === obstacleId);
  if (!host) return null;
  const others = graph.obstacles.filter((o) => o !== host);
  let best: Pt | null = null;
  let bestD = Infinity;
  for (const p of sampleRing(host.ring, 0.25)) {
    const d = dist(p, door);
    if (d < bestD && !insideAny(p, others)) {
      best = p;
      bestD = d;
    }
  }
  return best;
}

/** Appends a final straight leg to `to` (e.g. from the approach point to the door itself). */
export function extendRoute(route: CampusRouteOk, to: Pt): CampusRouteOk {
  const from = route.arrival;
  const d = dist(from, to);
  if (d < 0.05) return route;
  const prev = route.points.length > 1 ? route.points[route.points.length - 2]! : null;
  const turn: Turn | null = prev ? turnBetween({ x: from.x - prev.x, z: from.z - prev.z }, { x: to.x - from.x, z: to.z - from.z }) : null;
  // the old final leg now ends at a corner-less bend: it keeps cornerOf = null (the arrival face), the new leg is the approach
  const length = route.length + d;
  return {
    ...route,
    points: [...route.points, { x: to.x, z: to.z }],
    length,
    durationSec: length / WALKING_SPEED,
    legs: [...route.legs, { from, to: { x: to.x, z: to.z }, distance: d, turn, cornerOf: null }],
    arrival: { x: to.x, z: to.z },
  };
}

/**
 * Shortest walking route from `start` to the goal. Returns language-neutral legs; Persian wording lives in
 * campus-route-fa.ts. `graph` may be cached by the caller (buildCampusGraph is the expensive part).
 */
export function findCampusRoute(graph: CampusGraph, start: Pt, goal: CampusGoal): CampusRouteResult {
  const { obstacles, nodes, adj } = graph;

  let goalPoints: Pt[];
  let goalObstacle: CampusObstacle | undefined;
  if (goal.kind === "point") {
    goalPoints = [goal.point];
  } else {
    goalObstacle = obstacles.find((o) => o.id === goal.obstacleId);
    if (!goalObstacle) return { status: "unknown-goal" };
    // sampled outline points, minus those that fall inside a neighbouring (overlapping) obstacle
    goalPoints = sampleRing(goalObstacle.ring, GOAL_SAMPLE_SPACING).filter(
      (p) =>
        !insideAny(
          p,
          obstacles.filter((o) => o !== goalObstacle),
        ),
    );
    if (goalPoints.length === 0) return { status: "no-route" };
  }

  const s = snapOut(start, obstacles);
  if (!s) return { status: "blocked-start" };
  if (goalObstacle && strictlyInside(s, goalObstacle.ring)) return { status: "same-location" };
  if (goalObstacle && goalPoints.some((g) => dist(g, s) < 0.5)) return { status: "same-location" };
  if (goal.kind === "point" && dist(goal.point, s) < 0.5) return { status: "same-location" };

  // temporary nodes: 0..n-1 graph nodes, then start, then goal samples
  const startIdx = nodes.length;
  const goalIdx0 = startIdx + 1;
  const total = goalIdx0 + goalPoints.length;
  const pos = (i: number): Pt => (i < nodes.length ? nodes[i]! : i === startIdx ? s : goalPoints[i - goalIdx0]!);
  const owner = (i: number): string | null => (i < nodes.length ? nodes[i]!.owner : null);

  // edges touching the temporary nodes: `extra` holds those of start/goal samples, `reverse` the mirrored ones on graph nodes
  const extra: [number, number][][] = Array.from({ length: total - nodes.length }, () => []);
  const reverse: [number, number][][] = Array.from({ length: nodes.length }, () => []);
  const link = (tmp: number, other: number) => {
    const d = dist(pos(tmp), pos(other));
    extra[tmp - nodes.length]!.push([other, d]);
    if (other < nodes.length) reverse[other]!.push([tmp, d]);
    else extra[other - nodes.length]!.push([tmp, d]);
  };
  for (let g = goalIdx0; g < total; g++) {
    const gp = pos(g);
    if (!isBlocked(s, gp, obstacles)) link(g, startIdx);
    for (let i = 0; i < nodes.length; i++) if (!isBlocked(nodes[i]!, gp, obstacles)) link(g, i);
  }
  for (let i = 0; i < nodes.length; i++) if (!isBlocked(s, nodes[i]!, obstacles)) link(startIdx, i);
  const nbrs = (i: number): [number, number][] => (i < nodes.length ? [...adj[i]!, ...reverse[i]!] : extra[i - nodes.length]!);

  // Dijkstra with early exit at the first goal sample popped
  const best = new Array<number>(total).fill(Infinity);
  const prev = new Array<number>(total).fill(-1);
  const heap = new MinHeap<number>();
  best[startIdx] = 0;
  heap.push(startIdx, 0);
  let reached = -1;

  while (heap.size > 0) {
    const top = heap.pop()!;
    const u = top.value;
    if (top.priority > best[u]!) continue;
    if (u >= goalIdx0) {
      reached = u;
      break;
    }
    for (const [v, d] of nbrs(u)) {
      const nd = best[u]! + d;
      if (nd < best[v]! - 1e-9) {
        best[v] = nd;
        prev[v] = u;
        heap.push(v, nd);
      }
    }
  }
  if (reached < 0) return { status: "no-route" };

  const chain: number[] = [];
  for (let c = reached; c !== -1; c = prev[c]!) chain.push(c);
  chain.reverse();

  // drop collinear intermediate points
  const kept: number[] = [chain[0]!];
  for (let k = 1; k < chain.length - 1; k++) {
    const a = pos(kept[kept.length - 1]!);
    const b = pos(chain[k]!);
    const c = pos(chain[k + 1]!);
    // drop b only when it lies on the straight line a-c AND that shortcut is really free (drift over many near-collinear
    // corners could otherwise cut across a building)
    if (Math.abs(cross(a, b, c)) / Math.max(dist(a, c), 1e-9) > 0.05 || isBlocked(a, c, obstacles)) kept.push(chain[k]!);
  }
  kept.push(chain[chain.length - 1]!);

  const points = kept.map((i) => ({ x: pos(i).x, z: pos(i).z }));
  const legs: CampusRouteLeg[] = [];
  let length = 0;
  for (let k = 1; k < points.length; k++) {
    const from = points[k - 1]!;
    const to = points[k]!;
    const d = dist(from, to);
    length += d;
    let turn: Turn | null = null;
    if (k > 1) {
      const p = points[k - 2]!;
      turn = turnBetween({ x: from.x - p.x, z: from.z - p.z }, { x: to.x - from.x, z: to.z - from.z });
    }
    legs.push({ from, to, distance: d, turn, cornerOf: k === points.length - 1 ? null : owner(kept[k]!) });
  }
  return { status: "ok", points, length, durationSec: length / WALKING_SPEED, legs, arrival: points[points.length - 1]! };
}
