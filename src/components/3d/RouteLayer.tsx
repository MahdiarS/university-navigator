"use client";
import { Line } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import { CylinderGeometry, MeshBasicMaterial, Quaternion, Vector3, type Group, type Mesh } from "three";
import type { RouteSegmentGeometry, TransferGeometry } from "@/lib/model/routeGeometry";
import { sceneColors } from "@/lib/theme/tokens";
import type { FloorOffsets } from "./FloorGroup";
import { SceneLabel } from "./SceneLabel";

/**
 * One floor's part of the route: a white casing under a blue core, drawn above the walking surface and always on
 * top (depthTest off) so walls never hide it. Lives inside the floor's group, so it follows the exploded view.
 */
export function FloorRoute({ segment }: { segment: RouteSegmentGeometry }) {
  if (segment.points.length < 2) return null;
  return (
    <group name={`route:${segment.floorId}`}>
      <Line points={segment.points} color={sceneColors.routeCasing} lineWidth={9} depthTest={false} renderOrder={18} transparent raycast={() => null} />
      <Line points={segment.points} color={sceneColors.route} lineWidth={5} depthTest={false} renderOrder={19} transparent raycast={() => null} />
    </group>
  );
}

const UP = new Vector3(0, 1, 0);

/**
 * The vertical hop between two floors (stairs / elevator). It is an explicit connector between the two transfer
 * points, re-computed every frame from the floors' current offsets, so it stays attached while floors glide apart
 * and is never drawn as a line through walls.
 */
export function TransferConnector({ transfer, offsets, labels }: { transfer: TransferGeometry; offsets: FloorOffsets; labels?: boolean }) {
  const invalidate = useThree((s) => s.invalidate);
  const meshRef = useRef<Mesh>(null);
  const labelRef = useRef<Group>(null);
  const res = useMemo(
    () => ({
      geo: new CylinderGeometry(0.16, 0.16, 1, 10),
      mat: new MeshBasicMaterial({ color: transfer.via === "elevator" ? sceneColors.elevator : sceneColors.route, depthTest: false, transparent: true, opacity: 0.9 }),
      a: new Vector3(),
      b: new Vector3(),
      dir: new Vector3(),
      q: new Quaternion(),
    }),
    [transfer.via],
  );
  useEffect(
    () => () => {
      res.geo.dispose();
      res.mat.dispose();
    },
    [res],
  );

  useFrame(() => {
    const m = meshRef.current;
    if (!m) return;
    const offA = offsets.current.get(transfer.fromFloorId) ?? 0;
    const offB = offsets.current.get(transfer.toFloorId) ?? 0;
    res.a.set(transfer.from.x, transfer.from.y + offA + 0.18, transfer.from.z);
    res.b.set(transfer.to.x, transfer.to.y + offB + 0.18, transfer.to.z);
    res.dir.subVectors(res.b, res.a);
    const len = res.dir.length();
    if (len < 1e-4) return;
    m.position.copy(res.a).addScaledVector(res.dir, 0.5);
    m.scale.set(1, len, 1);
    m.quaternion.copy(res.q.setFromUnitVectors(UP, res.dir.normalize()));
    labelRef.current?.position.set(res.b.x, res.b.y + 2.2, res.b.z);
    invalidate();
  });

  const text = transfer.via === "elevator" ? "آسانسور" : "راه‌پله";
  const arrow = transfer.to.y > transfer.from.y ? "↑" : "↓";
  return (
    <group name={`transfer:${transfer.fromFloorId}->${transfer.toFloorId}`}>
      <mesh ref={meshRef} geometry={res.geo} material={res.mat} renderOrder={20} raycast={() => null} />
      {labels && (
        <group ref={labelRef}>
          <SceneLabel position={[0, 0, 0]} tone="info">
            {text} {arrow}
          </SceneLabel>
        </group>
      )}
    </group>
  );
}
