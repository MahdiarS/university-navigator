import { Color, DoubleSide, MeshBasicMaterial, MeshStandardMaterial, type Material } from "three";
import type { Room } from "@/lib/data/types";
import { sceneColors, type RoomVisualState } from "@/lib/theme/tokens";

/**
 * Shared materials for the procedural scene. A "set" is created once per viewer (solid + ghost variants), shared by
 * every floor and disposed when the viewer unmounts, so there is one material per look, not one per mesh.
 */
export interface MaterialSet {
  slab: MeshStandardMaterial;
  wall: MeshStandardMaterial;
  corridor: MeshStandardMaterial;
  door: MeshStandardMaterial;
  stairs: MeshStandardMaterial;
  shaft: MeshStandardMaterial;
  car: MeshStandardMaterial;
  /** base look per room kind */
  roomKind: Record<"office" | "service" | "other", MeshStandardMaterial>;
  /** override look for interaction states */
  roomState: Record<Exclude<RoomVisualState, "default">, MeshStandardMaterial>;
}

const std = (color: string, opacity: number, extra: Partial<ConstructorParameters<typeof MeshStandardMaterial>[0]> = {}) =>
  new MeshStandardMaterial({
    color: new Color(color),
    roughness: 0.85,
    metalness: 0.02,
    transparent: opacity < 1,
    opacity,
    depthWrite: opacity >= 1,
    ...extra,
  });

export function createMaterialSet(opacity: number): MaterialSet {
  const o = opacity;
  return {
    slab: std(sceneColors.slab, o),
    wall: std(sceneColors.wall, o, { roughness: 0.95 }),
    corridor: std(sceneColors.corridor, o),
    door: std(sceneColors.door, o),
    stairs: std(sceneColors.stairs, o),
    shaft: std(sceneColors.elevator, Math.min(o, 0.35), { depthWrite: false }),
    car: std(sceneColors.elevator, o),
    roomKind: {
      office: std(sceneColors.roomOffice, o),
      service: std(sceneColors.roomService, o),
      other: std(sceneColors.room, o),
    },
    roomState: {
      hover: std(sceneColors.hover, o, { emissive: new Color(sceneColors.hover), emissiveIntensity: 0.25 }),
      selected: std(sceneColors.selected, o, { emissive: new Color(sceneColors.selected), emissiveIntensity: 0.2 }),
      destination: std(sceneColors.destination, o, { emissive: new Color(sceneColors.destination), emissiveIntensity: 0.25 }),
      start: std(sceneColors.start, o, { emissive: new Color(sceneColors.start), emissiveIntensity: 0.2 }),
    },
  };
}

export function disposeMaterialSet(set: MaterialSet): void {
  const all: Material[] = [
    set.slab, set.wall, set.corridor, set.door, set.stairs, set.shaft, set.car,
    ...Object.values(set.roomKind),
    ...Object.values(set.roomState),
  ];
  for (const m of all) m.dispose();
}

export function roomKindOf(room: Pick<Room, "roomType">): "office" | "service" | "other" {
  switch (room.roomType) {
    case "office":
    case "meeting":
      return "office";
    case "restroom":
    case "lobby":
    case "hall":
      return "service";
    default:
      return "other";
  }
}

/** Always-on-top flat material for route lines' markers (depth test off so they are never hidden by walls). */
export const overlayBasic = (color: string, opacity = 1) =>
  new MeshBasicMaterial({ color: new Color(color), transparent: true, opacity, depthTest: false, side: DoubleSide });
