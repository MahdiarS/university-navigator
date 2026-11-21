import { describe, expect, it } from "vitest";
import { BoxGeometry, Group, Mesh } from "three";
import {
  DEFAULT_EXPLODE_DISTANCE,
  MAX_EXPLODE_DISTANCE,
  boundsOfPoints,
  damp,
  explodeOffsets,
  fitZoom,
  floorVisibility,
  isoCameraPosition,
} from "@/lib/model/layout";
import { buildProceduralBuilding, buildingBounds } from "@/lib/model/procedural";
import { buildRouteGeometry, routeBounds, ROUTE_LIFT } from "@/lib/model/routeGeometry";
import { indexRoomObjects, missingRooms, resolveRoomId, stripBlenderSuffix } from "@/lib/model/glb";
import { initialViewerState, viewerReducer, type ViewerState } from "@/lib/model/viewerState";
import { computeRoute } from "@/lib/navigation";
import { ENTRANCE, FINANCE, SECRETARIAT, data, graph, roomDoor } from "../navigation/helpers";

const model = data.manifest.buildings[0]!;

describe("procedural demo model", () => {
  const floors = buildProceduralBuilding(model, data.floors, data.rooms);

  it("loads three floors in order with slabs at the right elevation", () => {
    expect(floors.map((f) => f.floorId)).toEqual(["floor-00", "floor-01", "floor-02"]);
    for (const f of floors) {
      expect(f.slab.y + f.slab.h / 2).toBeCloseTo(f.elevation, 6); // slab top = walking surface
    }
  });

  it("creates a selectable tile for every room, mapped to the room record by a stable object id", () => {
    const tiles = floors.flatMap((f) => f.rooms);
    expect(tiles).toHaveLength(data.rooms.length);
    for (const t of tiles) {
      expect(model.objectMap[t.objectId]).toBe(t.roomId);
      const room = data.rooms.find((r) => r.id === t.roomId)!;
      expect(t.box.x).toBeCloseTo(room.positionX, 1);
      expect(t.box.z).toBeCloseTo(room.positionZ, 1);
    }
  });

  it("has walls, corridor, doors, stairs and an elevator, and an entrance only on the ground floor", () => {
    for (const f of floors) {
      expect(f.walls.length).toBeGreaterThan(15);
      expect(f.corridorTiles.length).toBeGreaterThan(0);
      expect(f.doors.length).toBe(7 + 2); // 7 rooms + stair + elevator
      expect(f.elevator).not.toBeNull();
    }
    expect(floors[0]!.steps.length).toBeGreaterThan(20);
    expect(floors[1]!.steps.length).toBeGreaterThan(20);
    expect(floors[2]!.steps).toHaveLength(0); // top floor: no flight above
    expect(floors.map((f) => f.entrance !== null)).toEqual([true, false, false]);
  });

  it("leaves a real gap in the ground-floor south wall for the main entrance", () => {
    const southWalls = (i: number) => floors[i]!.walls.filter((w) => Math.abs(w.z - 12) < 1e-6 && w.d < 1);
    const covers = (i: number, x: number) => southWalls(i).some((w) => x > w.x - w.w / 2 && x < w.x + w.w / 2);
    expect(covers(0, 0)).toBe(false);
    expect(covers(1, 0)).toBe(true);
  });

  it("makes the stair flights land exactly on the next floor", () => {
    const top = Math.max(...floors[0]!.steps.map((s) => s.y + s.h / 2));
    expect(top).toBeCloseTo(data.floors[1]!.elevation - data.floors[0]!.elevation + data.floors[0]!.elevation, 6);
  });

  it("computes overall bounds from the manifest", () => {
    const b = buildingBounds(model, data.floors);
    expect(b.min.x).toBe(-20);
    expect(b.max.z).toBe(12);
    expect(b.max.y).toBeGreaterThan(8);
  });
});

