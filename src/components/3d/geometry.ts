import { BoxGeometry, type BufferGeometry } from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import type { BoxSpec } from "@/lib/model/procedural";

/**
 * Merges many axis-aligned boxes into ONE BufferGeometry (one draw call instead of hundreds).
 * Returns null for an empty list. The caller owns the result and must dispose() it.
 */
export function mergeBoxes(boxes: readonly BoxSpec[]): BufferGeometry | null {
  if (boxes.length === 0) return null;
  const parts = boxes.map((b) => new BoxGeometry(b.w, b.h, b.d).translate(b.x, b.y, b.z));
  const merged = mergeGeometries(parts, false);
  for (const p of parts) p.dispose();
  return merged;
}

/**
 * "Cutaway" walls: keep the footprint but lower the wall height so rooms stay readable from an isometric
 * camera. Walls start at the floor elevation, so only height and centre-Y change.
 */
export function cutBoxes(boxes: readonly BoxSpec[], elevation: number, factor: number): BoxSpec[] {
  if (factor >= 0.999) return [...boxes];
  return boxes.map((b) => {
    const h = b.h * factor;
    return { ...b, h, y: elevation + h / 2 };
  });
}

export const WALL_CUTAWAY_FACTOR = 0.4;
