"use client";
import type { ThreeEvent } from "@react-three/fiber";
import { memo, useEffect, useMemo } from "react";
import { BoxGeometry, type BufferGeometry } from "three";
import type { Room } from "@/lib/data/types";
import type { BoxSpec, FloorGeometry, RoomTile } from "@/lib/model/procedural";
import type { RoomVisualState } from "@/lib/theme/tokens";
import { cutBoxes, mergeBoxes, WALL_CUTAWAY_FACTOR } from "./geometry";
import { roomKindOf, type MaterialSet } from "./materials";
import { SceneLabel } from "./SceneLabel";

const noRaycast = () => null;

/** Opaque parts of a solid floor swallow pointer events, so a room under another floor can't be picked "through" it. */
const block = (e: ThreeEvent<PointerEvent | MouseEvent>) => e.stopPropagation();

function setCursor(value: "pointer" | "") {
  if (typeof document !== "undefined") document.body.style.cursor = value;
}

interface TileProps {
  tile: RoomTile;
  room: Room;
  unitBox: BufferGeometry;
  materials: MaterialSet;
  state: RoomVisualState;
  interactive: boolean;
  onHover: (roomId: string | null) => void;
  onSelect: (roomId: string) => void;
}

/** One selectable room floor-tile. Its `name` is the stable 3D object id mapped to the room record. */
const RoomTileMesh = memo(function RoomTileMesh({ tile, room, unitBox, materials, state, interactive, onHover, onSelect }: TileProps) {
  const material = state === "default" ? materials.roomKind[roomKindOf(room)] : materials.roomState[state];
  const { x, y, z, w, h, d } = tile.box;
  return (
    <mesh
      name={tile.objectId}
      userData={{ roomId: tile.roomId }}
      geometry={unitBox}
      material={material}
      position={[x, y, z]}
      scale={[w, h, d]}
      raycast={interactive ? undefined : noRaycast}
      onPointerOver={
        interactive
          ? (e) => {
              e.stopPropagation();
              onHover(tile.roomId);
              setCursor("pointer");
            }
          : undefined
      }
      onPointerOut={
        interactive
          ? () => {
              onHover(null);
              setCursor("");
            }
          : undefined
      }
      onClick={
        interactive
          ? (e) => {
              if (e.delta > 6) return; // the pointer moved: this was an orbit drag, not a click
              e.stopPropagation();
              onSelect(tile.roomId);
            }
          : undefined
      }
    />
  );
});

export interface ProceduralFloorProps {
  geometry: FloorGeometry;
  roomsById: ReadonlyMap<string, Room>;
  materials: MaterialSet;
  interactive: boolean;
  cutaway: boolean;
  unitBox: BufferGeometry;
  roomStates: ReadonlyMap<string, RoomVisualState>;
  labelRoomIds: ReadonlySet<string>;
  roomLabel: (roomId: string) => string;
  entranceLabel?: string;
  onHoverRoom: (roomId: string | null) => void;
  onSelectRoom: (roomId: string) => void;
}

const boxMesh = (spec: BoxSpec, geo: BufferGeometry) => ({
  position: [spec.x, spec.y, spec.z] as [number, number, number],
  scale: [spec.w, spec.h, spec.d] as [number, number, number],
  geo,
});

/** Procedural demo floor: slab, walls, corridor, doors, stairs, elevator, entrance and selectable rooms. */
export function ProceduralFloor({
  geometry: g,
  roomsById,
  materials,
  interactive,
  cutaway,
  unitBox,
  roomStates,
  labelRoomIds,
  roomLabel,
  entranceLabel,
  onHoverRoom,
  onSelectRoom,
}: ProceduralFloorProps) {
  // Merged geometries: one draw call per kind of surface per floor.
  const merged = useMemo(
    () => ({
      walls: mergeBoxes(cutBoxes(g.walls, g.elevation, cutaway ? WALL_CUTAWAY_FACTOR : 1)),
      corridor: mergeBoxes(g.corridorTiles),
      doors: mergeBoxes(g.doors),
      steps: mergeBoxes(g.steps),
    }),
    [g, cutaway],
  );
  useEffect(
    () => () => {
      for (const geo of Object.values(merged)) geo?.dispose();
    },
    [merged],
  );

  const slab = boxMesh(g.slab, unitBox);
  const elevator = g.elevator;
  const handlers = interactive ? { onPointerOver: block, onClick: block } : {};
  const ray = interactive ? undefined : noRaycast;

  return (
    <group name={`procedural:${g.floorId}`}>
      <mesh geometry={slab.geo} material={materials.slab} position={slab.position} scale={slab.scale} raycast={ray} {...handlers} />
      {merged.corridor && <mesh geometry={merged.corridor} material={materials.corridor} raycast={ray} {...handlers} />}
      {merged.walls && <mesh geometry={merged.walls} material={materials.wall} raycast={ray} {...handlers} />}
      {merged.doors && <mesh geometry={merged.doors} material={materials.door} raycast={noRaycast} />}
      {merged.steps && <mesh geometry={merged.steps} material={materials.stairs} raycast={ray} {...handlers} />}
      {elevator && (
        <>
          <mesh geometry={unitBox} material={materials.shaft} position={[elevator.shaft.x, elevator.shaft.y, elevator.shaft.z]} scale={[elevator.shaft.w, elevator.shaft.h, elevator.shaft.d]} raycast={noRaycast} />
          <mesh geometry={unitBox} material={materials.car} position={[elevator.car.x, elevator.car.y, elevator.car.z]} scale={[elevator.car.w, elevator.car.h, elevator.car.d]} raycast={ray} {...handlers} />
        </>
      )}

      {g.rooms.map((tile) => {
        const room = roomsById.get(tile.roomId);
        if (!room) return null;
        return (
          <RoomTileMesh
            key={tile.roomId}
            tile={tile}
            room={room}
            unitBox={unitBox}
            materials={materials}
            state={roomStates.get(tile.roomId) ?? "default"}
            interactive={interactive}
            onHover={onHoverRoom}
            onSelect={onSelectRoom}
          />
        );
      })}

      {interactive &&
        g.rooms
          .filter((t) => labelRoomIds.has(t.roomId))
          .map((t) => {
            const state = roomStates.get(t.roomId);
            return (
              <SceneLabel
                key={`label-${t.roomId}`}
                position={[t.anchor[0], t.anchor[1] + 0.4, t.anchor[2]]}
                tone={state === "destination" ? "destination" : state === "start" ? "start" : state === "selected" ? "selected" : "neutral"}
              >
                {roomLabel(t.roomId)}
              </SceneLabel>
            );
          })}

      {interactive && g.entrance && (
        <>
          <mesh position={[g.entrance.x, g.entrance.y + 0.07, g.entrance.z]} scale={[g.entrance.width, 0.14, 1.1]} geometry={unitBox} material={materials.door} raycast={noRaycast} />
          {entranceLabel && (
            <SceneLabel position={[g.entrance.x, g.entrance.y + 1.2, g.entrance.z + 1.6]} tone="start">
              {entranceLabel}
            </SceneLabel>
          )}
        </>
      )}
    </group>
  );
}

/** Convenience factory for a unit box used by every scaled mesh (one shared geometry). */
export const makeUnitBox = () => new BoxGeometry(1, 1, 1);