describe("exploded view and floor selection", () => {
  it("keeps the ground floor at the base, preserves order and scales with the distance", () => {
    const off = explodeOffsets(data.floors, 6);
    expect(off.get("floor-00")).toBe(0);
    expect(off.get("floor-01")).toBe(6);
    expect(off.get("floor-02")).toBe(12);
    expect(explodeOffsets(data.floors, 0).get("floor-02")).toBe(0); // assembled
    expect(explodeOffsets(data.floors, 999).get("floor-02")).toBe(2 * MAX_EXPLODE_DISTANCE); // clamped
    const shuffled = explodeOffsets([...data.floors].reverse(), 5);
    expect([...shuffled.entries()].sort((a, b) => a[1] - b[1]).map(([id]) => id)).toEqual(["floor-00", "floor-01", "floor-02"]);
  });

  it("does not alter real elevations (offset is a pure visual value)", () => {
    const before = data.floors.map((f) => f.elevation);
    explodeOffsets(data.floors, 10);
    expect(data.floors.map((f) => f.elevation)).toEqual(before);
  });

  it("isolates or ghosts the other floors", () => {
    expect(floorVisibility("floor-01", "all", "ghost")).toBe("solid");
    expect(floorVisibility("floor-01", "floor-01", "hide")).toBe("solid");
    expect(floorVisibility("floor-00", "floor-01", "ghost")).toBe("ghost");
    expect(floorVisibility("floor-00", "floor-01", "hide")).toBe("hidden");
  });

  it("damps smoothly toward a target without overshooting", () => {
    let v = 0;
    for (let i = 0; i < 120; i++) {
      const next = damp(v, 10, 8, 1 / 60);
      expect(next).toBeGreaterThanOrEqual(v);
      expect(next).toBeLessThanOrEqual(10);
      v = next;
    }
    expect(v).toBeGreaterThan(9.9);
  });
});

describe("viewer state (camera controls, floors, rooms)", () => {
  const s0 = initialViewerState;
  const step = (s: ViewerState, ...actions: Parameters<typeof viewerReducer>[1][]) => actions.reduce(viewerReducer, s);

  it("starts assembled with all floors visible", () => {
    expect(s0.exploded).toBe(false);
    expect(s0.activeFloorId).toBe("all");
    expect(s0.explodeDistance).toBe(DEFAULT_EXPLODE_DISTANCE);
  });

  it("toggles the exploded view on and back off to the assembled view", () => {
    const on = step(s0, { type: "toggleExplode" });
    expect(on.exploded).toBe(true);
    expect(step(on, { type: "toggleExplode" }).exploded).toBe(false);
  });

  it("clamps the separation slider and turns exploded view on when it moves", () => {
    expect(step(s0, { type: "setExplodeDistance", value: 999 }).explodeDistance).toBe(MAX_EXPLODE_DISTANCE);
    expect(step(s0, { type: "setExplodeDistance", value: -5 }).explodeDistance).toBe(0);
    expect(step(s0, { type: "setExplodeDistance", value: 9 }).exploded).toBe(true);
  });

  it("selects a floor and shows all floors again", () => {
    const f = step(s0, { type: "selectFloor", floorId: "floor-02" });
    expect(f.activeFloorId).toBe("floor-02");
    expect(step(f, { type: "showAllFloors" }).activeFloorId).toBe("all");
  });

  it("selects a room, and follows it to its floor when one floor is isolated", () => {
    const iso = step(s0, { type: "selectFloor", floorId: "floor-00" });
    const sel = step(iso, { type: "selectRoom", roomId: "b01-f02-r01", floorId: "floor-02" });
    expect(sel.selectedRoomId).toBe("b01-f02-r01");
    expect(sel.activeFloorId).toBe("floor-02");
    const all = step(s0, { type: "selectRoom", roomId: "b01-f02-r01", floorId: "floor-02" });
    expect(all.activeFloorId).toBe("all");
    expect(step(sel, { type: "selectRoom", roomId: null }).selectedRoomId).toBeNull();
  });

  it("issues a fresh reset-camera command every time (nonce increases)", () => {
    const a = step(s0, { type: "resetCamera" });
    const b = step(a, { type: "resetCamera" });
    expect(a.cameraCommand.kind).toBe("reset");
    expect(b.cameraCommand.nonce).toBeGreaterThan(a.cameraCommand.nonce);
  });

  it("builds an isometric camera position and a sane fit zoom", () => {
    const p = isoCameraPosition({ x: 0, y: 4, z: 0 }, 100);
    expect(p.x).toBeCloseTo(p.z, 9);
    expect(p.y - 4).toBeCloseTo(p.x, 9); // equal angles to all axes
    expect(fitZoom(28, 800)).toBeCloseTo(800 / (2 * 28 * 1.15), 6);
    expect(fitZoom(0, 800)).toBe(4);
  });
});

