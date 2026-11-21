"use client";
import { useCallback, useMemo, useReducer, useState } from "react";
import { useNavigator } from "@/components/DataProvider";
import type { RenderedStep } from "@/components/navigation/RouteSteps";
import type { ScenePin } from "@/components/3d/BuildingScene";
import type { Building, BuildingModel, Floor, Room } from "@/lib/data/types";
import { explodeOffsets, sortFloors, type BoundsLike } from "@/lib/model/layout";
import { buildRouteGeometry, routeBounds, type RouteGeometry } from "@/lib/model/routeGeometry";
import { initialViewerState, viewerReducer, type ViewerState } from "@/lib/model/viewerState";
import {
  buildDirections,
  computeRoute,
  describeStep,
  type DirectionContext,
  type RouteResult,
  type RouteSuccess,
} from "@/lib/navigation";
import { search } from "@/lib/search/engine";
import { toPersianDigits } from "@/lib/search/normalize";
import type { RoomVisualState } from "@/lib/theme/tokens";
import {
  buildDestinationOptions,
  buildStartOptions,
  roomTitle,
  type DestinationOption,
  type PlaceOption,
} from "./places";

export interface ExplorerInitial {
  roomId: string | null;
  navigate: boolean;
  startNodeId: string | null;
}

export type PanelMode = "browse" | "navigate";

/** Bounds of a room as a small box around its centre (used to frame it). */
const aroundRoom = (room: Room, pad = 9): BoundsLike => ({
  min: { x: room.positionX - pad, y: room.positionY - 1, z: room.positionZ - pad },
  max: { x: room.positionX + pad, y: room.positionY + 4, z: room.positionZ + pad },
});

const padBounds = (b: BoundsLike, pad = 3): BoundsLike => ({
  min: { x: b.min.x - pad, y: b.min.y - 1, z: b.min.z - pad },
  max: { x: b.max.x + pad, y: b.max.y + 4, z: b.max.z + pad },
});

/**
 * All state and behaviour of the building page, separate from layout and from Three.js:
 * viewer state (floors, exploded view, selection, camera commands), route planning and search.
 * Routes are DERIVED from (start, destination, accessibility), so changing the destination recalculates them.
 */
