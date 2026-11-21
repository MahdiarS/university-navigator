"use client";
import { Line, OrbitControls } from "@react-three/drei";
import { useThree } from "@react-three/fiber";
import { useEffect, useMemo } from "react";
import {
  BoxGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  ExtrudeGeometry,
  MeshStandardMaterial,
  Shape,
  SphereGeometry,
  Vector2,
  type OrthographicCamera,
} from "three";
import type { Campus } from "@/lib/data/types";
import { campusBounds, campusKey, footprintShapePoints, pathSegments, type CampusBuilding } from "@/lib/model/campus";
import { toPersianDigits } from "@/lib/search/normalize";
import type { CameraCommand } from "@/lib/model/viewerState";
import { colors, sceneColors } from "@/lib/theme/tokens";
import { CameraRig } from "./CameraRig";
import { CampusScenery } from "./CampusScenery";
import { SceneLabel } from "./SceneLabel";

export interface CampusSceneRoute {
  /** walking route on the ground, entrance first (meters, X east, Z south) */
  points: { x: number; z: number }[];
}

export interface CampusSceneProps {
  campus: Campus;
  /** selection / hover keys are `campusKey(building)` values */
  selectedKey: string | null;
  hoveredKey: string | null;
  onHover: (key: string | null) => void;
  onSelect: (key: string) => void;
  cameraCommand: CameraCommand;
  /** outdoor route drawn as a raised ribbon with direction arrows; labels the start entrance */
  route?: CampusSceneRoute | null;
  /** entrance the route starts from (highlighted label) */
  routeStartId?: string | null;
  /** slow turntable for the home page preview: no zoom/pan, nothing is clickable */
  preview?: boolean;
}

const std = (color: string, extra: ConstructorParameters<typeof MeshStandardMaterial>[0] = {}) =>
  new MeshStandardMaterial({ color: new Color(color), roughness: 0.85, metalness: 0.03, ...extra });

const STOREY = 3.6;
const WALL = "#ece6da";

const shapeOf = (poly: readonly { x: number; z: number }[]) => new Shape(footprintShapePoints(poly).map(([x, y]) => new Vector2(x, y)));
const none = () => null;

/**
 * Campus scene. Buildings with a closed outline in the site plan are extruded from that real footprint (plinth, walls,
 * a glazing band per storey, cornice, overhanging roof with rooftop units); numbers without a closed outline are shown as
 * pins (never as an invented shape). Heights are a visualisation estimate (the plan carries none). Everything outside the
 * buildings lives in CampusScenery. Falls back to box buildings for the older procedural demo campus.
 */
