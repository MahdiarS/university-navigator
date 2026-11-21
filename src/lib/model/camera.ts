import {
  ISO_DIRECTION,
  boundsCenter,
  boundsRadius,
  damp,
  fitZoom,
  isoCameraPosition,
  type BoundsLike,
  type Vec3,
} from "./layout";

/**
 * Pure camera maths for the orthographic isometric viewer (no Three.js import, unit-tested).
 *
 * A pose is (target, position, zoom). For an orthographic camera the distance to the target does not change
 * the picture, only the near/far clipping, so we keep a fixed generous distance and express "how big" with zoom
 * (pixels per world unit).
 */
export interface CameraPose {
  target: Vec3;
  position: Vec3;
  zoom: number;
}

export const CAMERA_DISTANCE = 140;
export const MIN_ZOOM = 3;
export const MAX_ZOOM = 110;
/** A room or a short route never needs to be magnified past this. */
export const MAX_FOCUS_ZOOM = 38;

const clampZoom = (z: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z));

/** The default isometric view that frames the whole bounds. */
export function defaultPose(bounds: BoundsLike, viewportMinPx: number): CameraPose {
  const target = boundsCenter(bounds);
  return {
    target,
    position: isoCameraPosition(target, CAMERA_DISTANCE),
    zoom: clampZoom(fitZoom(boundsRadius(bounds), viewportMinPx, 1.12, MIN_ZOOM, MAX_ZOOM)),
  };
}

/** Frame `bounds` while keeping the direction the user is currently looking from. */
export function focusPose(current: CameraPose, bounds: BoundsLike, viewportMinPx: number): CameraPose {
  const target = boundsCenter(bounds);
  let dx = current.position.x - current.target.x;
  let dy = current.position.y - current.target.y;
  let dz = current.position.z - current.target.z;
  let len = Math.hypot(dx, dy, dz);
  if (len < 1e-6) {
    dx = ISO_DIRECTION.x;
    dy = ISO_DIRECTION.y;
    dz = ISO_DIRECTION.z;
    len = Math.hypot(dx, dy, dz);
  }
  const k = CAMERA_DISTANCE / len;
  return {
    target,
    position: { x: target.x + dx * k, y: target.y + dy * k, z: target.z + dz * k },
    zoom: clampZoom(fitZoom(boundsRadius(bounds), viewportMinPx, 1.3, MIN_ZOOM, MAX_FOCUS_ZOOM)),
  };
}

export function zoomPose(current: CameraPose, factor: number): CameraPose {
  return { ...current, zoom: clampZoom(current.zoom * factor) };
}

export interface StepResult {
  pose: CameraPose;
  settled: boolean;
}

const lerpVec = (a: Vec3, b: Vec3, lambda: number, dt: number): Vec3 => ({
  x: damp(a.x, b.x, lambda, dt),
  y: damp(a.y, b.y, lambda, dt),
  z: damp(a.z, b.z, lambda, dt),
});

/** Frame-rate independent move of `current` towards `goal`. `settled` once visually identical. */
export function stepPose(current: CameraPose, goal: CameraPose, dt: number, lambda = 7): StepResult {
  const pose: CameraPose = {
    target: lerpVec(current.target, goal.target, lambda, dt),
    position: lerpVec(current.position, goal.position, lambda, dt),
    zoom: damp(current.zoom, goal.zoom, lambda, dt),
  };
  const dist =
    Math.hypot(pose.target.x - goal.target.x, pose.target.y - goal.target.y, pose.target.z - goal.target.z) +
    Math.hypot(pose.position.x - goal.position.x, pose.position.y - goal.position.y, pose.position.z - goal.position.z);
  const settled = dist < 0.01 && Math.abs(pose.zoom - goal.zoom) < 0.01;
  return { pose: settled ? goal : pose, settled };
}
