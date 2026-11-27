import { describe, expect, it } from "vitest";
import { BuildingSchema, DepartmentSchema, InteriorsSchema, NavEdgeSchema, RoomSchema, slugSchema } from "@/lib/data/schemas";
import { footprintArea } from "@/lib/model/campus";
import { data } from "../navigation/helpers";

const unique = (xs: string[]) => new Set(xs).size === xs.length;
type P = { x: number; z: number };
const inside = (pt: P, poly: readonly P[]): boolean => {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i]!;
    const b = poly[j]!;
    if (a.z > pt.z !== b.z > pt.z && pt.x < ((b.x - a.x) * (pt.z - a.z)) / (b.z - a.z) + a.x) c = !c;
  }
  return c;
};

const { interiors, campus } = data.manifest;

describe("campus indoor data (first floors of buildings 1, 2, 3)", () => {
  it("covers exactly the three buildings joined by sky bridges, and claims nothing it was not given", () => {
    expect(data.buildings.map((b) => b.id).sort()).toEqual(["campus-b1", "campus-b2", "campus-b3"]);
    expect(interiors.floors.map((f) => f.buildingId).sort()).toEqual(["campus-b1", "campus-b2", "campus-b3"]);
    expect(interiors.bridges.map((b) => b.id).sort()).toEqual(["bridge-2-1", "bridge-3-2"]);
    expect(data.rooms.length).toBeGreaterThan(40);
    // nothing is flagged as the old demo content any more
    const all = [...data.buildings, ...data.floors, ...data.rooms, ...data.departments, ...data.entrances, ...data.facilities, ...data.nodes, ...data.edges];
    expect(all.every((r) => r.isDemo === false)).toBe(true);
    expect(campus.isDemo).toBe(false);
  });

  it("has the outdoor doors the owner marked: building 3 and building 1 only (building 2 is reached by bridge)", () => {
    expect(data.entrances.map((e) => e.buildingId).sort()).toEqual(["campus-b1", "campus-b3"]);
    for (const e of data.entrances) {
      const n = data.nodes.find((x) => x.id === e.nodeId)!;
      expect(n.type).toBe("entrance");
      expect(n.y).toBe(0);
    }
  });

  it("uses unique stable ids and unique slugs", () => {
    for (const list of [data.buildings, data.floors, data.rooms, data.departments, data.nodes, data.edges]) {
      expect(unique(list.map((x) => x.id))).toBe(true);
    }
    expect(unique(data.departments.map((d) => d.slug))).toBe(true);
    expect(unique(data.rooms.map((r) => r.modelObjectId))).toBe(true);
    for (const d of data.departments) expect(slugSchema.safeParse(d.slug).success).toBe(true);
  });

  it("has consistent references (rooms -> floors, departments -> rooms, nodes/edges, door nodes)", () => {
    const floorIds = new Set(data.floors.map((f) => f.id));
    const roomIds = new Set(data.rooms.map((r) => r.id));
    const nodeById = new Map(data.nodes.map((n) => [n.id, n]));
    for (const r of data.rooms) {
      expect(floorIds.has(r.floorId)).toBe(true);
      const door = nodeById.get(r.doorNodeId ?? "");
      expect(door?.type).toBe("room-door");
      expect(door?.floorId).toBe(r.floorId);
    }
    for (const d of data.departments) expect(roomIds.has(d.roomId)).toBe(true);
    for (const e of data.edges) {
      expect(nodeById.has(e.fromNode)).toBe(true);
      expect(nodeById.has(e.toNode)).toBe(true);
    }
    for (const n of data.nodes) {
      const floor = data.floors.find((f) => f.id === n.floorId)!;
      expect(floor).toBeDefined();
      expect(n.y).toBe(floor.elevation); // one shared Y convention: node Y = floor walking surface
    }
  });

  it("keeps every room centre and every door node inside its building's footprint", () => {
    for (const f of interiors.floors) {
      const b = campus.buildings.find((x) => x.id === f.buildingId)!;
      const ring = b.trim ?? b.footprint!;
      const rooms = data.rooms.filter((r) => r.floorId === f.floorId);
      expect(rooms.length).toBeGreaterThan(10);
      for (const r of rooms) {
        expect(inside({ x: r.positionX, z: r.positionZ }, ring), `${r.id} centre`).toBe(true);
      }
      for (const poly of f.rooms) expect(footprintArea(poly.polygon)).toBeGreaterThan(4);
    }
  });

  it("puts each bridge between two buildings, at first-floor height", () => {
    for (const br of interiors.bridges) {
      expect(br.elevation).toBe(data.floors.find((f) => f.buildingId === br.fromBuildingId && f.floorNumber === 1)!.elevation);
      const [a, b] = [br.points[0]!, br.points.at(-1)!];
      const from = campus.buildings.find((x) => x.id === br.fromBuildingId)!;
      const to = campus.buildings.find((x) => x.id === br.toBuildingId)!;
      const near = (pt: P, ring: readonly P[]) => Math.min(...ring.map((q) => Math.hypot(q.x - pt.x, q.z - pt.z))) < 12;
      expect(near(a, (from.trim ?? from.footprint)!)).toBe(true);
      expect(near(b, (to.trim ?? to.footprint)!)).toBe(true);
    }
    const bridgeEdges = data.edges.filter((e) => e.edgeType === "bridge");
    expect(bridgeEdges).toHaveLength(2);
  });

  it("flags hand-transcribed names for proofreading and never invents contact details or hours", () => {
    expect(interiors.needsReview.length).toBeGreaterThan(0);
    const roomIds = new Set(data.rooms.map((r) => r.id));
    for (const id of interiors.needsReview) expect(roomIds.has(id)).toBe(true);
    for (const d of data.departments) {
      expect(d.phone).toBeNull();
      expect(d.workingHours).toBeNull();
    }
  });

  it("has the professor of office 430 in building 2", () => {
    const d = data.departments.find((x) => x.name === "علیرضا حریری ایرج")!;
    expect(d.roomId).toBe("campus-b2-r430");
    expect(data.rooms.find((r) => r.id === d.roomId)!.roomNumber).toBe("430");
  });

  it("round-trips through the schemas", () => {
    expect(InteriorsSchema.safeParse(interiors).success).toBe(true);
  });
});