export function CampusScene({
  campus,
  selectedKey,
  hoveredKey,
  onHover,
  onSelect,
  cameraCommand,
  route,
  routeStartId,
  preview = false,
}: CampusSceneProps) {
  const invalidate = useThree((s) => s.invalidate);

  const res = useMemo(
    () => ({
      unit: new BoxGeometry(1, 1, 1),
      pinStem: new CylinderGeometry(0.25, 0.25, 1, 8),
      pinHead: new SphereGeometry(1, 16, 12),
      chevron: new ConeGeometry(1, 1, 3),
      beacon: new ConeGeometry(1, 1, 12),
      joint: new CylinderGeometry(1, 1, 1, 16),
      building: std(WALL),
      hover: std(colors.blue400, { emissive: new Color(colors.blue600), emissiveIntensity: 0.16 }),
      selected: std(colors.orange500, { emissive: new Color(colors.orange500), emissiveIntensity: 0.18 }),
      other: std("#c3ccd9", { transparent: true, opacity: 0.8 }),
      roof: std("#3b5878"),
      roofSelected: std("#d9631a", { emissive: new Color(colors.orange500), emissiveIntensity: 0.2 }),
      roofHover: std("#2f6fd0", { emissive: new Color(colors.blue600), emissiveIntensity: 0.15 }),
      plinth: std("#8f98a6"),
      cornice: std("#f8f5ee"),
      glass: std("#3a6489", { roughness: 0.25, metalness: 0.35 }),
      unitBox: std("#aeb6c2", { metalness: 0.3 }),
      band: std("#ffffff"),
      entrance: std(colors.teal600, { emissive: new Color(colors.teal600), emissiveIntensity: 0.3 }),
      pin: std(colors.navy800),
      routeCasing: std("#ffffff", { roughness: 0.6 }),
      routeCore: std(sceneColors.route, { emissive: new Color(sceneColors.route), emissiveIntensity: 0.35 }),
      arrow: std("#ffffff", { emissive: new Color("#ffffff"), emissiveIntensity: 0.3 }),
      beaconMat: std(colors.orange500, { emissive: new Color(colors.orange500), emissiveIntensity: 0.4 }),
    }),
    [],
  );
  useEffect(
    () => () => {
      for (const r of Object.values(res)) r.dispose();
    },
    [res],
  );

  const footprints = useMemo(() => {
    const map = new Map<
      string,
      {
        body: ExtrudeGeometry;
        plinth: ExtrudeGeometry;
        bands: ExtrudeGeometry[];
        cornice: ExtrudeGeometry;
        roof: ExtrudeGeometry;
        storeys: number;
      }
    >();
    for (const b of campus.buildings) {
      if (!b.footprint || b.kind === "marker") continue;
      const body = shapeOf(b.footprint);
      const trim = shapeOf(b.trim ?? b.footprint);
      const h = b.size.height;
      const storeys = Math.max(1, b.floors ?? Math.round(h / STOREY));
      map.set(campusKey(b), {
        body: new ExtrudeGeometry(body, { depth: h, bevelEnabled: false }),
        plinth: new ExtrudeGeometry(trim, { depth: 0.7, bevelEnabled: false }),
        bands: Array.from({ length: storeys }, () => new ExtrudeGeometry(trim, { depth: 1.5, bevelEnabled: false })),
        cornice: new ExtrudeGeometry(trim, { depth: 0.35, bevelEnabled: false }),
        roof: new ExtrudeGeometry(trim, { depth: 0.45, bevelEnabled: false }),
        storeys,
      });
    }
    return map;
  }, [campus.buildings]);
  useEffect(
    () => () => {
      for (const g of footprints.values()) {
        g.body.dispose();
        g.plinth.dispose();
        g.cornice.dispose();
        g.roof.dispose();
        // the band geometries of one building share a single shape: dispose each once
        g.bands.forEach((x) => x.dispose());
      }
    },
    [footprints],
  );

  // wake the demand-driven renderer when interaction state or the route changes
  useEffect(() => {
    invalidate();
  }, [hoveredKey, selectedKey, route, invalidate]);

  const segments = useMemo(() => campus.paths.flatMap((p) => pathSegments(p.points, p.width)), [campus.paths]);
  const routeSegments = useMemo(() => (route ? pathSegments(route.points, 2) : []), [route]);
  const chevrons = useMemo(() => {
    const out: { x: number; z: number; angle: number }[] = [];
    for (const s of routeSegments) {
      const n = Math.floor(s.length / 7);
      for (let i = 1; i <= n; i++) {
        const t = i / (n + 1);
        // segment runs along its local +X (rotation.y = angle): step along that direction from the segment centre
        const off = (t - 0.5) * s.length;
        out.push({ x: s.x + Math.cos(-s.angle) * off, z: s.z + Math.sin(-s.angle) * off, angle: s.angle });
      }
    }
    return out;
  }, [routeSegments]);
  const bounds = useMemo(() => campusBounds(campus), [campus]);
  const arrival = route && route.points.length > 1 ? route.points[route.points.length - 1]! : null;

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
      <hemisphereLight args={["#e3efff", "#8c7f6b", 1.0]} />
      <ambientLight intensity={0.35} />
      <directionalLight
        position={[90, 130, 60]}
        intensity={2.3}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-190}
        shadow-camera-right={190}
        shadow-camera-top={190}
        shadow-camera-bottom={-190}
        shadow-camera-near={1}
        shadow-camera-far={500}
        shadow-bias={-0.0004}
        shadow-normalBias={0.4}
      />
      <directionalLight position={[-60, 40, -50]} intensity={0.45} />

      <CampusScenery campus={campus} />

      {segments.map((s, i) => (
        <mesh
          key={i}
          position={[s.x, 0.12, s.z]}
          rotation={[0, s.angle, 0]}
          scale={[s.length + s.width * 0.5, 0.12, s.width]}
          geometry={res.unit}
          material={res.band}
          receiveShadow
          raycast={none}
        />
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
          // real footprint: the Shape lives in XY, so rotate -90deg about X to stand it up (see footprintShapePoints)
          const up = [-Math.PI / 2, 0, 0] as const;
          return (
            <group key={key} name={`campus-building-group:${key}`}>
              <mesh
                name={`campus-building:${key}`}
                geometry={geometry.body}
                material={material}
                rotation={up}
                castShadow
                receiveShadow
                raycast={interactive ? undefined : none}
                {...hoverHandlers(b, interactive)}
              />
              <mesh geometry={geometry.plinth} material={res.plinth} rotation={up} castShadow raycast={none} />
              {b.trim &&
                geometry.bands.map((g, i) => (
                  <mesh key={i} geometry={g} material={res.glass} rotation={up} position={[0, i * STOREY + 1.05, 0]} raycast={none} />
                ))}
              <mesh geometry={geometry.cornice} material={res.cornice} rotation={up} position={[0, h - 0.35, 0]} raycast={none} />
              <mesh
                geometry={geometry.roof}
                material={selected ? res.roofSelected : hovered ? res.roofHover : res.roof}
                rotation={up}
                position={[0, h, 0]}
                castShadow
                raycast={none}
              />
              <RoofUnits
                x={b.position.x}
                z={b.position.z}
                h={h + 0.45}
                w={Math.min(w, d)}
                unit={res.unit}
                material={res.unitBox}
                seed={b.number ?? 0}
              />
              {!preview && (
                <SceneLabel position={[b.position.x, h + 4, b.position.z]} tone={tone}>
                  {labelText}
                </SceneLabel>
              )}
            </group>
          );
        }

        if (b.kind === "marker") {
          // no closed outline in the drawing: a pin marks the label position instead of an invented shape
          const pinColor = b.clickable ? (selected ? res.selected : hovered ? res.hover : res.pin) : res.other;
          return (
            <group key={key} position={[b.position.x, 0, b.position.z]}>
              <mesh
                name={`campus-marker:${key}`}
                geometry={res.pinStem}
                material={pinColor}
                position={[0, 2, 0]}
                scale={[1, 4, 1]}
                castShadow
                raycast={none}
              />
              <mesh
                geometry={res.pinHead}
                material={pinColor}
                position={[0, 4.4, 0]}
                scale={1.3}
                castShadow
                raycast={interactive ? undefined : none}
                {...hoverHandlers(b, interactive)}
              />
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
            <mesh
              name={b.slug ? `campus-building:${b.slug}` : "campus-building:placeholder"}
              geometry={res.unit}
              material={material}
              position={[0, h / 2, 0]}
              scale={[w, h, d]}
              castShadow
              receiveShadow
              raycast={interactive ? undefined : none}
              {...hoverHandlers(b, interactive)}
            />
            <mesh
              geometry={res.unit}
              material={res.roof}
              position={[0, h + 0.2, 0]}
              scale={[w + 0.6, 0.4, d + 0.6]}
              castShadow
              raycast={none}
            />
            {b.clickable &&
              [1 / 3, 2 / 3].map((f) => (
                <mesh
                  key={f}
                  geometry={res.unit}
                  material={res.band}
                  position={[0, h * f, 0]}
                  scale={[w + 0.12, 0.18, d + 0.12]}
                  raycast={none}
                />
              ))}
            {!preview && (
              <SceneLabel position={[0, h + 3, 0]} tone={tone}>
                {b.label}
              </SceneLabel>
            )}
            {b.entrance && (
              <group position={[b.entrance.x - b.position.x, 0, b.entrance.z - b.position.z]}>
                <mesh
                  geometry={res.unit}
                  material={res.entrance}
                  position={[0, 0.5, 0]}
                  scale={[3.2, 1, 0.6]}
                  raycast={none}
                  name="campus-entrance-marker"
                />
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
          <mesh
            geometry={res.unit}
            material={res.entrance}
            position={[0, 0.9, 0]}
            scale={[2.4, 1.8, 2.4]}
            castShadow
            raycast={none}
            name="campus-entrance-marker"
          />
          {!preview && (
            <SceneLabel position={[0, 6, 0]} tone={routeStartId === e.id ? "destination" : "start"}>
              {e.label}
            </SceneLabel>
          )}
        </group>
      ))}

      {/* walking route: white casing + blue ribbon with real thickness, round joints, direction arrows, arrival beacon */}
      {route && routeSegments.length > 0 && (
        <group name="campus-route">
          {routeSegments.map((s, i) => (
            <group key={i}>
              <mesh
                geometry={res.unit}
                material={res.routeCasing}
                position={[s.x, 0.22, s.z]}
                rotation={[0, s.angle, 0]}
                scale={[s.length, 0.26, s.width + 0.7]}
                raycast={none}
              />
              <mesh
                geometry={res.unit}
                material={res.routeCore}
                position={[s.x, 0.36, s.z]}
                rotation={[0, s.angle, 0]}
                scale={[s.length, 0.16, s.width]}
                raycast={none}
              />
            </group>
          ))}
          {route.points.map((p, i) => (
            <group key={i} position={[p.x, 0, p.z]}>
              <mesh
                geometry={res.joint}
                material={res.routeCasing}
                position={[0, 0.22, 0]}
                scale={[(2 + 0.7) / 2, 0.26, (2 + 0.7) / 2]}
                raycast={none}
              />
              <mesh geometry={res.joint} material={res.routeCore} position={[0, 0.36, 0]} scale={[1, 0.16, 1]} raycast={none} />
            </group>
          ))}
          {chevrons.map((c, i) => (
            <mesh
              key={i}
              geometry={res.chevron}
              material={res.arrow}
              position={[c.x, 0.62, c.z]}
              rotation={[0, c.angle, -Math.PI / 2]}
              scale={[0.6, 1.5, 0.6]}
              raycast={none}
            />
          ))}
          {/* always-visible hairline so the route stays readable behind buildings */}
          <Line
            points={route.points.map((p) => [p.x, 0.9, p.z] as [number, number, number])}
            color={sceneColors.route}
            lineWidth={2}
            depthTest={false}
            transparent
            opacity={0.45}
            renderOrder={18}
            raycast={none}
          />
          {arrival && (
            <group position={[arrival.x, 0, arrival.z]}>
              <mesh
                geometry={res.beacon}
                material={res.beaconMat}
                position={[0, 2.2, 0]}
                rotation={[Math.PI, 0, 0]}
                scale={[0.9, 2.2, 0.9]}
                castShadow
                raycast={none}
              />
              <mesh geometry={res.pinHead} material={res.beaconMat} position={[0, 4.1, 0]} scale={0.8} castShadow raycast={none} />
            </group>
          )}
        </group>
      )}

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

/** A few rooftop units (AC boxes, a stair head), placed deterministically from the building number. */
function RoofUnits({
  x,
  z,
  h,
  w,
  unit,
  material,
  seed,
}: {
  x: number;
  z: number;
  h: number;
  w: number;
  unit: BoxGeometry;
  material: MeshStandardMaterial;
  seed: number;
}) {
  const spec = useMemo(() => {
    const k = (seed * 9301 + 49297) % 233280;
    const a = (k / 233280) * Math.PI * 2;
    const r = Math.max(1, w * 0.18);
    return [
      { dx: Math.cos(a) * r, dz: Math.sin(a) * r, sx: 2.2, sy: 1.1, sz: 1.5 },
      { dx: -Math.cos(a) * r * 0.8, dz: -Math.sin(a) * r * 0.8, sx: 1.4, sy: 0.8, sz: 1.4 },
    ];
  }, [seed, w]);
  return (
    <>
      {spec.map((s, i) => (
        <mesh
          key={i}
          geometry={unit}
          material={material}
          position={[x + s.dx, h + s.sy / 2, z + s.dz]}
          scale={[s.sx, s.sy, s.sz]}
          castShadow
          raycast={none}
        />
      ))}
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