export function useExplorer(building: Building, model: BuildingModel, initial: ExplorerInitial) {
  const { data, lookups, graph, searchIndex } = useNavigator();

  const floors: Floor[] = useMemo(() => sortFloors(lookups.floorsByBuilding.get(building.id) ?? []), [lookups, building.id]);
  const rooms = useMemo(() => {
    const ids = new Set(floors.map((f) => f.id));
    return data.rooms.filter((r) => ids.has(r.floorId));
  }, [data.rooms, floors]);

  const initialRoom = initial.roomId ? (lookups.roomsById.get(initial.roomId) ?? null) : null;
  const [viewer, dispatch] = useReducer(viewerReducer, undefined, (): ViewerState =>
    initialRoom && rooms.some((r) => r.id === initialRoom.id)
      ? {
          ...initialViewerState,
          activeFloorId: initialRoom.floorId,
          selectedRoomId: initialRoom.id,
          cameraCommand: { kind: "focus", nonce: 1, bounds: aroundRoom(initialRoom) },
        }
      : initialViewerState,
  );

  const [panelMode, setPanelMode] = useState<PanelMode>(initialRoom && initial.navigate ? "navigate" : "browse");
  const [startNodeId, setStartNodeId] = useState<string | null>(initial.startNodeId && graph.nodes.has(initial.startNodeId) ? initial.startNodeId : null);
  const [destRoomId, setDestRoomId] = useState<string | null>(initialRoom?.id ?? null);
  const [accessibleOnly, setAccessibleOnly] = useState(false);
  const [autoExploded, setAutoExploded] = useState(false);
  const [query, setQuery] = useState("");
  const [cutaway, setCutaway] = useState(true);
  const [showLabels, setShowLabels] = useState(true);
  const [modelNotice, setModelNotice] = useState<string | null>(null);

  // ---------------------------------------------------------------- derived data
  const hits = useMemo(() => search(searchIndex, query, { buildingId: building.id, limit: 40 }), [searchIndex, query, building.id]);
  const startOptions: PlaceOption[] = useMemo(() => buildStartOptions(data, lookups, building.id), [data, lookups, building.id]);
  const destinationOptions: DestinationOption[] = useMemo(() => buildDestinationOptions(data, lookups, building.id), [data, lookups, building.id]);
  const entranceOption = useMemo(() => startOptions.find((o) => o.group === "entrance") ?? null, [startOptions]);

  const destRoom = destRoomId ? (lookups.roomsById.get(destRoomId) ?? null) : null;
  const destNodeId = destRoom?.doorNodeId ?? null;

  const route: RouteResult | null = useMemo(() => {
    if (!startNodeId || !destRoom) return null;
    if (!destNodeId) return { status: "unknown-goal", startId: startNodeId, goalId: destRoom.id, accessibleOnly };
    return computeRoute(graph, startNodeId, destNodeId, { accessibleOnly });
  }, [graph, startNodeId, destRoom, destNodeId, accessibleOnly]);
  const routeOk: RouteSuccess | null = route?.status === "ok" ? route : null;

  const routeGeometry: RouteGeometry | null = useMemo(() => (routeOk ? buildRouteGeometry(routeOk, destRoom) : null), [routeOk, destRoom]);

  const steps: RenderedStep[] = useMemo(() => {
    if (!routeOk) return [];
    const ctx: DirectionContext = {
      node: (id) => graph.nodes.get(id),
      nodeName: (id) => {
        const room = lookups.roomByDoorNode.get(id);
        if (room) return roomTitle(room, lookups);
        return graph.nodes.get(id)?.label ?? id;
      },
      floorName: (id) => lookups.floorsById.get(id)?.displayName ?? id,
    };
    return buildDirections(graph, routeOk).map((step) => ({ step, text: describeStep(step, ctx) }));
  }, [routeOk, graph, lookups]);

  const roomStates = useMemo(() => {
    const m = new Map<string, RoomVisualState>();
    if (viewer.hoveredRoomId) m.set(viewer.hoveredRoomId, "hover");
    if (viewer.selectedRoomId) m.set(viewer.selectedRoomId, "selected");
    const startRoom = startNodeId ? lookups.roomByDoorNode.get(startNodeId) : undefined;
    if (startRoom) m.set(startRoom.id, "start");
    if (destRoomId) m.set(destRoomId, "destination");
    return m;
  }, [viewer.hoveredRoomId, viewer.selectedRoomId, startNodeId, destRoomId, lookups]);

  const roomLabel = useCallback(
    (roomId: string) => {
      const room = lookups.roomsById.get(roomId);
      return room ? `${toPersianDigits(room.roomNumber)} · ${roomTitle(room, lookups)}` : roomId;
    },
    [lookups],
  );

  const labelRoomIds = useMemo(() => {
    const ids = new Set<string>();
    if (showLabels && viewer.activeFloorId !== "all") for (const r of lookups.roomsByFloor.get(viewer.activeFloorId) ?? []) ids.add(r.id);
    for (const [id] of roomStates) ids.add(id);
    return ids;
  }, [showLabels, viewer.activeFloorId, lookups, roomStates]);

  const startPin: ScenePin | null = useMemo(() => {
    const node = startNodeId ? graph.nodes.get(startNodeId) : null;
    if (!node) return null;
    const room = lookups.roomByDoorNode.get(node.id);
    return { floorId: node.floorId, position: { x: node.x, y: node.y, z: node.z }, label: `شروع: ${room ? roomTitle(room, lookups) : (node.label ?? "")}` };
  }, [startNodeId, graph, lookups]);

  const destinationPin: ScenePin | null = useMemo(
    () =>
      destRoom
        ? { floorId: destRoom.floorId, position: { x: destRoom.positionX, y: destRoom.positionY, z: destRoom.positionZ }, label: `مقصد: ${roomTitle(destRoom, lookups)}` }
        : null,
    [destRoom, lookups],
  );

  const focusedRoom = viewer.selectedRoomId ? (lookups.roomsById.get(viewer.selectedRoomId) ?? null) : destRoom;

  // ---------------------------------------------------------------- camera helpers
  const focusRoom = useCallback((room: Room) => dispatch({ type: "focusCamera", bounds: aroundRoom(room) }), []);

  /** Frame a freshly computed route. The exploded offsets are those that WILL be active, not the current ones. */
  const focusRoute = useCallback(
    (r: RouteSuccess, dest: Room | null, exploded: boolean) => {
      const offsets = explodeOffsets(floors, exploded ? viewer.explodeDistance : 0);
      const bounds = routeBounds(buildRouteGeometry(r, dest), offsets);
      if (bounds) dispatch({ type: "focusCamera", bounds: padBounds(bounds) });
    },
    [floors, viewer.explodeDistance],
  );

  /** Re-frame the whole building after the exploded distance changed (keeps the viewing angle). */
  const focusBuilding = useCallback(
    (exploded: boolean, distance: number) => {
      const fp = model.procedural.footprint;
      const top = Math.max(...floors.map((f) => f.elevation)) + model.procedural.wallHeight;
      const lift = exploded ? (floors.length - 1) * distance : 0;
      dispatch({
        type: "focusCamera",
        bounds: { min: { x: fp.minX, y: -0.5, z: fp.minZ }, max: { x: fp.maxX, y: top + lift, z: fp.maxZ } },
      });
    },
    [floors, model.procedural],
  );

  // ---------------------------------------------------------------- navigation
  /** One entry point for every change to (start, destination, accessibility): computes, then frames the result. */
  const updateNavigation = useCallback(
    (next: { start?: string | null; dest?: string | null; accessible?: boolean }) => {
      const s = next.start !== undefined ? next.start : startNodeId;
      const d = next.dest !== undefined ? next.dest : destRoomId;
      const a = next.accessible !== undefined ? next.accessible : accessibleOnly;
      setStartNodeId(s);
      setDestRoomId(d);
      setAccessibleOnly(a);
      setAutoExploded(false);

      const dr = d ? (lookups.roomsById.get(d) ?? null) : null;
      if (s && dr?.doorNodeId) {
        const r = computeRoute(graph, s, dr.doorNodeId, { accessibleOnly: a });
        if (r.status === "ok") {
          const multi = r.floorIds.length > 1;
          if (multi && !viewer.exploded) {
            dispatch({ type: "setExploded", value: true });
            setAutoExploded(true);
          }
          const onlyActive = r.floorIds.length === 1 && r.floorIds[0] === viewer.activeFloorId;
          if (viewer.activeFloorId !== "all" && !onlyActive) dispatch({ type: "showAllFloors" });
          focusRoute(r, dr, multi || viewer.exploded);
          return;
        }
      }
      if (dr) {
        dispatch({ type: "selectFloor", floorId: dr.floorId });
        focusRoom(dr);
      }
    },
    [startNodeId, destRoomId, accessibleOnly, lookups, graph, viewer.exploded, viewer.activeFloorId, focusRoute, focusRoom],
  );

  // ---------------------------------------------------------------- user actions
  const selectRoomFromMap = useCallback(
    (roomId: string) => {
      const room = lookups.roomsById.get(roomId);
      if (!room) return;
      dispatch({ type: "selectRoom", roomId, floorId: room.floorId });
      if (panelMode === "navigate") updateNavigation({ dest: roomId });
    },
    [lookups, panelMode, updateNavigation],
  );

  /** Search result (or department link): activate the building, isolate the floor, highlight the room, offer routing. */
  const selectDestination = useCallback(
    (roomId: string) => {
      const room = lookups.roomsById.get(roomId);
      if (!room) return;
      dispatch({ type: "selectRoom", roomId, floorId: room.floorId });
      dispatch({ type: "selectFloor", floorId: room.floorId });
      focusRoom(room);
      setDestRoomId(roomId);
      if (panelMode === "navigate") updateNavigation({ dest: roomId });
    },
    [lookups, panelMode, focusRoom, updateNavigation],
  );

  const startNavigation = useCallback(
    (roomId: string) => {
      setPanelMode("navigate");
      dispatch({ type: "selectRoom", roomId: null });
      updateNavigation({ dest: roomId });
    },
    [updateNavigation],
  );

  const closeNavigation = useCallback(() => {
    setPanelMode("browse");
    setStartNodeId(null);
    setAutoExploded(false);
  }, []);

  const clearFocus = useCallback(() => {
    dispatch({ type: "selectRoom", roomId: null });
    if (panelMode === "browse") setDestRoomId(null);
  }, [panelMode]);

  const swap = useCallback(() => {
    const startRoom = startNodeId ? lookups.roomByDoorNode.get(startNodeId) : undefined;
    if (!startRoom || !destRoom?.doorNodeId) return;
    updateNavigation({ start: destRoom.doorNodeId, dest: startRoom.id });
  }, [startNodeId, destRoom, lookups, updateNavigation]);

  const toggleExplode = useCallback(() => {
    const next = !viewer.exploded;
    dispatch({ type: "setExploded", value: next });
    setAutoExploded(false);
    focusBuilding(next, viewer.explodeDistance);
  }, [viewer.exploded, viewer.explodeDistance, focusBuilding]);

  return {
    building,
    model,
    floors,
    rooms,
    viewer,
    dispatch,
    panelMode,
    startNodeId,
    destRoomId,
    destRoom,
    accessibleOnly,
    autoExploded,
    query,
    setQuery,
    hits,
    cutaway,
    setCutaway,
    showLabels,
    setShowLabels,
    modelNotice,
    setModelNotice,
    startOptions,
    destinationOptions,
    entranceOption,
    route,
    routeOk,
    routeGeometry,
    steps,
    roomStates,
    roomLabel,
    labelRoomIds,
    startPin,
    destinationPin,
    focusedRoom,
    // actions
    selectRoomFromMap,
    selectDestination,
    startNavigation,
    closeNavigation,
    clearFocus,
    updateNavigation,
    swap,
    toggleExplode,
    focusBuilding,
  };
}

export type Explorer = ReturnType<typeof useExplorer>;
