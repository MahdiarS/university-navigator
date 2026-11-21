"use client";
import { useGLTF } from "@react-three/drei";
import type { ThreeEvent } from "@react-three/fiber";
import { Component, useEffect, useMemo, type ReactNode } from "react";
import type { Group, Material, Mesh, Object3D } from "three";
import { Color } from "three";
import type { BuildingModel } from "@/lib/data/types";
import { indexRoomObjects, resolveRoomId } from "@/lib/model/glb";
import { sceneColors, type RoomVisualState } from "@/lib/theme/tokens";

/** Decoder files are copied from three.js to public/draco by scripts/copy-draco.mjs (no CDN needed). */
export const DRACO_PATH = "/draco/";

const STATE_COLOR: Record<Exclude<RoomVisualState, "default">, string> = {
  hover: sceneColors.hover,
  selected: sceneColors.selected,
  destination: sceneColors.destination,
  start: sceneColors.start,
};

type Lit = Material & { emissive?: Color; emissiveIntensity?: number };

const noRaycast = () => null;

export interface GlbFloorProps {
  path: string;
  objectMap: BuildingModel["objectMap"];
  roomStates: ReadonlyMap<string, RoomVisualState>;
  ghost: boolean;
  interactive: boolean;
  onHoverRoom: (roomId: string | null) => void;
  onSelectRoom: (roomId: string) => void;
  /** reported once per load, e.g. when objects named in the manifest are missing from the file */
  onWarning?: (message: string) => void;
}

/**
 * Real floor model loaded from a GLB (Mode B). Each instance owns cloned materials so highlighting one room never
 * changes another floor, and everything it created is disposed on unmount (floors are loaded lazily and may be
 * hidden again). Rooms are recognised by mesh NAME through the manifest object map (see docs/3d-model-guide.md).
 */
export function GlbFloor({ path, objectMap, roomStates, ghost, interactive, onHoverRoom, onSelectRoom, onWarning }: GlbFloorProps) {
  const gltf = useGLTF(path, DRACO_PATH) as unknown as { scene: Group };

  const { scene, owned, rooms } = useMemo(() => {
    const clone = gltf.scene.clone(true);
    const ownedMaterials: Material[] = [];
    clone.traverse((obj) => {
      const mesh = obj as Mesh;
      if (!mesh.isMesh) return;
      const own = Array.isArray(mesh.material) ? mesh.material.map((m) => m.clone()) : mesh.material.clone();
      mesh.material = own;
      for (const m of Array.isArray(own) ? own : [own]) {
        m.userData.baseOpacity = m.opacity;
        m.userData.baseTransparent = m.transparent;
        ownedMaterials.push(m);
      }
      if (!interactive) mesh.raycast = noRaycast;
    });
    return { scene: clone, owned: ownedMaterials, rooms: indexRoomObjects(clone, objectMap) };
  }, [gltf.scene, objectMap, interactive]);

  useEffect(() => {
    const missing = Object.entries(objectMap).filter(([, id]) => !rooms.has(id)).length;
    if (missing > 0 && onWarning) onWarning(`${missing} room object(s) named in the manifest were not found in ${path}`);
  }, [rooms, objectMap, onWarning, path]);

  // Ghost mode and highlight colours are material tweaks; geometry is never touched.
  useEffect(() => {
    // `owned` holds materials cloned for this floor (see useMemo above); mutating them is the point of this effect.
    /* eslint-disable react-hooks/immutability */
    for (const m of owned) {
      m.transparent = ghost ? true : Boolean(m.userData.baseTransparent);
      m.opacity = ghost ? 0.16 : (m.userData.baseOpacity as number);
      m.depthWrite = !ghost;
      m.needsUpdate = true;
    }
    /* eslint-enable react-hooks/immutability */
  }, [owned, ghost]);

  useEffect(() => {
    for (const [roomId, objects] of rooms) {
      const state = roomStates.get(roomId);
      for (const obj of objects) {
        obj.traverse((child: Object3D) => {
          const mesh = child as Mesh;
          if (!mesh.isMesh) return;
          for (const m of (Array.isArray(mesh.material) ? mesh.material : [mesh.material]) as Lit[]) {
            if (!m.emissive) continue;
            if (state && state !== "default") {
              m.emissive.set(STATE_COLOR[state]);
              m.emissiveIntensity = 0.55;
            } else {
              m.emissive.set("#000000");
              m.emissiveIntensity = 0;
            }
          }
        });
      }
    }
  }, [rooms, roomStates]);

  // Release GPU memory and drop the cached download when the floor is hidden or the viewer closes.
  useEffect(
    () => () => {
      for (const m of owned) m.dispose();
      const original = gltf.scene;
      original.traverse((obj) => (obj as Mesh).geometry?.dispose());
      useGLTF.clear(path);
    },
    [owned, gltf.scene, path],
  );

  const roomIdOf = (e: ThreeEvent<PointerEvent | MouseEvent>) => resolveRoomId(e.object, objectMap);
  return (
    <primitive
      object={scene}
      onPointerOver={
        interactive
          ? (e: ThreeEvent<PointerEvent>) => {
              e.stopPropagation();
              const id = roomIdOf(e);
              onHoverRoom(id);
              if (typeof document !== "undefined") document.body.style.cursor = id ? "pointer" : "";
            }
          : undefined
      }
      onPointerOut={
        interactive
          ? () => {
              onHoverRoom(null);
              if (typeof document !== "undefined") document.body.style.cursor = "";
            }
          : undefined
      }
      onClick={
        interactive
          ? (e: ThreeEvent<MouseEvent>) => {
              if (e.delta > 6) return;
              e.stopPropagation();
              const id = roomIdOf(e);
              if (id) onSelectRoom(id);
            }
          : undefined
      }
    />
  );
}

/**
 * Catches a failed GLB download/parse for ONE floor (missing file, corrupt data ...) and shows the fallback
 * (the procedural floor) instead of crashing the whole viewer.
 */
export class FloorModelBoundary extends Component<
  { fallback: ReactNode; onError: (error: Error) => void; children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: Error) {
    this.props.onError(error);
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}
