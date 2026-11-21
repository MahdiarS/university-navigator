"use client";
import { OrbitControls } from "@react-three/drei";
import { useThree } from "@react-three/fiber";
import { useEffect, useMemo } from "react";
import {
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  ExtrudeGeometry,
  LineBasicMaterial,
  MeshStandardMaterial,
  Shape,
  SphereGeometry,
  Vector2,
  type OrthographicCamera,
} from "three";
import type { Campus } from "@/lib/data/types";
import { CAMPUS_BUILDING_COLORS, campusBounds, campusKey, footprintShapePoints, pathSegments, polylinesToSegmentPositions, type CampusBuilding } from "@/lib/model/campus";
import { toPersianDigits } from "@/lib/search/normalize";
import type { CameraCommand } from "@/lib/model/viewerState";
import { colors, sceneColors } from "@/lib/theme/tokens";
import { CameraRig } from "./CameraRig";
import { SceneLabel } from "./SceneLabel";

export interface CampusSceneProps {
  campus: Campus;
  /** selection / hover keys are `campusKey(building)` values */
  selectedKey: string | null;
  hoveredKey: string | null;
  onHover: (key: string | null) => void;
  onSelect: (key: string) => void;
  cameraCommand: CameraCommand;
  /** slow turntable for the home page preview: no zoom/pan, nothing is clickable */
  preview?: boolean;
}

const std = (color: string, extra: ConstructorParameters<typeof MeshStandardMaterial>[0] = {}) =>
  new MeshStandardMaterial({ color: new Color(color), roughness: 0.9, metalness: 0.02, ...extra });

const LINE_COLORS = { vegetation: "#8fb5a3", sports: "#2f8f86", site: "#9aa8bb" } as const;
/** just above the lawn slab (top at y = 0.045) so ground lines never z-fight with it */
const LINE_Y = 0.07;

/**
 * Campus scene. Buildings with a closed outline in the site plan are extruded from that real footprint; numbers
 * without a closed outline are shown as pins (never as an invented shape). Heights are a visualisation estimate
 * (the plan carries none). Falls back gracefully for the older procedural demo campus (box buildings, paths, trees).
 */
