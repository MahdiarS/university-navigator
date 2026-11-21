"use client";
import { useSyncExternalStore } from "react";

export type WebGLSupport = "checking" | "ok" | "unsupported";

let cached: WebGLSupport | null = null;

/** Probes once for a WebGL context (browsers cap live contexts, so the probe context is released immediately). */
export function detectWebGL(): boolean {
  try {
    const canvas = document.createElement("canvas");
    const gl = (canvas.getContext("webgl2") ?? canvas.getContext("webgl")) as WebGLRenderingContext | WebGL2RenderingContext | null;
    if (!gl) return false;
    gl.getExtension("WEBGL_lose_context")?.loseContext();
    return true;
  } catch {
    return false;
  }
}

const subscribe = () => () => {};
const getSnapshot = (): WebGLSupport => {
  if (cached === null) cached = detectWebGL() ? "ok" : "unsupported";
  return cached;
};
const getServerSnapshot = (): WebGLSupport => "checking";

/** "checking" on the server / first paint, then "ok" or "unsupported". */
export function useWebGLSupport(): WebGLSupport {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