describe("zod validation", () => {
  it("rejects malformed records", () => {
    expect(BuildingSchema.safeParse({ ...data.buildings[0], slug: "Bad Slug" }).success).toBe(false);
    expect(RoomSchema.safeParse({ ...data.rooms[0], positionX: Number.NaN }).success).toBe(false);
    expect(NavEdgeSchema.safeParse({ ...data.edges[0], distance: -1 }).success).toBe(false);
    expect(NavEdgeSchema.safeParse({ ...data.edges[0], edgeType: "teleport" }).success).toBe(false);
    expect(DepartmentSchema.safeParse({ ...data.departments[0], name: "   " }).success).toBe(false);
  });

  it("accepts the sky-bridge edge type", () => {
    expect(NavEdgeSchema.safeParse({ ...data.edges[0], edgeType: "bridge" }).success).toBe(true);
  });

  it("rejects unsafe model references", () => {
    expect(BuildingSchema.safeParse({ ...data.buildings[0], modelUrl: "javascript:alert(1)" }).success).toBe(false);
    expect(BuildingSchema.safeParse({ ...data.buildings[0], modelUrl: "/models/../../etc/passwd" }).success).toBe(false);
  });

  it("normalises empty optional text to null", () => {
    const parsed = DepartmentSchema.parse({ ...data.departments[0], phone: "", workingHours: "  " });
    expect(parsed.phone).toBeNull();
    expect(parsed.workingHours).toBeNull();
  });
});
