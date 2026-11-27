"use client";
import { Line } from "@react-three/drei";
import { useThree } from "@react-three/fiber";
import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import {
  BoxGeometry,
  Color,
  CylinderGeometry,
  ExtrudeGeometry,
  InstancedMesh,
  MeshStandardMaterial,
  Object3D,
  Shape,
  SphereGeometry,
  Vector2,
} from "three";
import type { Interiors, SkyBridge } from "@/lib/data/types";
import { footprintShapePoints, pathSegments } from "@/lib/model/campus";
import { colors, sceneColors } from "@/lib/theme/tokens";
import { SceneLabel } from "./SceneLabel";

type XZ = { x: number; z: number };

export interface InteriorRoomLabel {
  roomId: string;
  x: number;
  z: number;
  text: string;
}

export interface CampusInteriorProps {
  interiors: Interiors;
  /** building ids (campus-bN) whose first floor is shown (the upper storeys and the roof are cut away) */
  openBuildingIds: ReadonlySet<string>;
  /** building ids whose room numbers are labelled */
  labelBuildingIds: ReadonlySet<string>;
  /** where the doors of rooms are: walls leave a gap there */
  doors: readonly XZ[];
  labels: readonly InteriorRoomLabel[];
  selectedRoomId: string | null;
  destinationRoomId: string | null;
  hoveredRoomId: string | null;
  onHoverRoom: (roomId: string | null) => void;
  onSelectRoom: (roomId: string) => void;
  /** walking route inside the buildings and over the bridges (x, elevation, z) */
  route: readonly { x: number; y: number; z: number }[] | null;
}

const WALL_H = 2.5;
const WALL_T = 0.16;
const DOOR_GAP = 1.1;
const none = () => null;

const std = (color: string, extra: ConstructorParameters<typeof MeshStandardMaterial>[0] = {}) =>
  new MeshStandardMaterial({ color: new Color(color), roughness: 0.85, metalness: 0.03, ...extra });

const KIND_COLOR: Record<string, string> = {
  office: "#f3e7cb",
  classroom: "#dfe9d3",
  lab: "#cfe2ec",
  meeting: "#e3d8ee",
  study: "#e3d8ee",
  library: "#e3d8ee",
  lobby: "#bfe5dd",
  restroom: "#c9d9f2",
  hall: "#f4dcc0",
  other: "#e6e2da",
};

const shapeOf = (poly: readonly XZ[]) => new Shape(footprintShapePoints(poly).map(([x, y]) => new Vector2(x, y)));

/** Wall pieces along a ring, leaving a gap wherever a door sits on the edge. */
function wallPieces(ring: readonly XZ[], doors: readonly XZ[]): { a: XZ; b: XZ }[] {
  const out: { a: XZ; b: XZ }[] = [];
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i]!;
    const b = ring[(i + 1) % ring.length]!;
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const len = Math.hypot(dx, dz);
    if (len < 0.05) continue;
    const ux = dx / len;
    const uz = dz / len;
    // doors lying on this edge, as distances along it
    const cuts: number[] = [];
    for (const d of doors) {
      const t = (d.x - a.x) * ux + (d.z - a.z) * uz;
      const off = Math.abs((d.x - a.x) * -uz + (d.z - a.z) * ux);
      if (off < 0.35 && t > 0 && t < len) cuts.push(t);
    }
    cuts.sort((p, q) => p - q);
    let from = 0;
    for (const t of cuts) {
      const lo = Math.max(from, t - DOOR_GAP / 2);
      if (lo > from + 0.05) out.push({ a: { x: a.x + ux * from, z: a.z + uz * from }, b: { x: a.x + ux * lo, z: a.z + uz * lo } });
      from = Math.min(len, t + DOOR_GAP / 2);
    }
    if (len - from > 0.05) out.push({ a: { x: a.x + ux * from, z: a.z + uz * from }, b: b });
  }
  return out;
}

/**
 * First-floor interiors of the buildings that have an indoor map (rooms, corridors, walls with door gaps), the
 * enclosed sky bridges between them and the walking route inside. Geometry comes from data/indoor/interiors.json.
 */
