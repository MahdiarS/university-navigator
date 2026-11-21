"use client";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BoxGeometry } from "three";
import type { BuildingModel, Floor, Room } from "@/lib/data/types";
import { CameraRig } from "./CameraRig";
import { FloorGroup } from "./FloorGroup";
import { FloorModelBoundary, GlbFloor } from "./GlbFloor";
import { Pin } from "./Markers";
import { createMaterialSet, disposeMaterialSet } from "./materials";
import { ProceduralFloor } from "./ProceduralFloor";
import { FloorRoute, TransferConnector } from "./RouteLayer";
import { explodeOffsets, floorVisibility, sortFloors, type Vec3 } from "@/lib/model/layout";
import { buildingBounds, buildProceduralBuilding } from "@/lib/model/procedural";
import type { RouteGeometry } from "@/lib/model/routeGeometry";
import { sceneColors, type RoomVisualState } from "@/lib/theme/tokens";
import type { ViewerState } from "@/lib/model/viewerState";

export interface ScenePin {
  floorId: string;
  position: Vec3;
  label: string;
}

export interface BuildingSceneProps {
  floors: readonly Floor[];
  rooms: readonly Room[];
  model: BuildingModel;
  viewer: ViewerState;
  roomStates: ReadonlyMap<string, RoomVisualState>;
  labelRoomIds: ReadonlySet<string>;
  roomLabel: (roomId: string) => string;
  entranceLabel?: string;
  route: RouteGeometry | null;
  startPin: ScenePin | null;
  destinationPin: ScenePin | null;
  /** lower walls so rooms stay readable from the isometric camera */
  cutaway: boolean;
  onHoverRoom: (roomId: string | null) => void;
  onSelectRoom: (roomId: string) => void;
  /** a real GLB failed to load / has missing objects: the UI explains that demo geometry is shown */
  onModelIssue?: (message: string) => void;
}

/**
 * The whole building scene (everything INSIDE the <Canvas>): lights, ground, one group per floor (procedural geometry
 * or a real GLB), route segments, markers and the camera rig. It is driven only by props, so it knows nothing about
 * pages, search or the data source.
 */
