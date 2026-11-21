import type { Campus } from "@/lib/data/types";
import type { BoundsLike } from "./layout";

/**
 * Pure geometry for the procedural campus scene (no Three.js import, unit-tested).
 * Coordinates follow the shared convention: meters, X and Z horizontal, Y up.
 */
export interface PathSegment {
  /** centre of the segment on the ground plane */
  x: number;
  z: number;
  length: number;
  width: number;
  /** rotation about Y so a box of `length` along X lines up with the segment */
  angle: number;
}

/** Turn a polyline into rectangles (one per leg). Zero-length legs are skipped. */
export function pathSegments(points: readonly { x: number; z: number }[], width: number): PathSegment[] {
  const out: PathSegment[] = [];
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]!;
    const b = points[i]!;
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const length = Math.hypot(dx, dz);
    if (length < 1e-6) continue;
    // rotation.y = -atan2(dz, dx) maps the box's +X axis onto the segment direction (Three.js is right-handed)
    out.push({ x: (a.x + b.x) / 2, z: (a.z + b.z) / 2, length, width, angle: -Math.atan2(dz, dx) });
  }
  return out;
}

export const CAMPUS_BUILDING_COLORS = {
  pilot: "#183a68",
  other: "#c3ccd9",
  roof: "#10294d",
} as const;

/** Bounds used to frame the default campus view. */
export function campusBounds(campus: Campus): BoundsLike {
  const hx = campus.ground.width / 2;
  const hz = campus.ground.depth / 2;
  const tallest = Math.max(0, ...campus.buildings.map((b) => b.size.height));
  return { min: { x: -hx * 0.8, y: 0, z: -hz * 0.8 }, max: { x: hx * 0.8, y: tallest, z: hz * 0.8 } };
}

export type CampusBuilding = Campus["buildings"][number];

/** Stable key used for selection and hover on the campus map. */
export function campusKey(b: CampusBuilding): string {
  return b.id ?? b.slug ?? b.label;
}

/** The campus entry for a selection key (see campusKey). */
export function findCampusBuilding(campus: Campus, key: string | null): CampusBuilding | null {
  if (!key) return null;
  return campus.buildings.find((b) => campusKey(b) === key) ?? null;
}

/**
 * Outline for THREE.Shape. A Shape lives in the XY plane and the mesh is rotated by -90 degrees about X so the
 * extrusion points up: that maps shape (sx, sy) to world (sx, ., -sy). To land on world z we therefore feed -z.
 */
export function footprintShapePoints(footprint: readonly { x: number; z: number }[]): [number, number][] {
  return footprint.map((p) => [p.x, -p.z]);
}

/** Absolute polygon area (m^2) by the shoelace formula. */
export function footprintArea(footprint: readonly { x: number; z: number }[]): number {
  let sum = 0;
  for (let i = 0; i < footprint.length; i++) {
    const a = footprint[i]!;
    const b = footprint[(i + 1) % footprint.length]!;
    sum += a.x * b.z - b.x * a.z;
  }
  return Math.abs(sum) / 2;
}

/**
 * Flat polylines ([x0, z0, x1, z1, ...]) -> a vertex buffer for THREE.LineSegments at height y
 * (each leg becomes a separate segment so one draw call covers a whole layer).
 */
export function polylinesToSegmentPositions(polylines: readonly (readonly number[])[], y: number): Float32Array {
  let legs = 0;
  for (const p of polylines) legs += Math.max(0, p.length / 2 - 1);
  const out = new Float32Array(legs * 6);
  let o = 0;
  for (const p of polylines) {
    for (let i = 2; i + 1 < p.length; i += 2) {
      out[o++] = p[i - 2]!;
      out[o++] = y;
      out[o++] = p[i - 1]!;
      out[o++] = p[i]!;
      out[o++] = y;
      out[o++] = p[i + 1]!;
    }
  }
  return out;
}
