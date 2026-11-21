"use client";
import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import {
  BoxGeometry,
  CanvasTexture,
  Color,
  ConeGeometry,
  CylinderGeometry,
  ExtrudeGeometry,
  IcosahedronGeometry,
  InstancedMesh,
  MeshStandardMaterial,
  Object3D,
  Path,
  RepeatWrapping,
  Shape,
  SRGBColorSpace,
  Vector2,
  type Material,
} from "three";
import type { Campus } from "@/lib/data/types";
import { footprintShapePoints, nearestEdgeAngle, orientedRect, polylineBoxes, scalePolygon, type XZ } from "@/lib/model/campus";

/**
 * Everything that is not a building: lawn slab with soil edge, park, planting beds, sports pitch and court, pond,
 * trees, gazebos, entrance gates, kerbs and hedges. All of it is real 3D geometry (thickness, edges, shadows) — nothing is a
 * flat picture. Park, beds, kerbs, pitch/court positions come from the CAD site plan; the pond size, trees and gazebos are
 * symbolic (see campus.source.note) and flagged `decorative` in the data.
 */
const rnd = (seed: number) => {
  // mulberry32: deterministic, so the scene looks identical on every load
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

const mat = (color: string, extra: ConstructorParameters<typeof MeshStandardMaterial>[0] = {}) =>
  new MeshStandardMaterial({
    color: new Color(color),
    roughness: 0.92,
    metalness: 0.02,
    ...extra,
  });

/** Tileable grass: base colour plus many short blade-like strokes. Tile = `tileMeters` of ground. */
function grassTexture(base: string, light: string, dark: string, seed: number): CanvasTexture | null {
  if (typeof document === "undefined") return null;
  const size = 256;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  const r = rnd(seed);
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < 2600; i++) {
    const x = r() * size;
    const y = r() * size;
    const len = 3 + r() * 6;
    ctx.strokeStyle = r() > 0.5 ? light : dark;
    ctx.globalAlpha = 0.25 + r() * 0.35;
    ctx.lineWidth = 1 + r();
    for (const dx of [-size, 0, size]) {
      for (const dy of [-size, 0, size]) {
        ctx.beginPath();
        ctx.moveTo(x + dx, y + dy);
        ctx.lineTo(x + dx + (r() - 0.5) * 3, y + dy - len);
        ctx.stroke();
      }
    }
  }
  const tex = new CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = RepeatWrapping;
  tex.colorSpace = SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

/** Tileable pavement: 8 x 8 pavers with slightly different tones and thin joints (1 tile = 8 m of ground). */
function pavingTexture(seed: number): CanvasTexture | null {
  if (typeof document === "undefined") return null;
  const size = 256;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  const r = rnd(seed);
  const cell = size / 8;
  for (let i = 0; i < 8; i++) {
    for (let j = 0; j < 8; j++) {
      const v = 206 + Math.floor(r() * 16);
      ctx.fillStyle = `rgb(${v},${v - 3},${v - 10})`;
      ctx.fillRect(i * cell, j * cell, cell, cell);
    }
  }
  ctx.strokeStyle = "rgba(120,114,104,0.55)";
  ctx.lineWidth = 1.5;
  for (let k = 0; k <= 8; k++) {
    ctx.beginPath();
    ctx.moveTo(k * cell, 0);
    ctx.lineTo(k * cell, size);
    ctx.moveTo(0, k * cell);
    ctx.lineTo(size, k * cell);
    ctx.stroke();
  }
  const tex = new CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = RepeatWrapping;
  tex.colorSpace = SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

const shapeOf = (poly: readonly XZ[]) => new Shape(footprintShapePoints(poly).map(([x, y]) => new Vector2(x, y)));
const extrude = (poly: readonly XZ[], depth: number) => new ExtrudeGeometry(shapeOf(poly), { depth, bevelEnabled: false });
const none = () => null;

/** Turns a 2D polygon into a slab standing on `y` (shape -> world mapping: see footprintShapePoints). */
interface Layer {
  key: string;
  geo: ExtrudeGeometry;
  y: number;
  material: Material | Material[];
  cast?: boolean;
}

function makeMats() {
  const paving = pavingTexture(11);
  const park = grassTexture("#7fb35f", "#98c978", "#639848", 23);
  paving?.repeat.set(1 / 8, 1 / 8);
  park?.repeat.set(1 / 8, 1 / 8);
  return {
    paving: mat(paving ? "#ffffff" : "#d4d1c8", { map: paving, roughness: 0.95 }),
    park: mat(park ? "#ffffff" : "#86bb66", { map: park }),
    soil: mat("#8a6f55"),
    rock: mat("#6f6558"),
    apron: mat("#d9dde3", { roughness: 0.85 }),
    kerb: mat("#cfd4dc"),
    bedSoil: mat("#8c6d4f"),
    shrub: mat("#4f8d4a", { flatShading: true }),
    hedge: mat("#3f7d45"),
    siteKerb: mat("#c3c9d2"),
    pitchRim: mat("#e7ebf0"),
    pitchGrass: mat("#58a04a"),
    pitchStripe: mat("#67b057"),
    line: mat("#ffffff", { roughness: 0.6 }),
    court: mat("#4b8f9b"),
    courtRim: mat("#d6dde5"),
    post: mat("#e9edf3", { metalness: 0.3, roughness: 0.5 }),
    net: mat("#ffffff", {
      transparent: true,
      opacity: 0.35,
      depthWrite: false,
    }),
    fence: mat("#f4f7fb", {
      transparent: true,
      opacity: 0.28,
      depthWrite: false,
    }),
    stone: mat("#bfb8ac"),
    water: mat("#4fa8d6", {
      roughness: 0.15,
      metalness: 0.1,
      transparent: true,
      opacity: 0.88,
    }),
    waterBed: mat("#2c6f93"),
    jet: mat("#dff3ff", { transparent: true, opacity: 0.7, depthWrite: false }),
    wood: mat("#a87a4c"),
    roof: mat("#8f3f2e", { flatShading: true }),
    gatePost: mat("#e6ebf2"),
    gateAccent: mat("#14867f", {
      emissive: new Color("#14867f"),
      emissiveIntensity: 0.25,
    }),
    trunk: mat("#7b5f45"),
    foliage: mat("#ffffff", { flatShading: true, roughness: 0.95 }),
    unit: new BoxGeometry(1, 1, 1),
  };
}

type Mats = ReturnType<typeof makeMats>;

export function CampusScenery({ campus }: { campus: Campus }) {
  const { width, depth, outline } = campus.ground;
  const mats = useMemo(() => makeMats(), []);
  useEffect(
    () => () => {
      for (const v of Object.values(mats)) {
        if (v instanceof MeshStandardMaterial && v.map) v.map.dispose();
        v.dispose();
      }
    },
    [mats],
  );

  const ground = useMemo(() => {
    const poly: XZ[] = outline ?? [
      { x: -width / 2, z: -depth / 2 },
      { x: width / 2, z: -depth / 2 },
      { x: width / 2, z: depth / 2 },
      { x: -width / 2, z: depth / 2 },
    ];
    return {
      grass: new ExtrudeGeometry(shapeOf(poly), {
        depth: 0.5,
        bevelEnabled: false,
      }),
      soil: new ExtrudeGeometry(shapeOf(poly), {
        depth: 1.2,
        bevelEnabled: false,
      }),
      rock: new ExtrudeGeometry(shapeOf(poly), {
        depth: 1.4,
        bevelEnabled: false,
      }),
      poly,
    };
  }, [outline, width, depth]);
  useEffect(
    () => () => {
      ground.grass.dispose();
      ground.soil.dispose();
      ground.rock.dispose();
    },
    [ground],
  );

  const layers = useMemo(() => {
    const out: Layer[] = [];
    for (const a of campus.areas ?? []) {
      if (a.kind === "park" || a.kind === "lawn") {
        out.push({
          key: a.id,
          geo: extrude(a.polygon, 0.14),
          y: 0,
          material: [mats.park, mats.kerb],
        });
      } else if (a.kind === "bed") {
        out.push({
          key: `${a.id}-kerb`,
          geo: extrude(a.polygon, 0.32),
          y: 0,
          material: mats.kerb,
        });
        out.push({
          key: `${a.id}-soil`,
          geo: extrude(scalePolygon(a.polygon, 0.92), 0.4),
          y: 0,
          material: mats.bedSoil,
        });
        out.push({
          key: `${a.id}-shrub`,
          geo: extrude(scalePolygon(a.polygon, 0.78), 0.85),
          y: 0,
          material: mats.shrub,
          cast: true,
        });
      }
    }
    // paved apron around every real building (the routing clearance ring doubles as the pavement outline)
    for (const o of campus.nav?.obstacles ?? []) {
      if (!o.id.startsWith("campus-b")) continue;
      out.push({
        key: `${o.id}-apron`,
        geo: extrude(o.ring, 0.08),
        y: 0,
        material: mats.apron,
      });
    }
    return out;
  }, [campus.areas, campus.nav, mats]);
  useEffect(
    () => () => {
      for (const l of layers) l.geo.dispose();
    },
    [layers],
  );

  const hedges = useMemo(
    () => polylineBoxes(campus.linework?.find((l) => l.kind === "vegetation")?.polylines ?? [], 0.7),
    [campus.linework],
  );
  const kerbs = useMemo(() => polylineBoxes(campus.linework?.find((l) => l.kind === "site")?.polylines ?? [], 0.3), [campus.linework]);

  const pitch = campus.areas?.find((a) => a.kind === "pitch");
  const court = campus.areas?.find((a) => a.kind === "court");

  return (
    <group name="campus-scenery">
      {/* diorama base: rock, soil, then the paved ground slab; green only where the plan shows vegetation */}
      <mesh
        geometry={ground.rock}
        material={mats.rock}
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, -3.1, 0]}
        receiveShadow
        raycast={none}
      />
      <mesh
        geometry={ground.soil}
        material={mats.soil}
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, -1.7, 0]}
        receiveShadow
        raycast={none}
      />
      <mesh
        geometry={ground.grass}
        material={[mats.paving, mats.soil]}
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, -0.5, 0]}
        receiveShadow
        raycast={none}
      />

      {layers.map((l) => (
        <mesh
          key={l.key}
          geometry={l.geo}
          material={l.material}
          rotation={[-Math.PI / 2, 0, 0]}
          position={[0, l.y, 0]}
          castShadow={l.cast}
          receiveShadow
          raycast={none}
        />
      ))}

      <Segments segments={hedges} height={0.8} material={mats.hedge} unit={mats.unit} />
      <Segments segments={kerbs} height={0.28} material={mats.siteKerb} unit={mats.unit} />

      {pitch && <Pitch polygon={pitch.polygon} mats={mats} />}
      {court && <Court polygon={court.polygon} mats={mats} />}
      {(campus.ponds ?? []).map((p) => (
        <Pond key={p.id} pond={p} mats={mats} />
      ))}
      <Trees trees={campus.trees} trunkMat={mats.trunk} foliageMat={mats.foliage} />
      {(campus.props ?? [])
        .filter((p) => p.kind === "gazebo")
        .map((p) => (
          <Gazebo key={p.id} x={p.x} z={p.z} angle={p.angle} shape={p.shape} size={p.size} mats={mats} />
        ))}
      {(campus.entrances ?? []).map((e) => (
        <Gate key={e.id} x={e.x} z={e.z} angle={nearestEdgeAngle(ground.poly, e)} mats={mats} />
      ))}
    </group>
  );
}

