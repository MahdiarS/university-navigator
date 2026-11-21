import type { Room } from "@/lib/data/types";
import type { RouteSuccess } from "@/lib/navigation";
import type { BoundsLike, Vec3 } from "./layout";
import { boundsOfPoints } from "./layout";

/**
 * Converts a computed route into render-ready geometry, independent of Three.js.
 *
 * Each floor segment is drawn INSIDE its floor group (so it follows the exploded-view offset).
 * Vertical transfers are NOT drawn as a line through walls: they become "transfer connectors" between the
 * transfer nodes of two floors, which the 3D layer stretches across the (possibly exploded) gap.
 */
export const ROUTE_LIFT = 0.18; // lift the line slightly above the walking surface to avoid z-fighting

export interface RouteSegmentGeometry {
  floorId: string;
  /** points in building coordinates (already lifted by ROUTE_LIFT) */
  points: [number, number, number][];
}

export interface TransferGeometry {
  via: "stairs" | "elevator";
  accessible: boolean;
  fromFloorId: string;
  toFloorId: string;
  /** base position on the lower/upper floor, building coordinates */
  from: Vec3;
  to: Vec3;
}

export interface RouteGeometry {
  segments: RouteSegmentGeometry[];
  transfers: TransferGeometry[];
  start: { floorId: string; position: Vec3 };
  goal: { floorId: string; position: Vec3 };
}

const lifted = (v: { x: number; y: number; z: number }): [number, number, number] => [v.x, v.y + ROUTE_LIFT, v.z];

/**
 * @param destinationRoom when given, the last segment is extended from the room door to the room centre
 *                        so the route visibly ends INSIDE the destination.
 */
export function buildRouteGeometry(route: RouteSuccess, destinationRoom?: Room | null): RouteGeometry {
  const byId = new Map(route.nodes.map((n) => [n.id, n]));
  const segments: RouteSegmentGeometry[] = route.segments.map((s) => ({
    floorId: s.floorId,
    points: s.nodeIds.map((id) => lifted(byId.get(id)!)),
  }));

  const lastSegment = segments[segments.length - 1]!;
  const goalNode = route.nodes[route.nodes.length - 1]!;
  let goalPos: Vec3 = { x: goalNode.x, y: goalNode.y, z: goalNode.z };
  if (destinationRoom && destinationRoom.floorId === goalNode.floorId) {
    goalPos = { x: destinationRoom.positionX, y: destinationRoom.positionY, z: destinationRoom.positionZ };
    lastSegment.points.push(lifted(goalPos));
  }

  const transfers: TransferGeometry[] = route.transfers.map((t) => {
    const a = byId.get(t.fromNodeId)!;
    const b = byId.get(t.toNodeId)!;
    return {
      via: t.via,
      accessible: t.accessible,
      fromFloorId: t.fromFloorId,
      toFloorId: t.toFloorId,
      from: { x: a.x, y: a.y, z: a.z },
      to: { x: b.x, y: b.y, z: b.z },
    };
  });

  const first = route.nodes[0]!;
  return {
    segments,
    transfers,
    start: { floorId: first.floorId, position: { x: first.x, y: first.y, z: first.z } },
    goal: { floorId: goalNode.floorId, position: goalPos },
  };
}

/** Bounds of the whole route including the per-floor exploded-view offsets (for camera focus). */
export function routeBounds(geometry: RouteGeometry, floorOffsets: ReadonlyMap<string, number>): BoundsLike | null {
  const pts: Vec3[] = [];
  for (const s of geometry.segments) {
    const off = floorOffsets.get(s.floorId) ?? 0;
    for (const [x, y, z] of s.points) pts.push({ x, y: y + off, z });
  }
  return boundsOfPoints(pts);
}
