"use client";
import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useLayoutEffect, useRef, type MutableRefObject, type ReactNode } from "react";
import type { Group } from "three";
import { damp } from "@/lib/model/layout";

/** Current (animated) vertical exploded-view offset of every floor, shared with the route connectors. */
export type FloorOffsets = MutableRefObject<Map<string, number>>;

const SETTLE_EPS = 0.002;

/**
 * Moves everything that belongs to one floor (geometry, labels, route segment, pins) together.
 * The offset is a visualisation value on top of the floor's real elevation: floors glide to `targetOffset`
 * with frame-rate independent damping, and the scene only renders frames while something is still moving.
 */
export function FloorGroup({
  floorId,
  targetOffset,
  offsets,
  children,
}: {
  floorId: string;
  targetOffset: number;
  offsets: FloorOffsets;
  children: ReactNode;
}) {
  const ref = useRef<Group>(null);
  const invalidate = useThree((s) => s.invalidate);
  const initial = useRef(targetOffset);

  // Start already in place (no slide-in from zero when the viewer opens exploded).
  useLayoutEffect(() => {
    if (ref.current) ref.current.position.y = initial.current;
    offsets.current.set(floorId, initial.current);
  }, [floorId, offsets]);

  useEffect(() => {
    invalidate(); // wake the demand-driven render loop when the target changes
  }, [targetOffset, invalidate]);

  useFrame((_, dt) => {
    const g = ref.current;
    if (!g) return;
    const next = damp(g.position.y, targetOffset, 8, Math.min(dt, 0.1));
    const settled = Math.abs(next - targetOffset) < SETTLE_EPS;
    g.position.y = settled ? targetOffset : next;
    offsets.current.set(floorId, g.position.y);
    if (!settled) invalidate();
  });

  return (
    <group ref={ref} name={`floor:${floorId}`}>
      {children}
    </group>
  );
}
