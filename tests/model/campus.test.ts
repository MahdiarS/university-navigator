import { describe, expect, it } from "vitest";
import campusLayoutJson from "@data/campus/campus-layout.json";
import { CampusSchema } from "@/lib/data/schemas";
import { campusKey, findCampusBuilding, footprintArea, footprintShapePoints, polylinesToSegmentPositions } from "@/lib/model/campus";

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
    for (const n of [12, 13, 14, 15]) {
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
    for (const n of [7, 10, 11]) expect(campus.buildings.find((b) => b.number === n)?.kind).toBe("marker");
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
    expect(campus.entrances).toHaveLength(2);
  });
});

describe("campus geometry helpers", () => {
  it("shoelace area of a 4 x 3 rectangle is 12 regardless of winding", () => {
    const rect = [{ x: 0, z: 0 }, { x: 4, z: 0 }, { x: 4, z: 3 }, { x: 0, z: 3 }];
    expect(footprintArea(rect)).toBe(12);
    expect(footprintArea([...rect].reverse())).toBe(12);
  });

  it("negates z for THREE.Shape so the extruded mesh lands on the right world z", () => {
    expect(footprintShapePoints([{ x: 1, z: 2 }, { x: -3, z: -4 }, { x: 0, z: 0 }])).toEqual([[1, -2], [-3, 4], [0, -0]]);
  });

  it("turns polylines into one vertex pair per leg at the requested height", () => {
    const pos = polylinesToSegmentPositions([[0, 0, 10, 0, 10, 5], [1, 1, 2, 2]], 0.07);
    expect(pos.length).toBe(3 * 6);
    expect(Array.from(pos.slice(0, 6))).toEqual([0, 0.07000000029802322, 0, 10, 0.07000000029802322, 0]);
    expect(polylinesToSegmentPositions([[5, 5]], 0).length).toBe(0);
  });
});