export function CampusInterior(props: CampusInteriorProps) {
  const {
    interiors,
    openBuildingIds,
    labelBuildingIds,
    doors,
    labels,
    selectedRoomId,
    destinationRoomId,
    hoveredRoomId,
    onHoverRoom,
    onSelectRoom,
    route,
  } = props;
  const invalidate = useThree((s) => s.invalidate);

  const res = useMemo(() => {
    const kinds: Record<string, MeshStandardMaterial> = {};
    for (const [k, c] of Object.entries(KIND_COLOR)) kinds[k] = std(c, { roughness: 0.95 });
    return {
      unit: new BoxGeometry(1, 1, 1),
      post: new CylinderGeometry(0.22, 0.22, 1, 10),
      joint: new SphereGeometry(1, 14, 10),
      kinds,
      corridor: std("#faf8f3", { roughness: 0.95 }),
      wall: std("#fdfcf8"),
      wallOuter: std("#e6dfd1"),
      hover: std("#a9c7f2", { emissive: new Color(colors.blue600), emissiveIntensity: 0.15 }),
      selected: std("#7fb0f0", { emissive: new Color(colors.blue600), emissiveIntensity: 0.25 }),
      destination: std("#ffb267", { emissive: new Color(colors.orange500), emissiveIntensity: 0.35 }),
      bridgeFloor: std("#9aa4b3"),
      bridgeGlass: std("#7fb7d8", { transparent: true, opacity: 0.38, roughness: 0.15, metalness: 0.2, depthWrite: false }),
      bridgeFrame: std("#f4f1ea"),
      post_: std("#8f98a6"),
      routeCasing: std("#ffffff"),
      routeCore: std(sceneColors.route, { emissive: new Color(sceneColors.route), emissiveIntensity: 0.4 }),
      beacon: std(colors.orange500, { emissive: new Color(colors.orange500), emissiveIntensity: 0.4 }),
    };
  }, []);
  useEffect(
    () => () => {
      res.unit.dispose();
      res.post.dispose();
      res.joint.dispose();
      for (const m of Object.values(res.kinds)) m.dispose();
      for (const [k, v] of Object.entries(res))
        if (k !== "kinds" && k !== "unit" && k !== "post" && k !== "joint") (v as MeshStandardMaterial).dispose();
    },
    [res],
  );

  const open = useMemo(() => interiors.floors.filter((f) => openBuildingIds.has(f.buildingId)), [interiors.floors, openBuildingIds]);

  // room floor shapes (one geometry per room, rebuilt only when the floors shown change)
  const roomGeoms = useMemo(() => {
    const m = new Map<string, ExtrudeGeometry>();
    for (const f of open)
      for (const r of f.rooms) m.set(r.roomId, new ExtrudeGeometry(shapeOf(r.polygon), { depth: 0.1, bevelEnabled: false }));
    return m;
  }, [open]);
  const corridorGeoms = useMemo(
    () => open.map((f) => f.corridors.map((c) => new ExtrudeGeometry(shapeOf(c), { depth: 0.1, bevelEnabled: false }))),
    [open],
  );
  useEffect(
    () => () => {
      roomGeoms.forEach((g) => g.dispose());
      corridorGeoms.flat().forEach((g) => g.dispose());
    },
    [roomGeoms, corridorGeoms],
  );

  // all wall pieces of all open floors in one instanced mesh
  const walls = useMemo(() => {
    const items: { x: number; z: number; angle: number; length: number; y: number; outer: boolean }[] = [];
    const seen = new Set<string>();
    const add = (a: XZ, b: XZ, y: number, outer: boolean) => {
      const key = [a, b]
        .map((p) => `${Math.round(p.x * 10)},${Math.round(p.z * 10)}`)
        .sort()
        .join("|");
      if (seen.has(key)) return;
      seen.add(key);
      for (const s of pathSegments([a, b], WALL_T)) items.push({ x: s.x, z: s.z, angle: s.angle, length: s.length, y, outer });
    };
    for (const f of open) {
      for (const r of f.rooms) for (const p of wallPieces(r.polygon, doors)) add(p.a, p.b, f.elevation, false);
      for (const p of wallPieces(f.outline, [])) add(p.a, p.b, f.elevation, true);
    }
    return items;
  }, [open, doors]);
  const wallRef = useRef<InstancedMesh>(null);
  const outerRef = useRef<InstancedMesh>(null);
  useLayoutEffect(() => {
    const dummy = new Object3D();
    for (const [ref, outer] of [
      [wallRef, false],
      [outerRef, true],
    ] as const) {
      const mesh = ref.current;
      if (!mesh) continue;
      let i = 0;
      for (const w of walls) {
        if (w.outer !== outer) continue;
        const h = outer ? WALL_H + 0.3 : WALL_H;
        dummy.position.set(w.x, w.y + h / 2, w.z);
        dummy.rotation.set(0, w.angle, 0);
        dummy.scale.set(w.length, h, outer ? WALL_T * 1.6 : WALL_T);
        dummy.updateMatrix();
        mesh.setMatrixAt(i++, dummy.matrix);
      }
      mesh.count = i;
      mesh.instanceMatrix.needsUpdate = true;
    }
    invalidate();
  }, [walls, invalidate]);
  const outerCount = walls.filter((w) => w.outer).length;
  const innerCount = walls.length - outerCount;

  useEffect(() => {
    invalidate();
  }, [selectedRoomId, destinationRoomId, hoveredRoomId, route, openBuildingIds, invalidate]);

  const shownLabels = useMemo(() => {
    const roomsOf = new Map<string, string>();
    for (const f of interiors.floors) for (const r of f.rooms) roomsOf.set(r.roomId, f.buildingId);
    return labels.filter((l) => {
      const b = roomsOf.get(l.roomId);
      if (!b || !openBuildingIds.has(b)) return false;
      return labelBuildingIds.has(b) || l.roomId === selectedRoomId || l.roomId === destinationRoomId || l.roomId === hoveredRoomId;
    });
  }, [labels, interiors.floors, openBuildingIds, labelBuildingIds, selectedRoomId, destinationRoomId, hoveredRoomId]);

  return (
    <group name="campus-interior">
      {open.map((f, fi) => (
        <group key={f.floorId} name={`interior-floor:${f.floorId}`}>
          {f.corridors.map((_, ci) => (
            <mesh
              key={ci}
              geometry={corridorGeoms[fi]![ci]}
              material={res.corridor}
              rotation={[-Math.PI / 2, 0, 0]}
              position={[0, f.elevation, 0]}
              receiveShadow
              raycast={none}
            />
          ))}
          {f.rooms.map((r) => {
            const mat =
              r.roomId === destinationRoomId
                ? res.destination
                : r.roomId === selectedRoomId
                  ? res.selected
                  : r.roomId === hoveredRoomId
                    ? res.hover
                    : (res.kinds[r.kind] ?? res.kinds["other"]!);
            return (
              <mesh
                key={r.roomId}
                name={`interior-room:${r.roomId}`}
                geometry={roomGeoms.get(r.roomId)}
                material={mat}
                rotation={[-Math.PI / 2, 0, 0]}
                position={[0, f.elevation + 0.005, 0]}
                receiveShadow
                onPointerOver={(e) => {
                  e.stopPropagation();
                  onHoverRoom(r.roomId);
                  if (typeof document !== "undefined") document.body.style.cursor = "pointer";
                }}
                onPointerOut={() => {
                  onHoverRoom(null);
                  if (typeof document !== "undefined") document.body.style.cursor = "";
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  onSelectRoom(r.roomId);
                }}
              />
            );
          })}
        </group>
      ))}
      <instancedMesh
        key={`w${innerCount}`}
        ref={wallRef}
        args={[res.unit, res.wall, Math.max(1, innerCount)]}
        castShadow
        receiveShadow
        raycast={none}
      />
      <instancedMesh
        key={`o${outerCount}`}
        ref={outerRef}
        args={[res.unit, res.wallOuter, Math.max(1, outerCount)]}
        castShadow
        receiveShadow
        raycast={none}
      />

      {shownLabels.map((l) => {
        const elevation = open[0]?.elevation ?? 3.6;
        const hi = l.roomId === destinationRoomId || l.roomId === selectedRoomId;
        return (
          <SceneLabel
            key={l.roomId}
            position={[l.x, elevation + (hi ? 2.2 : 0.9), l.z]}
            tone={l.roomId === destinationRoomId ? "destination" : l.roomId === selectedRoomId ? "selected" : "neutral"}
          >
            {l.text}
          </SceneLabel>
        );
      })}

      {interiors.bridges.map((b) => (
        <Bridge key={b.id} bridge={b} res={res} />
      ))}

      {route && route.length > 1 && <IndoorRoute route={route} res={res} />}
    </group>
  );
}