export function BuildingScene({
  floors,
  rooms,
  model,
  viewer,
  roomStates,
  labelRoomIds,
  roomLabel,
  entranceLabel,
  route,
  startPin,
  destinationPin,
  cutaway,
  onHoverRoom,
  onSelectRoom,
  onModelIssue,
}: BuildingSceneProps) {
  const sorted = useMemo(() => sortFloors(floors), [floors]);
  const geometries = useMemo(() => buildProceduralBuilding(model, sorted, rooms), [model, sorted, rooms]);
  const roomsById = useMemo(() => new Map(rooms.map((r) => [r.id, r])), [rooms]);

  // Shared resources: created once per viewer, disposed when it unmounts.
  const solid = useMemo(() => createMaterialSet(1), []);
  const ghost = useMemo(() => createMaterialSet(0.14), []);
  const unitBox = useMemo(() => new BoxGeometry(1, 1, 1), []);
  useEffect(
    () => () => {
      disposeMaterialSet(solid);
      disposeMaterialSet(ghost);
      unitBox.dispose();
    },
    [solid, ghost, unitBox],
  );

  const offsets = useRef(new Map<string, number>());
  const targetOffsets = useMemo(
    () => explodeOffsets(sorted, viewer.exploded ? viewer.explodeDistance : 0),
    [sorted, viewer.exploded, viewer.explodeDistance],
  );

  // Home view bounds include the exploded offset so "reset" always frames every floor.
  const homeBounds = useMemo(() => {
    const b = buildingBounds(model, sorted);
    const top = Math.max(0, ...targetOffsets.values());
    return { min: b.min, max: { ...b.max, y: b.max.y + top } };
  }, [model, sorted, targetOffsets]);

  const [failedFloors, setFailedFloors] = useState<ReadonlySet<string>>(new Set());
  const reportFailure = useCallback(
    (floorId: string, message: string) => {
      setFailedFloors((prev) => (prev.has(floorId) ? prev : new Set(prev).add(floorId)));
      onModelIssue?.(message);
    },
    [onModelIssue],
  );

  const fp = model.procedural.footprint;
  const groundY = Math.min(...sorted.map((f) => f.elevation)) - model.procedural.slabThickness - 0.1;

  return (
    <>
      <ambientLight intensity={1.15} />
      <directionalLight position={[40, 70, 30]} intensity={2.1} />
      <directionalLight position={[-35, 25, -25]} intensity={0.55} />

      {/* ground (never moves in the exploded view) */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[(fp.minX + fp.maxX) / 2, groundY, (fp.minZ + fp.maxZ) / 2]} raycast={() => null}>
        <planeGeometry args={[(fp.maxX - fp.minX) * 2.6, (fp.maxZ - fp.minZ) * 3]} />
        <meshStandardMaterial color={sceneColors.ground} roughness={1} />
      </mesh>

      {sorted.map((floor) => {
        const visibility = floorVisibility(floor.id, viewer.activeFloorId, viewer.otherFloors);
        const geometry = geometries.find((g) => g.floorId === floor.id);
        const asset = model.floors.find((f) => f.floorId === floor.id);
        const isSolid = visibility === "solid";
        const useGlb = asset?.status === "available" && !failedFloors.has(floor.id);
        const segment = route?.segments.filter((s) => s.floorId === floor.id) ?? [];

        // A hidden floor mounts nothing: GLB floors are downloaded lazily, only when they are actually shown.
        if (visibility === "hidden" || !geometry) return null;

        const procedural = (
          <ProceduralFloor
            geometry={geometry}
            roomsById={roomsById}
            materials={isSolid ? solid : ghost}
            interactive={isSolid}
            cutaway={cutaway}
            unitBox={unitBox}
            roomStates={roomStates}
            labelRoomIds={labelRoomIds}
            roomLabel={roomLabel}
            entranceLabel={entranceLabel}
            onHoverRoom={onHoverRoom}
            onSelectRoom={onSelectRoom}
          />
        );

        return (
          <FloorGroup key={floor.id} floorId={floor.id} targetOffset={targetOffsets.get(floor.id) ?? 0} offsets={offsets}>
            {useGlb && asset ? (
              <FloorModelBoundary
                key={asset.path}
                fallback={procedural}
                onError={(e) => reportFailure(floor.id, `Could not load ${asset.path}: ${e.message}`)}
              >
                <Suspense fallback={null}>
                  <GlbFloor
                    path={asset.path}
                    objectMap={model.objectMap}
                    roomStates={roomStates}
                    ghost={!isSolid}
                    interactive={isSolid}
                    onHoverRoom={onHoverRoom}
                    onSelectRoom={onSelectRoom}
                    onWarning={onModelIssue}
                  />
                </Suspense>
              </FloorModelBoundary>
            ) : (
              procedural
            )}

            {segment.map((s, i) => (
              <FloorRoute key={`${s.floorId}-${i}`} segment={s} />
            ))}
            {startPin && startPin.floorId === floor.id && (
              <Pin name="pin:start" tone="start" color={sceneColors.start} label={startPin.label} position={[startPin.position.x, startPin.position.y, startPin.position.z]} />
            )}
            {destinationPin && destinationPin.floorId === floor.id && (
              <Pin name="pin:destination" tone="destination" color={sceneColors.destination} label={destinationPin.label} position={[destinationPin.position.x, destinationPin.position.y, destinationPin.position.z]} />
            )}
          </FloorGroup>
        );
      })}

      {route?.transfers.map((t, i) => (
        <TransferConnector key={`${t.fromFloorId}-${t.toFloorId}-${i}`} transfer={t} offsets={offsets} labels />
      ))}

      <CameraRig command={viewer.cameraCommand} homeBounds={homeBounds} />
    </>
  );
}
