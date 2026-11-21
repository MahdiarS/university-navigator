"use client";
import { OrbitControls } from "@react-three/drei";
import { useThree } from "@react-three/fiber";
import { useEffect, useMemo } from "react";
import { BoxGeometry, ConeGeometry, Color, CylinderGeometry, MeshStandardMaterial, type OrthographicCamera } from "three";
import type { Campus } from "@/lib/data/types";
import { CAMPUS_BUILDING_COLORS, campusBounds, pathSegments } from "@/lib/model/campus";
import type { CameraCommand } from "@/lib/model/viewerState";
import { colors, sceneColors } from "@/lib/theme/tokens";
import { CameraRig } from "./CameraRig";
import { SceneLabel } from "./SceneLabel";

export interface CampusSceneProps {
  campus: Campus;
  selectedSlug: string | null;
  hoveredSlug: string | null;
  onHover: (slug: string | null) => void;
  onSelect: (slug: string) => void;
  cameraCommand: CameraCommand;
  /** slow turntable for the home page preview: no zoom/pan, nothing is clickable */
  preview?: boolean;
}

const std = (color: string, extra: ConstructorParameters<typeof MeshStandardMaterial>[0] = {}) =>
  new MeshStandardMaterial({ color: new Color(color), roughness: 0.9, metalness: 0.02, ...extra });

/**
 * Schematic procedural campus: ground, pedestrian paths, trees, the pilot building (clickable, with its entrance
 * marker) and placeholder volumes for buildings that are not modelled yet. Purely illustrative until real campus
 * data exists, and labelled as such by the page.
 */