function Segments({
  segments,
  height,
  material,
  unit,
}: {
  segments: ReturnType<typeof polylineBoxes>;
  height: number;
  material: Material;
  unit: BoxGeometry;
}) {
  const ref = useRef<InstancedMesh>(null);
  useLayoutEffect(() => {
    const m = ref.current;
    if (!m) return;
    const o = new Object3D();
    segments.forEach((s, i) => {
      o.position.set(s.x, height / 2, s.z);
      o.rotation.set(0, s.angle, 0);
      o.scale.set(s.length + s.width * 0.6, height, s.width);
      o.updateMatrix();
      m.setMatrixAt(i, o.matrix);
    });
    m.instanceMatrix.needsUpdate = true;
  }, [segments, height]);
  if (segments.length === 0) return null;
  return <instancedMesh key={segments.length} ref={ref} args={[unit, material, segments.length]} receiveShadow raycast={none} />;
}

function Pitch({ polygon, mats }: { polygon: XZ[]; mats: Mats }) {
  const r = useMemo(() => orientedRect(polygon), [polygon]);
  const stripes = Math.max(2, Math.round(r.length / 3.5));
  const goalW = Math.min(5, r.width * 0.34);
  const line = (w: number, l: number, x: number, z: number) => (
    <mesh geometry={mats.unit} material={mats.line} position={[x, 0.345, z]} scale={[l, 0.03, w]} raycast={none} />
  );
  const hx = r.length / 2;
  const hz = r.width / 2;
  return (
    <group position={[r.cx, 0, r.cz]} rotation={[0, r.angle, 0]} name="campus-pitch">
      <mesh
        geometry={mats.unit}
        material={mats.pitchRim}
        position={[0, 0.15, 0]}
        scale={[r.length + 3, 0.3, r.width + 3]}
        castShadow
        receiveShadow
        raycast={none}
      />
      <mesh
        geometry={mats.unit}
        material={mats.pitchGrass}
        position={[0, 0.32, 0]}
        scale={[r.length, 0.06, r.width]}
        receiveShadow
        raycast={none}
      />
      {Array.from({ length: stripes }, (_, i) =>
        i % 2 === 0 ? (
          <mesh
            key={i}
            geometry={mats.unit}
            material={mats.pitchStripe}
            position={[-hx + ((i + 0.5) * r.length) / stripes, 0.335, 0]}
            scale={[r.length / stripes, 0.02, r.width]}
            raycast={none}
          />
        ) : null,
      )}
      {line(0.15, r.length, 0, hz - 0.1)}
      {line(0.15, r.length, 0, -hz + 0.1)}
      {line(r.width, 0.15, hx - 0.1, 0)}
      {line(r.width, 0.15, -hx + 0.1, 0)}
      {line(r.width, 0.15, 0, 0)}
      <mesh position={[0, 0.345, 0]} rotation={[Math.PI / 2, 0, 0]} material={mats.line} raycast={none}>
        <torusGeometry args={[Math.min(3, r.width * 0.16), 0.07, 6, 40]} />
      </mesh>
      {[-1, 1].map((s) => (
        <group key={s} position={[s * (hx - 0.1), 0.35, 0]}>
          {[-1, 1].map((p) => (
            <mesh key={p} position={[0, 1.1, (p * goalW) / 2]} material={mats.post} castShadow raycast={none}>
              <cylinderGeometry args={[0.07, 0.07, 2.2, 8]} />
            </mesh>
          ))}
          <mesh geometry={mats.unit} material={mats.post} position={[0, 2.2, 0]} scale={[0.09, 0.09, goalW]} castShadow raycast={none} />
          <mesh geometry={mats.unit} material={mats.net} position={[-s * 0.9, 1.1, 0]} scale={[1.8, 2.2, goalW]} raycast={none} />
        </group>
      ))}
    </group>
  );
}

