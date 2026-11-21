"use client";
import { OrbitControls } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useRef, type ComponentRef } from "react";
import type { OrthographicCamera } from "three";
import {
  MAX_ZOOM,
  MIN_ZOOM,
  defaultPose,
  focusPose,
  stepPose,
  zoomPose,
  type CameraPose,
} from "@/lib/model/camera";
import type { BoundsLike } from "@/lib/model/layout";
import type { CameraCommand } from "@/lib/model/viewerState";

type Controls = ComponentRef<typeof OrbitControls>;

/** Camera + controls <-> CameraPose. The camera is a mutable Three.js object owned by the renderer. */
function readPose(camera: OrthographicCamera, c: Controls | null): CameraPose | null {
  if (!c) return null;
  return {
    target: { x: c.target.x, y: c.target.y, z: c.target.z },
    position: { x: camera.position.x, y: camera.position.y, z: camera.position.z },
    zoom: camera.zoom,
  };
}

function applyPose(camera: OrthographicCamera, c: Controls | null, pose: CameraPose): void {
  if (!c) return;
  camera.position.set(pose.position.x, pose.position.y, pose.position.z);
  camera.zoom = pose.zoom;
  camera.updateProjectionMatrix();
  c.target.set(pose.target.x, pose.target.y, pose.target.z);
  c.update();
}

/**
 * Orthographic isometric camera + orbit/zoom/pan controls (mouse: left rotate, wheel zoom, right pan;
 * touch: one finger rotate, two fingers zoom + pan). Camera commands from the viewer state (reset, focus on a
 * route, zoom buttons) are animated with damping; touching the scene cancels an animation in progress.
 */
export function CameraRig({ command, homeBounds }: { command: CameraCommand; homeBounds: BoundsLike }) {
  const size = useThree((s) => s.size);
  const invalidate = useThree((s) => s.invalidate);
  const controlsRef = useRef<Controls>(null);
  const goal = useRef<CameraPose | null>(null);
  const booted = useRef(false);
  const handled = useRef(0);

  // A new command only needs to wake the demand-driven render loop; it is processed in the next frame.
  useEffect(() => {
    invalidate();
  }, [command, invalidate]);

  // Stop an animation as soon as the user grabs the scene.
  useEffect(() => {
    const c = controlsRef.current;
    if (!c) return;
    const cancel = () => {
      goal.current = null;
    };
    c.addEventListener("start", cancel);
    return () => c.removeEventListener("start", cancel);
  }, []);

  useFrame((state, dt) => {
    const camera = state.camera as OrthographicCamera;
    // First frame with a real size: place the camera instantly (no fly-in on load).
    if (!booted.current) {
      if (size.width === 0 || size.height === 0 || !controlsRef.current) return;
      applyPose(camera, controlsRef.current, defaultPose(homeBounds, Math.min(size.width, size.height)));
      booted.current = true;
      invalidate();
      return;
    }
    const cur = readPose(camera, controlsRef.current);
    if (!cur) return;

    // Commands: reset (home view), focus (frame bounds, keep viewing direction), zoom (buttons).
    if (command.nonce !== handled.current) {
      handled.current = command.nonce;
      const minPx = Math.min(size.width, size.height);
      if (command.kind === "reset") goal.current = defaultPose(homeBounds, minPx);
      else if (command.kind === "focus") goal.current = focusPose(cur, command.bounds, minPx);
      else if (command.kind === "zoom") goal.current = zoomPose(goal.current ?? cur, command.factor);
    }

    const g = goal.current;
    if (!g) return;
    const { pose, settled } = stepPose(cur, g, Math.min(dt, 0.1));
    applyPose(camera, controlsRef.current, pose);
    if (settled) goal.current = null;
    else invalidate();
  });

  return (
    <OrbitControls
      ref={controlsRef}
      makeDefault
      enableDamping
      dampingFactor={0.14}
      minZoom={MIN_ZOOM}
      maxZoom={MAX_ZOOM}
      maxPolarAngle={Math.PI / 2 - 0.06}
      screenSpacePanning
      zoomSpeed={0.9}
      rotateSpeed={0.8}
    />
  );
}
