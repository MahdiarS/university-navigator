import { describe, expect, it } from "vitest";
import campusLayoutJson from "@data/campus/campus-layout.json";
import { CampusSchema } from "@/lib/data/schemas";
import {
  campusKey,
  findCampusBuilding,
  footprintArea,
  footprintShapePoints,
  nearestEdgeAngle,
  orientedRect,
  polygonCentroid,
  polylineBoxes,
  polylinesToSegmentPositions,
  scalePolygon,
} from "@/lib/model/campus";
import { strictlyInside } from "@/lib/navigation/campus-route";

const campus = CampusSchema.parse(campusLayoutJson);

describe("campus site-plan layout (data/campus/campus-layout.json)", () => {
  it("validates and is not flagged as demo geometry, but says where it came from", () => {
    expect(campus.isDemo).toBe(false);
    expect(campus.source?.kind).toBe("cad");
    expect(campus.source?.note).toContain("تأیید رسمی");
  });

  it("has stable unique keys for every building", () => {
    const keys = campus.buildings.map(campusKey);
    expect(new Set(keys).size).toBe(keys.length);
    expect(findCampusBuilding(campus, "campus-b4")?.name).toBe("ساختمان اداری مرکزی");
    expect(findCampusBuilding(campus, "nope")).toBeNull();
  });

  it("uses the owner-supplied legend and never invents names for unnamed numbers", () => {
    const byNumber = new Map(campus.buildings.map((b) => [b.number, b]));
    expect(byNumber.get(4)).toMatchObject({ name: "ساختمان اداری مرکزی", floors: 3, kind: "building" });
    expect(byNumber.get(5)).toMatchObject({ name: "کلاس‌های خیام", floors: 1 });
    expect(byNumber.get(9)?.name).toBe("سلف");
    // 14 is «سالن شهید چمران» (owner's correction); 12, 13 and 15 still have no name and stay unclickable pins
    expect(byNumber.get(14)).toMatchObject({ name: "سالن شهید چمران", kind: "building", clickable: true });
    for (const n of [12, 13, 15]) {
      const b = campus.buildings.find((x) => x.number === n)!;
      expect(b.name).toBeNull();
      expect(b.clickable).toBe(false);
    }
  });

  it("extrudes only numbers with a closed outline; others are markers without a footprint", () => {
    for (const b of campus.buildings) {
      if (b.kind === "marker") expect(b.footprint).toBeUndefined();
      else expect(b.footprint!.length).toBeGreaterThanOrEqual(3);
    }
    // 7 (prayer room), 10, 11 and 14 are drawn with open outlines in the CAD file; the importer closes them
    for (const n of [7, 10, 11, 14]) {
      const b = campus.buildings.find((x) => x.number === n)!;
      expect(b.kind).toBe("building");
      expect(b.footprint!.length).toBeGreaterThanOrEqual(3);
    }
    for (const n of [12, 13, 15]) expect(campus.buildings.find((b) => b.number === n)?.kind).toBe("marker");
  });

  it("closes the prayer room (7) into a plausible footprint with window trim and a routing obstacle", () => {
    const b7 = campus.buildings.find((b) => b.number === 7)!;
    const area = footprintArea(b7.footprint!);
    expect(area).toBeGreaterThan(200);
    expect(area).toBeLessThan(600);
    expect(b7.trim!.length).toBeGreaterThanOrEqual(3);
    expect(campus.nav!.obstacles.some((o) => o.id === b7.id)).toBe(true);
  });

  it("has the green area with a pond in the middle, pitch, court, plan gazebos and trees", () => {
    const park = campus.areas!.find((a) => a.kind === "park")!;
    expect(park.name).toBe("محوطه سبز");
    expect(campus.areas!.some((a) => a.kind === "pitch")).toBe(true);
    expect(campus.areas!.some((a) => a.kind === "court")).toBe(true);
    const pond = campus.ponds![0]!;
    expect(pond.decorative).toBe(true);
    // the pond sits inside the park, near its centre
    expect(strictlyInside({ x: pond.x, z: pond.z }, park.polygon)).toBe(true);
    const c = polygonCentroid(park.polygon);
    expect(Math.hypot(pond.x - c.x, pond.z - c.z)).toBeLessThan(15);
    // the park lies between buildings 11 and 13's marker, i.e. it is the big gap the owner described
    const b11 = campus.buildings.find((b) => b.number === 11)!;
    expect(Math.hypot(c.x - b11.position.x, c.z - b11.position.z)).toBeLessThan(80);
    expect(campus.trees.some((t) => t.kind === "pine")).toBe(true);
    expect(campus.trees.some((t) => t.kind !== "pine")).toBe(true);
    expect(campus.source!.note).toContain("نمادین");
  });

  it("has the three gazebos the owner pointed out: round one (hexagon on the plan) and two square ones", () => {
    const g = campus.props!;
    expect(g).toHaveLength(3);
    expect(g.filter((p) => p.shape === "round")).toHaveLength(1);
    expect(g.filter((p) => p.shape === "square")).toHaveLength(2);
    expect(g.filter((p) => p.source === "plan")).toHaveLength(2);
    expect(g.filter((p) => p.source === "owner")).toHaveLength(1);
    // marked positions (world meters; checked against the owner's screenshot markings, +- 3 m)
    const near = (p: { x: number; z: number }, x: number, z: number) => Math.hypot(p.x - x, p.z - z) < 4;
    expect(g.some((p) => p.shape === "round" && near(p, 64, 68))).toBe(true);
    expect(g.some((p) => p.shape === "square" && near(p, 41, 99))).toBe(true);
    expect(g.some((p) => p.shape === "square" && near(p, -66, 124))).toBe(true);
    // the gazebo on the plan's round shape sits on lawn, not in a shrub bed
    expect(campus.areas!.some((a) => a.kind === "lawn")).toBe(true);
  });

  it("ground follows the property boundary: the notch and the strip east of the gate are not campus", () => {
    const outline = campus.ground.outline!;
    // north-east notch (empty land inside the old convex hull), east strip beyond the boundary line
    expect(strictlyInside({ x: 40, z: -80 }, outline)).toBe(false);
    expect(strictlyInside({ x: 110, z: 30 }, outline)).toBe(false);
    // a point in the middle of the campus is inside
    expect(strictlyInside({ x: 20, z: 60 }, outline)).toBe(true);
    for (const b of campus.buildings) expect(strictlyInside(b.position, outline) || !b.footprint).toBe(true);
    // the remaining gate is on (just inside) the boundary, so routes start on campus ground
    const e = campus.entrances![0]!;
    expect(strictlyInside(e, outline)).toBe(true);
    // non-walkable pockets of the old hull are routing obstacles
    expect(campus.nav!.obstacles.filter((o) => o.id.startsWith("outside")).length).toBeGreaterThanOrEqual(1);
  });

  it("puts trees only where the plan marks vegetation (planting beds and the park), never in the grey plots", () => {
    const green = campus.areas!.filter((a) => a.kind === "park" || a.kind === "bed");
    expect(campus.trees.length).toBeGreaterThan(50);
    for (const t of campus.trees) {
      expect(
        green.some((a) => strictlyInside(t, a.polygon) || a.polygon.some((p) => Math.hypot(p.x - t.x, p.z - t.z) < 4)),
        `tree ${t.x},${t.z}`,
      ).toBe(true);
    }
    // the grey plots in the north (labels 12 and 13, z < -85) get no trees at all
    expect(campus.trees.filter((t) => t.z < -85)).toHaveLength(0);
  });

  it("never plants a tree, gazebo or the pond inside a building footprint", () => {
    const rings = campus.buildings.filter((b) => b.footprint).map((b) => b.footprint!);
    for (const t of campus.trees) for (const r of rings) expect(strictlyInside(t, r)).toBe(false);
    for (const p of campus.props!) for (const r of rings) expect(strictlyInside(p, r)).toBe(false);
    for (const r of rings) expect(strictlyInside(campus.ponds![0]!, r)).toBe(false);
  });

  it("keeps footprints plausible: area within the plan, heights flagged as estimates", () => {
    for (const b of campus.buildings.filter((x) => x.footprint)) {
      const area = footprintArea(b.footprint!);
      expect(area).toBeGreaterThan(100);
      expect(area).toBeLessThan(4000);
      expect(b.heightIsEstimate).toBe(true);
    }
    // building 4 (central administration) is the largest block on the plan
    const areas = campus.buildings.filter((b) => b.footprint).map((b) => [b.number, footprintArea(b.footprint!)] as const);
    expect(areas.sort((a, b) => b[1] - a[1])[0]![0]).toBe(4);
  });

  it("is georeference-free: all coordinates are small local meters around the campus centre", () => {
    const limit = Math.max(campus.ground.width, campus.ground.depth);
    for (const b of campus.buildings) {
      expect(Math.abs(b.position.x)).toBeLessThan(limit);
      expect(Math.abs(b.position.z)).toBeLessThan(limit);
    }
    // the owner removed the north-east gate: one entrance remains
    expect(campus.entrances).toHaveLength(1);
    expect(campus.ground.outline!.length).toBeGreaterThanOrEqual(3);
  });
});