function Court({ polygon, mats }: { polygon: XZ[]; mats: Mats }) {
  const r = useMemo(() => orientedRect(polygon), [polygon]);
  const hx = r.length / 2;
  const hz = r.width / 2;
  const posts = useMemo(() => {
    const out: { x: number; z: number }[] = [];
    const nx = Math.max(2, Math.round(r.length / 4));
    const nz = Math.max(2, Math.round(r.width / 4));
    for (let i = 0; i <= nx; i++) out.push({ x: -hx + (i * r.length) / nx, z: -hz }, { x: -hx + (i * r.length) / nx, z: hz });
    for (let j = 1; j < nz; j++) out.push({ x: -hx, z: -hz + (j * r.width) / nz }, { x: hx, z: -hz + (j * r.width) / nz });
    return out;
  }, [r, hx, hz]);
  return (
    <group position={[r.cx, 0, r.cz]} rotation={[0, r.angle, 0]} name="campus-court">
      <mesh
        geometry={mats.unit}
        material={mats.courtRim}
        position={[0, 0.07, 0]}
        scale={[r.length + 1.6, 0.14, r.width + 1.6]}
        castShadow
        receiveShadow
        raycast={none}
      />
      <mesh
        geometry={mats.unit}
        material={mats.court}
        position={[0, 0.16, 0]}
        scale={[r.length, 0.05, r.width]}
        receiveShadow
        raycast={none}
      />
      {[
        [r.length, 0.12, 0, hz - 0.1],
        [r.length, 0.12, 0, -hz + 0.1],
        [0.12, r.width, hx - 0.1, 0],
        [0.12, r.width, -hx + 0.1, 0],
        [0.12, r.width, 0, 0],
      ].map(([l, w, x, z], i) => (
        <mesh key={i} geometry={mats.unit} material={mats.line} position={[x!, 0.195, z!]} scale={[l!, 0.02, w!]} raycast={none} />
      ))}
      {[-1, 1].map((s) => (
        <group key={s} position={[s * (hx - 0.2), 0.18, 0]}>
          {[-1, 1].map((p) => (
            <mesh key={p} position={[0, 1, p * 1.6]} material={mats.post} castShadow raycast={none}>
              <cylinderGeometry args={[0.06, 0.06, 2, 8]} />
            </mesh>
          ))}
          <mesh geometry={mats.unit} material={mats.post} position={[0, 2, 0]} scale={[0.08, 0.08, 3.2]} castShadow raycast={none} />
        </group>
      ))}
      {/* see-through fence: posts + a faint panel, so the court reads as an enclosure without hiding it */}
      {posts.map((p, i) => (
        <mesh
          key={i}
          geometry={mats.unit}
          material={mats.post}
          position={[p.x, 1.6, p.z]}
          scale={[0.1, 3, 0.1]}
          castShadow
          raycast={none}
        />
      ))}
      {[
        [r.length, 0.04, 0, hz],
        [r.length, 0.04, 0, -hz],
      ].map(([l, w, x, z], i) => (
        <mesh key={`fx${i}`} geometry={mats.unit} material={mats.fence} position={[x!, 1.6, z!]} scale={[l!, 2.8, w!]} raycast={none} />
      ))}
      {[hx, -hx].map((x, i) => (
        <mesh
          key={`fz${i}`}
          geometry={mats.unit}
          material={mats.fence}
          position={[x, 1.6, 0]}
          scale={[0.04, 2.8, r.width]}
          raycast={none}
        />
      ))}
    </group>
  );
}