interface Res {
  unit: BoxGeometry;
  post: CylinderGeometry;
  joint: SphereGeometry;
  bridgeFloor: MeshStandardMaterial;
  bridgeGlass: MeshStandardMaterial;
  bridgeFrame: MeshStandardMaterial;
  post_: MeshStandardMaterial;
  routeCasing: MeshStandardMaterial;
  routeCore: MeshStandardMaterial;
  beacon: MeshStandardMaterial;
}

/** Enclosed walkway: floor slab, glass sides, roof and a few supporting posts down to the ground. */
function Bridge({ bridge, res }: { bridge: SkyBridge; res: Res }) {
  const seg = pathSegments(bridge.points, bridge.width)[0];
  if (!seg) return null;
  const { elevation: e, height: h, width: w } = bridge;
  const posts = Math.max(0, Math.floor(seg.length / 9));
  return (
    <group name={`campus-bridge:${bridge.id}`} position={[seg.x, 0, seg.z]} rotation={[0, seg.angle, 0]}>
      <mesh
        geometry={res.unit}
        material={res.bridgeFloor}
        position={[0, e - 0.2, 0]}
        scale={[seg.length, 0.4, w]}
        castShadow
        receiveShadow
        raycast={none}
      />
      <mesh
        geometry={res.unit}
        material={res.bridgeGlass}
        position={[0, e + h * 0.45, w / 2]}
        scale={[seg.length, h * 0.8, 0.08]}
        raycast={none}
      />
      <mesh
        geometry={res.unit}
        material={res.bridgeGlass}
        position={[0, e + h * 0.45, -w / 2]}
        scale={[seg.length, h * 0.8, 0.08]}
        raycast={none}
      />
      <mesh
        geometry={res.unit}
        material={res.bridgeFrame}
        position={[0, e + h, 0]}
        scale={[seg.length, 0.2, w + 0.3]}
        castShadow
        raycast={none}
      />
      <mesh
        geometry={res.unit}
        material={res.bridgeFrame}
        position={[0, e + 0.12, w / 2]}
        scale={[seg.length, 0.14, 0.14]}
        raycast={none}
      />
      <mesh
        geometry={res.unit}
        material={res.bridgeFrame}
        position={[0, e + 0.12, -w / 2]}
        scale={[seg.length, 0.14, 0.14]}
        raycast={none}
      />
      {Array.from({ length: posts }, (_, i) => (
        <mesh
          key={i}
          geometry={res.post}
          material={res.post_}
          position={[((i + 1) / (posts + 1) - 0.5) * seg.length, (e - 0.4) / 2, 0]}
          scale={[1, e - 0.4, 1]}
          castShadow
          raycast={none}
        />
      ))}
    </group>
  );
}

/** The walking route inside: always visible (drawn on top of walls), with an arrival beacon. */
function IndoorRoute({ route, res }: { route: readonly { x: number; y: number; z: number }[]; res: Res }) {
  const pts = route.map((p) => [p.x, p.y + 0.35, p.z] as [number, number, number]);
  const end = route[route.length - 1]!;
  return (
    <group name="campus-indoor-route">
      <Line points={pts} color="#ffffff" lineWidth={9} depthTest={false} transparent opacity={0.9} renderOrder={20} raycast={none} />
      <Line points={pts} color={sceneColors.route} lineWidth={5} depthTest={false} transparent renderOrder={21} raycast={none} />
      {route.map((p, i) => (
        <mesh key={i} geometry={res.joint} material={res.routeCore} position={[p.x, p.y + 0.35, p.z]} scale={0.22} raycast={none} />
      ))}
      <mesh geometry={res.joint} material={res.beacon} position={[end.x, end.y + 1.5, end.z]} scale={0.55} castShadow raycast={none} />
    </group>
  );
}