export function CampusScene({ campus, selectedKey, hoveredKey, onHover, onSelect, cameraCommand, preview = false }: CampusSceneProps) {
  const invalidate = useThree((s) => s.invalidate);

  const res = useMemo(
    () => ({
      unit: new BoxGeometry(1, 1, 1),
      trunk: new CylinderGeometry(0.25, 0.3, 1.6, 8),
      crown: new ConeGeometry(1.5, 3.6, 10),
      pinStem: new CylinderGeometry(0.25, 0.25, 1, 8),
      pinHead: new SphereGeometry(1, 16, 12),
      path: std("#f7f9fc"),
      ground: std(sceneColors.ground, { roughness: 1 }),
      lawn: std("#dfe9e4", { roughness: 1 }),
      trunkMat: std("#8b7d6b"),
      crownMat: std("#8fb5a3"),
      building: std(CAMPUS_BUILDING_COLORS.pilot),
      hover: std(colors.blue600, { emissive: new Color(colors.blue600), emissiveIntensity: 0.18 }),
      selected: std(colors.orange500, { emissive: new Color(colors.orange500), emissiveIntensity: 0.2 }),
      other: std(CAMPUS_BUILDING_COLORS.other, { transparent: true, opacity: 0.75 }),
      roof: std(CAMPUS_BUILDING_COLORS.roof),
      band: std("#ffffff"),
      entrance: std(colors.teal600, { emissive: new Color(colors.teal600), emissiveIntensity: 0.3 }),
      line: {
        vegetation: new LineBasicMaterial({ color: LINE_COLORS.vegetation }),
        sports: new LineBasicMaterial({ color: LINE_COLORS.sports }),
        site: new LineBasicMaterial({ color: LINE_COLORS.site }),
      },
    }),
    [],
  );
  useEffect(
    () => () => {
      for (const [name, r] of Object.entries(res)) {
        if (name === "line") Object.values(res.line).forEach((m) => m.dispose());
        else (r as { dispose(): void }).dispose();
      }
    },
    [res],
  );

  // One extruded body + roof slab per building footprint, and one vertex buffer per linework layer.
  const footprints = useMemo(() => {
    const map = new Map<string, { body: ExtrudeGeometry; roof: ExtrudeGeometry }>();
    for (const b of campus.buildings) {
      if (!b.footprint || b.kind === "marker") continue;
      const shape = new Shape(footprintShapePoints(b.footprint).map(([x, y]) => new Vector2(x, y)));
      map.set(campusKey(b), {
        body: new ExtrudeGeometry(shape, { depth: b.size.height, bevelEnabled: false }),
        roof: new ExtrudeGeometry(shape, { depth: 0.4, bevelEnabled: false }),
      });
    }
    return map;
  }, [campus.buildings]);
  useEffect(
    () => () => {
      for (const g of footprints.values()) {
        g.body.dispose();
        g.roof.dispose();
      }
    },
    [footprints],
  );
  const linework = useMemo(
    () =>
      (campus.linework ?? []).map((layer) => {
        const geometry = new BufferGeometry();
        geometry.setAttribute("position", new BufferAttribute(polylinesToSegmentPositions(layer.polylines, LINE_Y), 3));
        return { kind: layer.kind, geometry };
      }),
    [campus.linework],
  );
  useEffect(
    () => () => {
      for (const l of linework) l.geometry.dispose();
    },
    [linework],
  );

  // wake the demand-driven renderer when interaction state changes
  useEffect(() => {
    invalidate();
  }, [hoveredKey, selectedKey, invalidate]);

  const segments = useMemo(() => campus.paths.flatMap((p) => pathSegments(p.points, p.width)), [campus.paths]);
  const bounds = useMemo(() => campusBounds(campus), [campus]);
  const { width, depth } = campus.ground;

  const hoverHandlers = (b: CampusBuilding, interactive: boolean) =>
    interactive
      ? {
          onPointerOver: (e: { stopPropagation(): void }) => {
            e.stopPropagation();
            onHover(campusKey(b));
            document.body.style.cursor = "pointer";
          },
          onPointerOut: () => {
            onHover(null);
            document.body.style.cursor = "";
          },
          onClick: (e: { stopPropagation(): void }) => {
            e.stopPropagation();
            onSelect(campusKey(b));
          },
        }
      : {};

  return (
    <>
      <ambientLight intensity={1.2} />
      <directionalLight position={[50, 80, 40]} intensity={2.1} />
      <directionalLight position={[-40, 30, -30]} intensity={0.5} />

      {/* ground + lawn (never clickable) */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.05, 0]} geometry={res.unit} scale={[width * 1.6, depth * 1.8, 0.1]} material={res.ground} raycast={() => null} />
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]} geometry={res.unit} scale={[width, depth, 0.05]} material={res.lawn} raycast={() => null} />

      {linework.map((l) => (
        <lineSegments key={l.kind} geometry={l.geometry} material={res.line[l.kind]} raycast={() => null} />
      ))}

      {segments.map((s, i) => (
        <mesh key={i} position={[s.x, 0.09, s.z]} rotation={[0, s.angle, 0]} scale={[s.length + s.width * 0.5, 0.06, s.width]} geometry={res.unit} material={res.path} raycast={() => null} />
      ))}

      {campus.trees.map((t, i) => (
        <group key={i} position={[t.x, 0, t.z]}>
          <mesh geometry={res.trunk} material={res.trunkMat} position={[0, 0.8, 0]} raycast={() => null} />
          <mesh geometry={res.crown} material={res.crownMat} position={[0, 3.2, 0]} raycast={() => null} />
        </group>
      ))}

      {campus.buildings.map((b) => {
        const key = campusKey(b);
        const interactive = b.clickable && !preview;
        const selected = key === selectedKey;
        const hovered = key === hoveredKey;
        const material = !b.clickable ? res.other : selected ? res.selected : hovered ? res.hover : res.building;
        const { width: w, depth: d, height: h } = b.size;
        const geometry = footprints.get(key);
        const shortName = b.number ? toPersianDigits(b.number) : b.label;
        const labelText = selected || hovered ? b.label : shortName;
        const tone = selected ? "destination" : hovered ? "selected" : b.clickable ? "info" : "neutral";

        if (geometry && b.footprint) {
          // real footprint: extruded; the Shape lives in XY, so rotate -90deg about X to stand it up (see footprintShapePoints)
          return (
            <group key={key}>
              <mesh name={`campus-building:${key}`} geometry={geometry.body} material={material} rotation={[-Math.PI / 2, 0, 0]} raycast={interactive ? undefined : () => null} {...hoverHandlers(b, interactive)} />
              <mesh geometry={geometry.roof} material={res.roof} rotation={[-Math.PI / 2, 0, 0]} position={[0, h, 0]} raycast={() => null} />
              {!preview && (
                <SceneLabel position={[b.position.x, h + 3, b.position.z]} tone={tone}>
                  {labelText}
                </SceneLabel>
              )}
            </group>
          );
        }

        if (b.kind === "marker") {
          // no closed outline in the drawing: a pin marks the label position instead of an invented shape
          const pinColor = b.clickable ? (selected ? res.selected : hovered ? res.hover : res.building) : res.other;
          return (
            <group key={key} position={[b.position.x, 0, b.position.z]}>
              <mesh name={`campus-marker:${key}`} geometry={res.pinStem} material={pinColor} position={[0, 2, 0]} scale={[1, 4, 1]} raycast={() => null} />
              <mesh geometry={res.pinHead} material={pinColor} position={[0, 4.4, 0]} scale={1.3} raycast={interactive ? undefined : () => null} {...hoverHandlers(b, interactive)} />
              {!preview && (
                <SceneLabel position={[0, 7.2, 0]} tone={tone}>
                  {labelText}
                </SceneLabel>
              )}
            </group>
          );
        }

        // legacy procedural demo campus: axis-aligned box with roof slab and floor bands
        return (
          <group key={key} position={[b.position.x, 0, b.position.z]}>
            <mesh name={b.slug ? `campus-building:${b.slug}` : "campus-building:placeholder"} geometry={res.unit} material={material} position={[0, h / 2, 0]} scale={[w, h, d]} raycast={interactive ? undefined : () => null} {...hoverHandlers(b, interactive)} />
            <mesh geometry={res.unit} material={res.roof} position={[0, h + 0.2, 0]} scale={[w + 0.6, 0.4, d + 0.6]} raycast={() => null} />
            {b.clickable &&
              [1 / 3, 2 / 3].map((f) => (
                <mesh key={f} geometry={res.unit} material={res.band} position={[0, h * f, 0]} scale={[w + 0.12, 0.18, d + 0.12]} raycast={() => null} />
              ))}
            {!preview && (
              <SceneLabel position={[0, h + 3, 0]} tone={tone}>
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

      {(campus.entrances ?? []).map((e) => (
        <group key={e.id} position={[e.x, 0, e.z]}>
          <mesh geometry={res.unit} material={res.entrance} position={[0, 0.9, 0]} scale={[2.4, 1.8, 2.4]} raycast={() => null} name="campus-entrance-marker" />
          {!preview && (
            <SceneLabel position={[0, 4, 0]} tone="start">
              {e.label}
            </SceneLabel>
          )}
        </group>
      ))}

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