function Pond({ pond, mats }: { pond: NonNullable<Campus["ponds"]>[number]; mats: Mats }) {
  const geo = useMemo(() => {
    const ellipse = (rx: number, rz: number) => {
      const pts: Vector2[] = [];
      for (let i = 0; i < 40; i++) {
        const a = (i / 40) * Math.PI * 2;
        pts.push(new Vector2(Math.cos(a) * rx, Math.sin(a) * rz));
      }
      return pts;
    };
    const rim = new Shape(ellipse(pond.rx + 0.9, pond.rz + 0.9));
    rim.holes.push(new Path(ellipse(pond.rx, pond.rz)));
    return {
      rim: new ExtrudeGeometry(rim, { depth: 0.55, bevelEnabled: false }),
      bed: new ExtrudeGeometry(new Shape(ellipse(pond.rx, pond.rz)), {
        depth: 0.1,
        bevelEnabled: false,
      }),
      water: new ExtrudeGeometry(new Shape(ellipse(pond.rx - 0.02, pond.rz - 0.02)), { depth: 0.06, bevelEnabled: false }),
    };
  }, [pond.rx, pond.rz]);
  useEffect(
    () => () => {
      geo.rim.dispose();
      geo.bed.dispose();
      geo.water.dispose();
    },
    [geo],
  );
  // Shape XY -> world: rotate -90deg about X, then the pond's own angle about Y. The shape uses (x, -z), so a Y rotation of
  // `angle` (same sign convention as the other props) keeps the long axis aligned with the plan.
  return (
    <group position={[pond.x, 0.14, pond.z]} rotation={[0, pond.angle, 0]} name="campus-pond">
      <mesh geometry={geo.rim} material={mats.stone} rotation={[-Math.PI / 2, 0, 0]} castShadow receiveShadow raycast={none} />
      <mesh geometry={geo.bed} material={mats.waterBed} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]} raycast={none} />
      <mesh geometry={geo.water} material={mats.water} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.36, 0]} raycast={none} />
      <mesh material={mats.stone} position={[0, 0.5, 0]} castShadow raycast={none}>
        <cylinderGeometry args={[0.7, 0.9, 0.9, 10]} />
      </mesh>
      <mesh material={mats.jet} position={[0, 1.6, 0]} raycast={none}>
        <coneGeometry args={[0.45, 1.8, 10]} />
      </mesh>
    </group>
  );
}

