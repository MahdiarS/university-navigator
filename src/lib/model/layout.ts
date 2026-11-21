import type { Floor } from "@/lib/data/types";

/**
 * Pure layout helpers for the building viewer (no React / Three.js imports, so they are unit-testable).
 *
 * "Exploded view": floors are lifted by a VISUALISATION offset on top of their real elevation.
 * offset(floor) = rank(floor) * explodeDistance, where rank 0 is the lowest floor. The ground floor
 * therefore stays at the base and floor order is preserved. The offset is NOT a real elevation, so the
 * navigation graph and room coordinates never include it.
 */
export const DEFAULT_EXPLODE_DISTANCE = 6;
export const MIN_EXPLODE_DISTANCE = 0;
export const MAX_EXPLODE_DISTANCE = 14;

export type OtherFloorsMode = "ghost" | "hide";
export type FloorVisibility = "solid" | "ghost" | "hidden";

export const sortFloors = (floors: readonly Floor[]): Floor[] =>
  [...floors].sort((a, b) => a.floorNumber - b.floorNumber || a.elevation - b.elevation);

/** Vertical visualisation offset for each floor (meters). */
export function explodeOffsets(floors: readonly Floor[], distance: number): Map<string, number> {
  const d = Math.min(MAX_EXPLODE_DISTANCE, Math.max(MIN_EXPLODE_DISTANCE, distance));
  const map = new Map<string, number>();
  sortFloors(floors).forEach((f, rank) => map.set(f.id, rank * d));
  return map;
}

export function floorVisibility(
  floorId: string,
  activeFloorId: string | "all",
  otherFloors: OtherFloorsMode,
): FloorVisibility {
  if (activeFloorId === "all" || activeFloorId === floorId) return "solid";
  return otherFloors === "ghost" ? "ghost" : "hidden";
}

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface BoundsLike {
  min: Vec3;
  max: Vec3;
}

export function boundsOfPoints(points: readonly Vec3[]): BoundsLike | null {
  if (points.length === 0) return null;
  const min = { x: Infinity, y: Infinity, z: Infinity };
  const max = { x: -Infinity, y: -Infinity, z: -Infinity };
  for (const p of points) {
    min.x = Math.min(min.x, p.x);
    min.y = Math.min(min.y, p.y);
    min.z = Math.min(min.z, p.z);
    max.x = Math.max(max.x, p.x);
    max.y = Math.max(max.y, p.y);
    max.z = Math.max(max.z, p.z);
  }
  return { min, max };
}

export const boundsCenter = (b: BoundsLike): Vec3 => ({
  x: (b.min.x + b.max.x) / 2,
  y: (b.min.y + b.max.y) / 2,
  z: (b.min.z + b.max.z) / 2,
});

export const boundsRadius = (b: BoundsLike): number =>
  Math.hypot(b.max.x - b.min.x, b.max.y - b.min.y, b.max.z - b.min.z) / 2;

/**
 * Orthographic zoom (pixels per world unit) that fits a bounding sphere of `radius` inside the
 * smaller viewport dimension, with a margin. Zoom is clamped to a sensible range.
 */
export function fitZoom(radius: number, viewportMinPx: number, margin = 1.15, min = 4, max = 120): number {
  if (radius <= 0 || viewportMinPx <= 0) return min;
  return Math.min(max, Math.max(min, viewportMinPx / (2 * radius * margin)));
}

/** Direction of the default isometric camera (true isometric: equal angles to all three axes). */
export const ISO_DIRECTION: Vec3 = { x: 1, y: 1, z: 1 };

export function isoCameraPosition(target: Vec3, distance: number): Vec3 {
  const len = Math.hypot(ISO_DIRECTION.x, ISO_DIRECTION.y, ISO_DIRECTION.z);
  return {
    x: target.x + (ISO_DIRECTION.x / len) * distance,
    y: target.y + (ISO_DIRECTION.y / len) * distance,
    z: target.z + (ISO_DIRECTION.z / len) * distance,
  };
}

/** Exponential smoothing helper (frame-rate independent). Returns the new value. */
export function damp(current: number, target: number, lambda: number, dt: number): number {
  return current + (target - current) * (1 - Math.exp(-lambda * dt));
}