describe("route rendering geometry", () => {
  const route = computeRoute(graph, ENTRANCE, roomDoor(FINANCE));
  if (route.status !== "ok") throw new Error("demo route should exist");
  const dest = data.rooms.find((r) => r.id === FINANCE)!;
  const geo = buildRouteGeometry(route, dest);

  it("draws one polyline per floor, each on its own floor's elevation", () => {
    expect(geo.segments.map((s) => s.floorId)).toEqual(["floor-00", "floor-01"]);
    for (const seg of geo.segments) {
      const elevation = data.floors.find((f) => f.id === seg.floorId)!.elevation;
      for (const [, y] of seg.points) expect(y).toBeCloseTo(elevation + ROUTE_LIFT, 6);
    }
  });

  it("never connects floors with a line through walls: the vertical hop is an explicit transfer", () => {
    expect(geo.transfers).toHaveLength(1);
    const t = geo.transfers[0]!;
    expect(t.from.y).toBeLessThan(t.to.y);
    expect(t.from.x).toBeCloseTo(t.to.x, 6);
    expect(t.from.z).toBeCloseTo(t.to.z, 6);
  });

  it("starts at the entrance and ends inside the destination room", () => {
    expect(geo.start.position).toMatchObject({ x: 0, z: 12 });
    expect(geo.goal.position).toMatchObject({ x: dest.positionX, z: dest.positionZ });
    const last = geo.segments.at(-1)!.points.at(-1)!;
    expect(last[0]).toBeCloseTo(dest.positionX, 6);
  });

  it("includes the exploded offsets when computing the focus bounds", () => {
    const assembled = routeBounds(geo, explodeOffsets(data.floors, 0))!;
    const exploded = routeBounds(geo, explodeOffsets(data.floors, 8))!;
    expect(exploded.max.y - assembled.max.y).toBeCloseTo(8, 6);
    expect(boundsOfPoints([])).toBeNull();
  });

  it("splits a three-floor route into three segments and two transfers", () => {
    const r = computeRoute(graph, roomDoor("b01-f00-r01"), roomDoor(SECRETARIAT));
    if (r.status !== "ok") throw new Error("route");
    const g = buildRouteGeometry(r);
    expect(g.segments).toHaveLength(3);
    expect(g.transfers).toHaveLength(2);
  });
});

describe("GLB room-object mapping", () => {
  const map = model.objectMap;
  const root = new Group();
  const make = (name: string) => {
    const m = new Mesh(new BoxGeometry(1, 1, 1));
    m.name = name;
    return m;
  };
  const wrapper = new Group();
  wrapper.name = "ROOM_B01_F00_R01";
  const inner = make("body"); // un-named child of a mapped group
  wrapper.add(inner);
  root.add(wrapper, make("ROOM_B01_F00_R02.001"), make("some_wall"));

  it("resolves a hit on a child mesh, and Blender '.001' suffixes", () => {
    expect(stripBlenderSuffix("ROOM_B01_F00_R02.001")).toBe("ROOM_B01_F00_R02");
    expect(resolveRoomId(inner, map)).toBe("b01-f00-r01");
    expect(resolveRoomId(root.children[1]!, map)).toBe("b01-f00-r02");
    expect(resolveRoomId(root.children[2]!, map)).toBeNull();
  });

  it("indexes mapped objects and reports rooms missing from a model", () => {
    expect([...indexRoomObjects(root, map).keys()].sort()).toEqual(["b01-f00-r01", "b01-f00-r02"]);
    expect(missingRooms(root, map, ["b01-f00-r01", "b01-f00-r03"])).toEqual(["b01-f00-r03"]);
  });
});
