"use client";
import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import { ConeGeometry, MeshBasicMaterial, RingGeometry, SphereGeometry, type Mesh } from "three";
import { sceneColors } from "@/lib/theme/tokens";
import { SceneLabel } from "./SceneLabel";

const prefersReducedMotion = () =>
  typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * Map pin used for the route start (teal) and the selected destination (orange).
 * Drawn on top of walls (depthTest off) so it can never be hidden. The ring pulses; while a pin is on screen the
 * scene renders continuously, which is cheap for this small scene and is skipped for reduced-motion users.
 */
export function Pin({
  position,
  color,
  label,
  tone,
  name,
}: {
  position: [number, number, number];
  color: string;
  label?: string;
  tone: "start" | "destination";
  name: string;
}) {
  const invalidate = useThree((s) => s.invalidate);
  const ringRef = useRef<Mesh>(null);
  const reduced = useRef(prefersReducedMotion());

  const res = useMemo(
    () => ({
      cone: new ConeGeometry(0.5, 1.4, 20),
      head: new SphereGeometry(0.42, 20, 16),
      ring: new RingGeometry(0.8, 1.0, 40),
      pin: new MeshBasicMaterial({ color, depthTest: false }),
      white: new MeshBasicMaterial({ color: sceneColors.routeCasing, depthTest: false }),
      ringMat: new MeshBasicMaterial({ color, transparent: true, opacity: 0.55, depthTest: false }),
    }),
    [color],
  );
  useEffect(
    () => () => {
      for (const r of Object.values(res)) r.dispose();
    },
    [res],
  );

  useFrame(({ clock }) => {
    const ring = ringRef.current;
    if (!ring || reduced.current) return;
    const t = (clock.elapsedTime % 1.6) / 1.6;
    ring.scale.setScalar(1 + t * 1.5);
    (ring.material as MeshBasicMaterial).opacity = 0.55 * (1 - t);
    invalidate();
  });

  const [x, y, z] = position;
  return (
    <group name={name} position={[x, y, z]}>
      <mesh ref={ringRef} geometry={res.ring} material={res.ringMat} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.25, 0]} renderOrder={21} raycast={() => null} />
      <mesh geometry={res.cone} material={res.pin} rotation={[Math.PI, 0, 0]} position={[0, 0.9, 0]} renderOrder={22} raycast={() => null} />
      <mesh geometry={res.head} material={res.pin} position={[0, 1.95, 0]} renderOrder={22} raycast={() => null} />
      <mesh geometry={res.head} material={res.white} scale={0.38} position={[0, 1.95, 0]} renderOrder={23} raycast={() => null} />
      {label && (
        <SceneLabel position={[0, 3.3, 0]} tone={tone}>
          {label}
        </SceneLabel>
      )}
    </group>
  );
}
