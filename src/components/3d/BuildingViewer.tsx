"use client";
import { useProgress } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import { RotateCw } from "lucide-react";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Spinner } from "@/components/ui/Spinner";
import { useWebGLSupport } from "@/hooks/useWebGLSupport";
import { BuildingScene, type BuildingSceneProps } from "./BuildingScene";
import { LabelPortalContext } from "./SceneLabel";
import { SceneErrorBoundary } from "./SceneErrorBoundary";
import { WebGLFallback } from "./WebGLFallback";

export interface BuildingViewerProps extends BuildingSceneProps {
  /** click on empty space (not on a room) */
  onClearSelection: () => void;
}

/** Shows real model download progress (GLB mode). Procedural geometry needs no download. */
function ModelProgress() {
  const { active, progress } = useProgress();
  if (!active) return null;
  return (
    <div role="status" className="absolute inset-x-0 top-4 z-20 mx-auto flex w-fit items-center gap-2 rounded-full bg-white px-4 py-2 text-sm shadow-float">
      <Spinner className="size-4" />
      در حال بارگذاری مدل سه‌بعدی… {Math.round(progress)}٪
    </div>
  );
}

/**
 * The interactive 3D building viewer: orthographic isometric camera, demand-driven rendering, capped pixel ratio,
 * WebGL detection with a useful fallback, error boundary and loading / context-lost states.
 */
export default function BuildingViewer({ onClearSelection, ...scene }: BuildingViewerProps) {
  const support = useWebGLSupport();
  const [ready, setReady] = useState(false);
  const labelRoot = useRef<HTMLDivElement>(null);
  const [contextLost, setContextLost] = useState(false);

  if (support === "unsupported") return <WebGLFallback reason="unsupported" />;

  return (
    <SceneErrorBoundary fallback={<WebGLFallback reason="error" />}>
      <div className="un-viewer-bg relative size-full touch-none overflow-hidden" style={{ isolation: "isolate" }} data-testid="building-viewer" data-ready={ready ? "true" : "false"}>
        <LabelPortalContext.Provider value={labelRoot}>
        {support === "ok" && (
          <Canvas
            orthographic
            dpr={[1, 1.75]}
            frameloop="demand"
            gl={{ antialias: true, powerPreference: "high-performance" }}
            camera={{ near: -400, far: 800, zoom: 10, position: [60, 60, 60] }}
            onPointerMissed={onClearSelection}
            onCreated={({ gl, invalidate }) => {
              gl.domElement.addEventListener("webglcontextlost", (e) => {
                e.preventDefault();
                setContextLost(true);
              });
              requestAnimationFrame(() => {
                setReady(true);
                invalidate();
              });
            }}
          >
            <BuildingScene {...scene} />
          </Canvas>
        )}
        </LabelPortalContext.Provider>
        <div ref={labelRoot} aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden" />
        <ModelProgress />
        {!ready && support === "ok" && (
          <div role="status" className="absolute inset-0 z-10 grid place-items-center bg-gray-50/80">
            <span className="flex items-center gap-2 text-sm text-gray-500">
              <Spinner /> در حال آماده‌سازی نقشه سه‌بعدی…
            </span>
          </div>
        )}
        {contextLost && (
          <div role="alert" className="absolute inset-0 z-30 grid place-items-center bg-white/90 p-6 text-center">
            <div>
              <p className="mb-3 text-sm text-gray-700">ارتباط با کارت گرافیک قطع شد. برای ادامه صفحه را دوباره بارگذاری کنید.</p>
              <Button onClick={() => window.location.reload()}>
                <RotateCw className="size-4" aria-hidden />
                بارگذاری دوباره
              </Button>
            </div>
          </div>
        )}
      </div>
    </SceneErrorBoundary>
  );
}