/** Round (cylinder platform, 8 posts, round roof) or square (box platform, 4 corner posts, pyramid roof) gazebo. */
function Gazebo({ x, z, angle, shape, size, mats }: { x: number; z: number; angle: number; shape: "round" | "square"; size: number; mats: Mats }) {
  const round = shape === "round";
  const n = round ? 8 : 4;
  const reach = round ? size * 0.86 : size * 0.86 * Math.SQRT2;
  const posts = useMemo(
    () =>
      Array.from({ length: n }, (_, i) => {
        const a = round ? (i / n) * Math.PI * 2 : ((i + 0.5) / n) * Math.PI * 2;
        return { x: Math.cos(a) * reach, z: Math.sin(a) * reach };
      }),
    [n, reach, round],
  );
  const roofR = round ? size * 1.12 : size * 1.55;
  return (
    <group position={[x, 0.14, z]} rotation={[0, angle, 0]} name={`campus-gazebo-${shape}`}>
      {round ? (
        <mesh material={mats.stone} position={[0, 0.2, 0]} castShadow receiveShadow raycast={none}>
          <cylinderGeometry args={[size, size + 0.25, 0.4, 28]} />
        </mesh>
      ) : (
        <mesh geometry={mats.unit} material={mats.stone} position={[0, 0.2, 0]} scale={[size * 2 + 0.6, 0.4, size * 2 + 0.6]} castShadow receiveShadow raycast={none} />
      )}
      {posts.map((p, i) => (
        <mesh key={i} material={mats.wood} position={[p.x, 1.7, p.z]} castShadow raycast={none}>
          <cylinderGeometry args={[0.14, 0.14, 2.6, 8]} />
        </mesh>
      ))}
      {/* low rails between the posts, one side left open as the entrance */}
      {posts.map((p, i) => {
        if (i === 0) return null;
        const q = posts[(i + 1) % posts.length]!;
        const len = Math.hypot(q.x - p.x, q.z - p.z);
        return (
          <mesh
            key={`r${i}`}
            geometry={mats.unit}
            material={mats.wood}
            position={[(p.x + q.x) / 2, 0.95, (p.z + q.z) / 2]}
            rotation={[0, -Math.atan2(q.z - p.z, q.x - p.x), 0]}
            scale={[len, 0.1, 0.12]}
            castShadow
            raycast={none}
          />
        );
      })}
      <mesh material={mats.roof} position={[0, 3.9, 0]} rotation={[0, round ? 0 : Math.PI / 4, 0]} castShadow raycast={none}>
        <coneGeometry args={[roofR, 2, round ? 24 : 4]} />
      </mesh>
      <mesh material={mats.wood} position={[0, 5.1, 0]} castShadow raycast={none}>
        <sphereGeometry args={[0.22, 10, 8]} />
      </mesh>
    </group>
  );
}

