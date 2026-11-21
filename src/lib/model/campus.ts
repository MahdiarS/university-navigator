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

/** The building that can be opened, matched by slug. */
export function findCampusBuilding(campus: Campus, slug: string | null) {
  if (!slug) return null;
  return campus.buildings.find((b) => b.slug === slug) ?? null;
}
