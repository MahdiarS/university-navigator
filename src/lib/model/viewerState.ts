import {
  DEFAULT_EXPLODE_DISTANCE,
  MAX_EXPLODE_DISTANCE,
  MIN_EXPLODE_DISTANCE,
  type BoundsLike,
  type OtherFloorsMode,
} from "./layout";

/**
 * Viewer state machine (pure reducer, unit-tested). The 3D components only render this state.
 * `cameraCommand.nonce` increases with every command so identical consecutive commands still re-run.
 */
export type CameraCommand =
  | { kind: "none"; nonce: number }
  | { kind: "reset"; nonce: number }
  | { kind: "focus"; nonce: number; bounds: BoundsLike }
  /** multiply the orthographic zoom (> 1 zooms in) */
  | { kind: "zoom"; nonce: number; factor: number };

export interface ViewerState {
  activeFloorId: string | "all";
  otherFloors: OtherFloorsMode;
  exploded: boolean;
  explodeDistance: number;
  selectedRoomId: string | null;
  hoveredRoomId: string | null;
  cameraCommand: CameraCommand;
}

export type ViewerAction =
  | { type: "selectFloor"; floorId: string | "all" }
  | { type: "setOtherFloors"; mode: OtherFloorsMode }
  | { type: "toggleExplode" }
  | { type: "setExploded"; value: boolean }
  | { type: "setExplodeDistance"; value: number }
  /** floorId lets selecting a room on another floor switch to that floor when a single floor is isolated. */
  | { type: "selectRoom"; roomId: string | null; floorId?: string }
  | { type: "hoverRoom"; roomId: string | null }
  | { type: "resetCamera" }
  | { type: "focusCamera"; bounds: BoundsLike }
  | { type: "zoomCamera"; factor: number }
  | { type: "showAllFloors" };

export const initialViewerState: ViewerState = {
  activeFloorId: "all",
  otherFloors: "ghost",
  exploded: false,
  explodeDistance: DEFAULT_EXPLODE_DISTANCE,
  selectedRoomId: null,
  hoveredRoomId: null,
  cameraCommand: { kind: "none", nonce: 0 },
};

const clamp = (v: number) => Math.min(MAX_EXPLODE_DISTANCE, Math.max(MIN_EXPLODE_DISTANCE, v));

export function viewerReducer(state: ViewerState, action: ViewerAction): ViewerState {
  switch (action.type) {
    case "selectFloor":
      return state.activeFloorId === action.floorId ? state : { ...state, activeFloorId: action.floorId };
    case "showAllFloors":
      return { ...state, activeFloorId: "all" };
    case "setOtherFloors":
      return { ...state, otherFloors: action.mode };
    case "toggleExplode":
      return { ...state, exploded: !state.exploded };
    case "setExploded":
      return { ...state, exploded: action.value };
    case "setExplodeDistance":
      // moving the slider implies the user wants the exploded view
      return { ...state, explodeDistance: clamp(action.value), exploded: action.value > 0 ? true : state.exploded };
    case "selectRoom": {
      const switchFloor =
        action.roomId && action.floorId && state.activeFloorId !== "all" && state.activeFloorId !== action.floorId;
      return {
        ...state,
        selectedRoomId: action.roomId,
        activeFloorId: switchFloor ? (action.floorId as string) : state.activeFloorId,
      };
    }
    case "hoverRoom":
      return state.hoveredRoomId === action.roomId ? state : { ...state, hoveredRoomId: action.roomId };
    case "resetCamera":
      return { ...state, cameraCommand: { kind: "reset", nonce: state.cameraCommand.nonce + 1 } };
    case "focusCamera":
      return { ...state, cameraCommand: { kind: "focus", nonce: state.cameraCommand.nonce + 1, bounds: action.bounds } };
    case "zoomCamera":
      return { ...state, cameraCommand: { kind: "zoom", nonce: state.cameraCommand.nonce + 1, factor: action.factor } };
  }
}