describe("campus geometry helpers", () => {
  it("shoelace area of a 4 x 3 rectangle is 12 regardless of winding", () => {
    const rect = [
      { x: 0, z: 0 },
      { x: 4, z: 0 },
      { x: 4, z: 3 },
      { x: 0, z: 3 },
    ];
    expect(footprintArea(rect)).toBe(12);
    expect(footprintArea([...rect].reverse())).toBe(12);
  });

  it("negates z for THREE.Shape so the extruded mesh lands on the right world z", () => {
    expect(
      footprintShapePoints([
        { x: 1, z: 2 },
        { x: -3, z: -4 },
        { x: 0, z: 0 },
      ]),
    ).toEqual([
      [1, -2],
      [-3, 4],
      [0, -0],
    ]);
  });

  it("turns polylines into one vertex pair per leg at the requested height", () => {
    const pos = polylinesToSegmentPositions(
      [
        [0, 0, 10, 0, 10, 5],
        [1, 1, 2, 2],
      ],
      0.07,
    );
    expect(pos.length).toBe(3 * 6);
    expect(Array.from(pos.slice(0, 6))).toEqual([0, 0.07000000029802322, 0, 10, 0.07000000029802322, 0]);
    expect(polylinesToSegmentPositions([[5, 5]], 0).length).toBe(0);
  });

  it("fits an oriented rectangle to a rotated pitch", () => {
    const a = Math.PI / 6;
    const pts = [
      [0, 0],
      [20, 0],
      [20, 10],
      [0, 10],
    ].map(([x, z]) => ({ x: 5 + x! * Math.cos(a) - z! * Math.sin(a), z: 7 + x! * Math.sin(a) + z! * Math.cos(a) }));
    const r = orientedRect(pts);
    expect(r.length).toBeCloseTo(20, 5);
    expect(r.width).toBeCloseTo(10, 5);
    // box rotated about Y by r.angle must have its +X axis along the long side: direction (cos, -sin) of the angle
    expect(Math.cos(r.angle)).toBeCloseTo(Math.cos(a), 5);
    expect(Math.abs(Math.sin(r.angle))).toBeCloseTo(Math.sin(a), 5);
  });

  it("scales polygons about their centroid and finds the nearest boundary edge direction", () => {
    const sq = [
      { x: 0, z: 0 },
      { x: 10, z: 0 },
      { x: 10, z: 10 },
      { x: 0, z: 10 },
    ];
    expect(polygonCentroid(sq)).toEqual({ x: 5, z: 5 });
    expect(footprintArea(scalePolygon(sq, 0.5))).toBeCloseTo(25, 6);
    // a point just inside the bottom edge (z = 10, running along +X in the outline order reversed) faces that edge
    expect(Math.abs(Math.cos(nearestEdgeAngle(sq, { x: 5, z: 9 })))).toBeCloseTo(1, 6);
    expect(Math.abs(Math.sin(nearestEdgeAngle(sq, { x: 9.5, z: 5 })))).toBeCloseTo(1, 6);
  });

  it("turns flat polylines into one box per leg", () => {
    const boxes = polylineBoxes(
      [
        [0, 0, 10, 0, 10, 10],
        [3, 3],
      ],
      0.5,
    );
    expect(boxes).toHaveLength(2);
    expect(boxes[0]).toMatchObject({ x: 5, z: 0, length: 10, width: 0.5 });
  });
});