export function CampusScene({ campus, selectedSlug, hoveredSlug, onHover, onSelect, cameraCommand, preview = false }: CampusSceneProps) {
  const invalidate = useThree((s) => s.invalidate);

  const res = useMemo(
    () => ({
      unit: new BoxGeometry(1, 1, 1),
      trunk: new CylinderGeometry(0.25, 0.3, 1.6, 8),
      crown: new ConeGeometry(1.5, 3.6, 10),
      path: std("#f7f9fc"),
      ground: std(sceneColors.ground, { roughness: 1 }),
      lawn: std("#dfe9e4", { roughness: 1 }),
      trunkMat: std("#8b7d6b"),
      crownMat: std("#8fb5a3"),
      pilot: std(CAMPUS_BUILDING_COLORS.pilot),
      pilotHover: std(colors.blue600, { emissive: new Color(colors.blue600), emissiveIntensity: 0.18 }),
      pilotSelected: std(colors.orange500, { emissive: new Color(colors.orange500), emissiveIntensity: 0.2 }),
      other: std(CAMPUS_BUILDING_COLORS.other, { transparent: true, opacity: 0.75 }),
      roof: std(CAMPUS_BUILDING_COLORS.roof),
      band: std("#ffffff"),
      entrance: std(colors.teal600, { emissive: new Color(colors.teal600), emissiveIntensity: 0.3 }),
    }),
    [],
  );
  useEffect(
    () => () => {
      for (const r of Object.values(res)) r.dispose();
    },
    [res],
  );
  // wake the demand-driven renderer when interaction state changes
  useEffect(() => {
    invalidate();
  }, [hoveredSlug, selectedSlug, invalidate]);

  const segments = useMemo(() => campus.paths.flatMap((p) => pathSegments(p.points, p.width)), [campus.paths]);
  const bounds = useMemo(() => campusBounds(campus), [campus]);
  const { width, depth } = campus.ground;

  return (
    <>
      <ambientLight intensity={1.2} />
      <directionalLight position={[50, 80, 40]} intensity={2.1} />
      <directionalLight position={[-40, 30, -30]} intensity={0.5} />

      {/* ground + lawn (never clickable) */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.05, 0]} geometry={res.unit} scale={[width * 1.6, depth * 1.8, 0.1]} material={res.ground} raycast={() => null} />
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]} geometry={res.unit} scale={[width, depth, 0.05]} material={res.lawn} raycast={() => null} />

      {segments.map((s, i) => (
        <mesh key={i} position={[s.x, 0.09, s.z]} rotation={[0, s.angle, 0]} scale={[s.length + s.width * 0.5, 0.06, s.width]} geometry={res.unit} material={res.path} raycast={() => null} />
      ))}

      {campus.trees.map((t, i) => (
        <group key={i} position={[t.x, 0, t.z]}>
          <mesh geometry={res.trunk} material={res.trunkMat} position={[0, 0.8, 0]} raycast={() => null} />
          <mesh geometry={res.crown} material={res.crownMat} position={[0, 3.2, 0]} raycast={() => null} />
        </group>
      ))}

      {campus.buildings.map((b, i) => {
        const slug = b.slug;
        const interactive = b.clickable && !preview && slug !== null;
        const selected = slug !== null && slug === selectedSlug;
        const hovered = slug !== null && slug === hoveredSlug;
        const material = !b.clickable ? res.other : selected ? res.pilotSelected : hovered ? res.pilotHover : res.pilot;
        const { width: w, depth: d, height: h } = b.size;
        return (
          <group key={`${b.label}-${i}`} position={[b.position.x, 0, b.position.z]}>
            <mesh
              name={slug ? `campus-building:${slug}` : "campus-building:placeholder"}
              geometry={res.unit}
              material={material}
              position={[0, h / 2, 0]}
              scale={[w, h, d]}
              raycast={interactive ? undefined : () => null}
              onPointerOver={interactive ? (e) => { e.stopPropagation(); onHover(slug); document.body.style.cursor = "pointer"; } : undefined}
              onPointerOut={interactive ? () => { onHover(null); document.body.style.cursor = ""; } : undefined}
              onClick={interactive ? (e) => { e.stopPropagation(); onSelect(slug!); } : undefined}
            />
            {/* roof slab + floor bands so the pilot building reads as a multi-storey block */}
            <mesh geometry={res.unit} material={res.roof} position={[0, h + 0.2, 0]} scale={[w + 0.6, 0.4, d + 0.6]} raycast={() => null} />
            {b.clickable &&
              [1 / 3, 2 / 3].map((f) => (
                <mesh key={f} geometry={res.unit} material={res.band} position={[0, h * f, 0]} scale={[w + 0.12, 0.18, d + 0.12]} raycast={() => null} />
              ))}
            {!preview && (
              <SceneLabel position={[0, h + 3, 0]} tone={selected ? "destination" : b.clickable ? "info" : "neutral"}>
                {b.label}
              </SceneLabel>
            )}
            {b.entrance && (
              <group position={[b.entrance.x - b.position.x, 0, b.entrance.z - b.position.z]}>
                <mesh geometry={res.unit} material={res.entrance} position={[0, 0.5, 0]} scale={[3.2, 1, 0.6]} raycast={() => null} name="campus-entrance-marker" />
                {!preview && (
                  <SceneLabel position={[0, 2.6, 0]} tone="start">
                    ورودی اصلی
                  </SceneLabel>
                )}
              </group>
            )}
          </group>
        );
      })}

      {preview ? (
        <>
          <OrbitControls makeDefault autoRotate autoRotateSpeed={0.6} enableZoom={false} enablePan={false} enableRotate={false} />
          <PreviewFraming bounds={bounds} />
        </>
      ) : (
        <CameraRig command={cameraCommand} homeBounds={bounds} />
      )}
    </>
  );
}

/** Frames the preview once; the turntable is driven by OrbitControls.autoRotate. */
function PreviewFraming({ bounds }: { bounds: ReturnType<typeof campusBounds> }) {
  const get = useThree((s) => s.get);
  const size = useThree((s) => s.size);
  const invalidate = useThree((s) => s.invalidate);
  useEffect(() => {
    const camera = get().camera as OrthographicCamera;
    const radius = Math.hypot(bounds.max.x - bounds.min.x, bounds.max.z - bounds.min.z) / 2;
    const zoom = Math.max(2, (Math.min(size.width, size.height) / 2 / radius) * 1.05);
    camera.position.set(80, 70, 80);
    camera.lookAt(0, 3, 0);
    camera.zoom = zoom;
    camera.updateProjectionMatrix();
    invalidate();
  }, [bounds, get, size, invalidate]);
  return null;
}