/** Entrance gate: two pillars, a lintel with a teal accent bar and a low kerb strip, turned to face the boundary. */
function Gate({ x, z, angle, mats }: { x: number; z: number; angle: number; mats: Mats }) {
  return (
    <group position={[x, 0, z]} rotation={[0, angle, 0]} name="campus-gate">
      {[-4.6, 4.6].map((px) => (
        <mesh
          key={px}
          geometry={mats.unit}
          material={mats.gatePost}
          position={[px, 1.7, 0]}
          scale={[1, 3.4, 1]}
          castShadow
          raycast={none}
        />
      ))}
      <mesh geometry={mats.unit} material={mats.gatePost} position={[0, 3.6, 0]} scale={[10.2, 0.6, 1.1]} castShadow raycast={none} />
      <mesh geometry={mats.unit} material={mats.gateAccent} position={[0, 3.6, 0.58]} scale={[8.6, 0.22, 0.06]} raycast={none} />
    </group>
  );
}

/** Instanced trees: round (low-poly ball crowns) and pine (stacked cones); size and tint vary per tree. */
function Trees({ trees, trunkMat, foliageMat }: { trees: Campus["trees"]; trunkMat: Material; foliageMat: Material }) {
  const parts = useMemo(
    () => ({
      trunk: new CylinderGeometry(0.22, 0.32, 1, 7),
      ball: new IcosahedronGeometry(1, 1),
      cone: new ConeGeometry(1, 1, 8),
    }),
    [],
  );
  useEffect(
    () => () => {
      parts.trunk.dispose();
      parts.ball.dispose();
      parts.cone.dispose();
    },
    [parts],
  );
  const round = useMemo(() => trees.filter((t) => t.kind !== "pine"), [trees]);
  const pine = useMemo(() => trees.filter((t) => t.kind === "pine"), [trees]);
  const trunkRef = useRef<InstancedMesh>(null);
  const ballRef = useRef<InstancedMesh>(null);
  const cone1Ref = useRef<InstancedMesh>(null);
  const cone2Ref = useRef<InstancedMesh>(null);
  const cone3Ref = useRef<InstancedMesh>(null);
  useLayoutEffect(() => {
    const o = new Object3D();
    const c = new Color();
    const set = (
      m: InstancedMesh | null,
      i: number,
      x: number,
      y: number,
      z: number,
      sx: number,
      sy: number,
      sz: number,
      color?: string,
    ) => {
      if (!m) return;
      o.position.set(x, y, z);
      o.rotation.set(0, (i * 2.399) % (Math.PI * 2), 0);
      o.scale.set(sx, sy, sz);
      o.updateMatrix();
      m.setMatrixAt(i, o.matrix);
      if (color) m.setColorAt(i, c.set(color));
    };
    const r = rnd(97);
    const all = [...round, ...pine];
    all.forEach((t, i) => {
      const s = t.scale ?? 1;
      set(trunkRef.current, i, t.x, 1.1 * s, t.z, s, 2.2 * s, s);
    });
    round.forEach((t, i) => {
      const s = t.scale ?? 1;
      const g = ["#5fa152", "#6bb05a", "#4f9449", "#78b95f", "#86c06a"][Math.floor(r() * 5)]!;
      set(ballRef.current, i, t.x, 3.4 * s, t.z, 2 * s, 1.8 * s, 2 * s, g);
    });
    pine.forEach((t, i) => {
      const s = t.scale ?? 1;
      const g = ["#2f7a4b", "#38865a", "#2a6e45"][Math.floor(r() * 3)]!;
      set(cone1Ref.current, i, t.x, 2.6 * s, t.z, 2 * s, 2.6 * s, 2 * s, g);
      set(cone2Ref.current, i, t.x, 4.0 * s, t.z, 1.6 * s, 2.4 * s, 1.6 * s, g);
      set(cone3Ref.current, i, t.x, 5.3 * s, t.z, 1.1 * s, 2.2 * s, 1.1 * s, g);
    });
    for (const m of [trunkRef, ballRef, cone1Ref, cone2Ref, cone3Ref]) {
      if (!m.current) continue;
      m.current.instanceMatrix.needsUpdate = true;
      if (m.current.instanceColor) m.current.instanceColor.needsUpdate = true;
    }
    // refs are stable objects; the geometry counts only change with the tree list
  }, [round, pine]);

  const total = round.length + pine.length;
  if (total === 0) return null;
  return (
    <group name="campus-trees">
      <instancedMesh key={`t${total}`} ref={trunkRef} args={[parts.trunk, trunkMat, total]} castShadow raycast={none} />
      {round.length > 0 && (
        <instancedMesh
          key={`b${round.length}`}
          ref={ballRef}
          args={[parts.ball, foliageMat, round.length]}
          castShadow
          receiveShadow
          raycast={none}
        />
      )}
      {pine.length > 0 && (
        <>
          <instancedMesh
            key={`c1-${pine.length}`}
            ref={cone1Ref}
            args={[parts.cone, foliageMat, pine.length]}
            castShadow
            receiveShadow
            raycast={none}
          />
          <instancedMesh
            key={`c2-${pine.length}`}
            ref={cone2Ref}
            args={[parts.cone, foliageMat, pine.length]}
            castShadow
            receiveShadow
            raycast={none}
          />
          <instancedMesh
            key={`c3-${pine.length}`}
            ref={cone3Ref}
            args={[parts.cone, foliageMat, pine.length]}
            castShadow
            receiveShadow
            raycast={none}
          />
        </>
      )}
    </group>
  );
}
