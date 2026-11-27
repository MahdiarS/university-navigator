import { describe, expect, it } from "vitest";
import { buildLookups } from "@/lib/data/lookups";
import { planJourney } from "@/lib/model/journey";
import { search, buildSearchIndex } from "@/lib/search/engine";
import { strictlyInside } from "@/lib/navigation/campus-route";
import { B1_OFFICE_400, B2_OFFICE_430, B3_OFFICE_440, data, graph } from "../navigation/helpers";

const lookups = buildLookups(data);
const campus = data.manifest.campus;
const GATE = campus.entrances![0]!.id;

const journey = (roomId: string) => {
  const j = planJourney(data, lookups, graph, campus, GATE, roomId);
  if (j.status !== "ok") throw new Error(`expected a journey, got ${j.status}`);
  return j;
};

describe("one walk from the university gate to a room", () => {
  it("is found from the search result for 'دفتر 430 ساختمان 2 علیرضا حریری ایرج'", () => {
    const hits = search(buildSearchIndex(data), "دفتر 430 ساختمان 2 علیرضا حریری ایرج");
    expect(hits).toHaveLength(1);
    const j = journey(hits[0]!.room.id);
    expect(j.room.id).toBe(B2_OFFICE_430);
  });

  it("goes yard -> entrance building -> sky bridge -> building 2 -> office 430", () => {
    const j = journey(B2_OFFICE_430);
    expect(j.outdoor.length).toBeGreaterThan(20);
    expect(["campus-b1", "campus-b3"]).toContain(j.entryBuildingId); // building 2 itself has no street door
    expect(j.buildingIds[0]).toBe(j.entryBuildingId);
    expect(j.buildingIds.at(-1)).toBe("campus-b2");
    expect(j.usesBridge).toBe(true);
    // the ordered scopes: outdoor steps first, then indoor
    const scopes = j.steps.map((s) => s.scope);
    expect(scopes.indexOf("indoor")).toBeGreaterThan(0);
    expect(scopes.slice(scopes.indexOf("indoor")).every((s) => s === "indoor")).toBe(true);
    expect(j.steps.map((s) => s.kind)).toEqual(expect.arrayContaining(["start", "enter", "stairs", "bridge", "arrive"]));
    expect(j.steps.at(-1)!.kind).toBe("arrive");
    expect(j.steps.find((s) => s.kind === "bridge")!.text).toContain("پل هوایی");
    expect(j.totalMeters).toBeCloseTo(j.outdoorMeters + j.indoorMeters, 6);
  });

  it("picks the nearer entrance building and does not use a bridge for a room next to the door", () => {
    const j3 = journey(B3_OFFICE_440);
    expect(j3.entryBuildingId).toBe("campus-b3");
    expect(j3.usesBridge).toBe(false);
    const j1 = journey(B1_OFFICE_400);
    expect(j1.entryBuildingId).toBe("campus-b1");
    expect(j1.usesBridge).toBe(false);
  });

  it("starts at the gate and the outdoor leg never cuts through a building", () => {
    const j = journey(B2_OFFICE_430);
    const gate = campus.entrances![0]!;
    expect(j.outdoor.points[0]).toMatchObject({ x: gate.x, z: gate.z });
    const rings = campus.buildings.filter((b) => b.footprint).map((b) => b.trim ?? b.footprint!);
    const pts = j.outdoor.points;
    for (let i = 0; i < pts.length - 1; i++) {
      const mid = { x: (pts[i]!.x + pts[i + 1]!.x) / 2, z: (pts[i]!.z + pts[i + 1]!.z) / 2 };
      for (const ring of rings) expect(strictlyInside(mid, ring), `segment ${i}`).toBe(false);
    }
  });

  it("ends exactly at the room's door and carries 3D points at the right heights", () => {
    const j = journey(B2_OFFICE_430);
    const last = j.indoorPoints.at(-1)!;
    expect(j.indoorPoints[0]!.y).toBe(0); // street-level door
    expect(last.y).toBeCloseTo(3.6, 6); // first floor
    const door = graph.nodes.get(j.room.doorNodeId!)!;
    expect(last).toMatchObject({ x: door.x, z: door.z });
  });

  it("reports unknown room, unknown gate and a room without a door", () => {
    expect(planJourney(data, lookups, graph, campus, GATE, "nope").status).toBe("unknown-room");
    expect(planJourney(data, lookups, graph, campus, "nope", B2_OFFICE_430).status).toBe("unknown-gate");
  });

  it("every room with a door is reachable from the gate", () => {
    for (const r of data.rooms.filter((x) => x.doorNodeId)) {
      expect(planJourney(data, lookups, graph, campus, GATE, r.id).status, r.id).toBe("ok");
    }
  });
});
