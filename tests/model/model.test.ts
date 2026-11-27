import { describe, expect, it } from "vitest";
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
import { initialViewerState, viewerReducer, type ViewerState } from "@/lib/model/viewerState";
import type { Floor } from "@/lib/data/types";

/** Synthetic three-storey stack: the exploded-view helpers are pure and independent of the campus data. */
const floors: Floor[] = [0, 1, 2].map((n) => ({
  id: `floor-0${n}`,
  buildingId: "b",
  floorNumber: n,
  displayName: String(n),
  elevation: n * 3.6,
  modelUrl: null,
  isDemo: false,
}));
const data = { floors };

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
    const sel = step(iso, { type: "selectRoom", roomId: "room-x", floorId: "floor-02" });
    expect(sel.selectedRoomId).toBe("room-x");
    expect(sel.activeFloorId).toBe("floor-02");
    const all = step(s0, { type: "selectRoom", roomId: "room-x", floorId: "floor-02" });
    expect(all.activeFloorId).toBe("all");
    expect(step(sel, { type: "selectRoom", roomId: null }).selectedRoomId).toBeNull();
  });

  it("issues a fresh reset-camera command every time (nonce increases)", () => {
    const a = step(s0, { type: "resetCamera" });
    const b = step(a, { type: "resetCamera" });
    expect(a.cameraCommand.kind).toBe("reset");
    expect(b.cameraCommand.nonce).toBeGreaterThan(a.cameraCommand.nonce);
  });

  it("focuses and zooms the camera with fresh commands", () => {
    const bounds = { min: { x: 0, y: 0, z: 0 }, max: { x: 10, y: 4, z: 10 } };
    const f = step(s0, { type: "focusCamera", bounds });
    expect(f.cameraCommand).toMatchObject({ kind: "focus", bounds });
    const z = step(f, { type: "zoomCamera", factor: 1.3 });
    expect(z.cameraCommand).toMatchObject({ kind: "zoom", factor: 1.3 });
    expect(z.cameraCommand.nonce).toBeGreaterThan(f.cameraCommand.nonce);
    expect(boundsOfPoints([])).toBeNull();
    expect(
      boundsOfPoints([
        { x: 1, y: 2, z: 3 },
        { x: -1, y: 0, z: 5 },
      ]),
    ).toEqual({ min: { x: -1, y: 0, z: 3 }, max: { x: 1, y: 2, z: 5 } });
  });

  it("builds an isometric camera position and a sane fit zoom", () => {
    const p = isoCameraPosition({ x: 0, y: 4, z: 0 }, 100);
    expect(p.x).toBeCloseTo(p.z, 9);
    expect(p.y - 4).toBeCloseTo(p.x, 9); // equal angles to all axes
    expect(fitZoom(28, 800)).toBeCloseTo(800 / (2 * 28 * 1.15), 6);
    expect(fitZoom(0, 800)).toBe(4);
  });
});
