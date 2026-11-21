import { readdirSync, existsSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { BuildingSchema, DepartmentSchema, NavEdgeSchema, RoomSchema, slugSchema } from "@/lib/data/schemas";
import { data } from "../navigation/helpers";

const unique = (xs: string[]) => new Set(xs).size === xs.length;

describe("demo data", () => {
  it("is entirely labelled as demo content", () => {
    const all = [
      ...data.buildings, ...data.floors, ...data.rooms, ...data.departments, ...data.services,
      ...data.entrances, ...data.facilities, ...data.nodes, ...data.edges,
    ];
    expect(all.length).toBeGreaterThan(100);
    expect(all.every((r) => r.isDemo)).toBe(true);
    expect(data.manifest.isDemo).toBe(true);
  });

  it("matches the required demo scope (1 building, 3 floors, 4 sample departments, entrance, stair, elevator)", () => {
    expect(data.buildings).toHaveLength(1);
    expect(data.floors.map((f) => f.displayName)).toEqual(["همکف", "طبقه اول", "طبقه دوم"]);
    const names = data.departments.map((d) => d.name);
    for (const n of ["اداره آموزش", "امور مالی", "امور دانشجویی", "دبیرخانه"]) expect(names).toContain(n);
    expect(data.entrances).toHaveLength(1);
    expect(data.nodes.filter((n) => n.type === "stair")).toHaveLength(3);
    expect(data.nodes.filter((n) => n.type === "elevator")).toHaveLength(3);
  });

  it("uses unique stable ids and unique slugs", () => {
    for (const list of [data.buildings, data.floors, data.rooms, data.departments, data.services, data.nodes, data.edges]) {
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
    const deptIds = new Set(data.departments.map((d) => d.id));
    for (const s of data.services) expect(deptIds.has(s.departmentId)).toBe(true);
    for (const e of data.edges) {
      expect(nodeById.has(e.fromNode)).toBe(true);
      expect(nodeById.has(e.toNode)).toBe(true);
    }
    for (const n of data.nodes) {
      expect(floorIds.has(n.floorId)).toBe(true);
      const floor = data.floors.find((f) => f.id === n.floorId)!;
      expect(n.y).toBe(floor.elevation); // one shared Y convention: node Y = floor walking surface
    }
  });

  it("models one room hosting several departments", () => {
    const perRoom = new Map<string, number>();
    for (const d of data.departments) perRoom.set(d.roomId, (perRoom.get(d.roomId) ?? 0) + 1);
    expect(Math.max(...perRoom.values())).toBeGreaterThan(1);
  });

  it("never invents contact details or working hours", () => {
    for (const d of data.departments) {
      expect(d.phone).toBeNull();
      expect(d.workingHours).toBeNull();
    }
  });

  it("maps every 3D object id to a room and has a procedural layout for every room", () => {
    const model = data.manifest.buildings[0]!;
    const roomIds = new Set(data.rooms.map((r) => r.id));
    for (const room of data.rooms) {
      expect(model.objectMap[room.modelObjectId]).toBe(room.id);
      expect(model.procedural.rooms[room.id]).toBeDefined();
    }
    for (const id of Object.values(model.objectMap)) expect(roomIds.has(id)).toBe(true);
    expect(model.floors.map((f) => f.floorId)).toEqual(data.floors.map((f) => f.id));
  });

  it("keeps room centres inside their procedural rectangles", () => {
    const layout = data.manifest.buildings[0]!.procedural.rooms;
    for (const r of data.rooms) {
      const box = layout[r.id]!;
      expect(r.positionX).toBeGreaterThan(box.minX);
      expect(r.positionX).toBeLessThan(box.maxX);
      expect(r.positionZ).toBeGreaterThan(box.minZ);
      expect(r.positionZ).toBeLessThan(box.maxZ);
    }
  });

  it("does not claim any GLB exists and ships no fake GLB placeholders", () => {
    const model = data.manifest.buildings[0]!;
    expect(model.exterior.status).toBe("unavailable");
    expect(model.floors.every((f) => f.status === "unavailable")).toBe(true);
    const walk = (dir: string): string[] =>
      readdirSync(dir).flatMap((n) => {
        const p = join(dir, n);
        return statSync(p).isDirectory() ? walk(p) : [p];
      });
    const pub = join(process.cwd(), "public");
    const glbs = existsSync(pub) ? walk(pub).filter((p) => p.toLowerCase().endsWith(".glb")) : [];
    expect(glbs).toEqual([]);
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

  it("rejects unsafe model references", () => {
    expect(BuildingSchema.safeParse({ ...data.buildings[0], modelUrl: "javascript:alert(1)" }).success).toBe(false);
    expect(BuildingSchema.safeParse({ ...data.buildings[0], modelUrl: "/models/../../etc/passwd" }).success).toBe(false);
    expect(BuildingSchema.safeParse({ ...data.buildings[0], modelUrl: "/models/building-01/exterior.glb" }).success).toBe(true);
  });

  it("normalises empty optional text to null", () => {
    const parsed = DepartmentSchema.parse({ ...data.departments[0], phone: "", workingHours: "  " });
    expect(parsed.phone).toBeNull();
    expect(parsed.workingHours).toBeNull();
  });
});
