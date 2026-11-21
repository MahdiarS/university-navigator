"use client";
import { Canvas } from "@react-three/fiber";
import { useRef, useState } from "react";
import { Spinner } from "@/components/ui/Spinner";
import { useWebGLSupport } from "@/hooks/useWebGLSupport";
import { CampusScene, type CampusSceneProps } from "./CampusScene";
import { LabelPortalContext } from "./SceneLabel";
import { SceneErrorBoundary } from "./SceneErrorBoundary";
import { WebGLFallback } from "./WebGLFallback";

/**
 * Canvas wrapper for the campus scene: orthographic isometric camera, capped pixel ratio, WebGL detection with a
 * useful fallback and an error boundary. The home-page preview runs a slow turntable (continuous rendering);
 * the interactive campus renders on demand.
 */
export default function CampusViewer(props: CampusSceneProps) {
  const support = useWebGLSupport();
  const [ready, setReady] = useState(false);
  const labelRoot = useRef<HTMLDivElement>(null);
  if (support === "unsupported") return <WebGLFallback reason="unsupported" />;

  return (
    <SceneErrorBoundary fallback={<WebGLFallback reason="error" />}>
      <div className="un-viewer-bg relative size-full touch-none overflow-hidden" style={{ isolation: "isolate" }} data-testid="campus-viewer" data-ready={ready ? "true" : "false"}>
        <LabelPortalContext.Provider value={labelRoot}>
        {support === "ok" && (
          <Canvas
            orthographic
            dpr={[1, props.preview ? 1.5 : 1.75]}
            frameloop={props.preview ? "always" : "demand"}
            gl={{ antialias: true, powerPreference: "high-performance" }}
            camera={{ near: -400, far: 800, zoom: 8, position: [80, 70, 80] }}
            onCreated={({ invalidate }) => {
              requestAnimationFrame(() => {
                setReady(true);
                invalidate();
              });
            }}
          >
            <CampusScene {...props} />
          </Canvas>
        )}
        </LabelPortalContext.Provider>
        <div ref={labelRoot} aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden" />
        {!ready && support === "ok" && (
          <div role="status" className="absolute inset-0 z-10 grid place-items-center bg-gray-50/80">
            <span className="flex items-center gap-2 text-sm text-gray-500">
              <Spinner /> در حال آماده‌سازی نقشه پردیس…
            </span>
          </div>
        )}
      </div>
    </SceneErrorBoundary>
  );
}
