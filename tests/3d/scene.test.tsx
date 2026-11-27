import ReactThreeTestRenderer from "@react-three/test-renderer";
import { forwardRef, createElement } from "react";
import { describe, expect, it, vi } from "vitest";
import { CampusScene, type CampusSceneProps } from "@/components/3d/CampusScene";
import type { CampusInteriorProps } from "@/components/3d/CampusInterior";
import { buildLookups } from "@/lib/data/lookups";
import { planJourney } from "@/lib/model/journey";
import { initialViewerState } from "@/lib/model/viewerState";
import { B2_OFFICE_430, data, graph } from "../navigation/helpers";

// React's act() needs this flag outside a browser test runner.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// The headless renderer has no DOM canvas, so drei's OrbitControls would have nothing to attach to.
// Everything else (the real OrbitControls class, our CameraRig, the scene) runs unchanged.
const fakeCanvas = vi.hoisted(() => {
  const noop = () => {};
  const target = { addEventListener: noop, removeEventListener: noop, dispatchEvent: () => true };
  return {
    ...target,
    style: {} as Record<string, string>,
    ownerDocument: target,
    getRootNode: () => target,
    setPointerCapture: noop,
    releasePointerCapture: noop,
    hasPointerCapture: () => false,
    clientWidth: 800,
    clientHeight: 600,
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 600, right: 800, bottom: 600, x: 0, y: 0 }),
  };
});
vi.mock("@react-three/drei", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@react-three/drei")>();
  const OrbitControls = forwardRef<unknown, Record<string, unknown>>((props, ref) =>
    createElement(actual.OrbitControls as never, { ...props, ref, domElement: fakeCanvas }),
  );
  OrbitControls.displayName = "OrbitControls";
  return { ...actual, OrbitControls };
});

/**
 * Renders the REAL React Three Fiber campus scene headlessly (no WebGL needed) and checks what ends up in the scene graph:
 * buildings, the cutaway first floors of buildings 1-3, the sky bridges, the selectable rooms and the indoor route.
 * Pixel output and GPU behaviour are not covered here; see docs/architecture.md ("What is and is not tested").
 */
const campus = data.manifest.campus;
const interiors = data.manifest.interiors;
const lookups = buildLookups(data);
const ALL = new Set(interiors.floors.map((f) => f.buildingId));
const GATE = campus.entrances![0]!.id;

type Renderer = Awaited<ReturnType<typeof ReactThreeTestRenderer.create>>;
const byName = (r: Renderer, name: string) => r.scene.findAll((n) => n.props.name === name);
const byPrefix = (r: Renderer, prefix: string) => r.scene.findAll((n) => n.props.name?.startsWith?.(prefix) ?? false);

function interior(overrides: Partial<CampusInteriorProps> = {}): CampusInteriorProps {
  return {
    interiors,
    openBuildingIds: ALL,
    labelBuildingIds: ALL,
    doors: data.nodes.filter((n) => n.type === "room-door").map((n) => ({ x: n.x, z: n.z })),
    labels: [],
    selectedRoomId: null,
    destinationRoomId: null,
    hoveredRoomId: null,
    onHoverRoom: () => {},
    onSelectRoom: () => {},
    route: null,
    ...overrides,
  };
}

function props(overrides: Partial<CampusSceneProps> = {}): CampusSceneProps {
  return {
    campus,
    selectedKey: null,
    hoveredKey: null,
    onHover: () => {},
    onSelect: () => {},
    cameraCommand: initialViewerState.cameraCommand,
    interior: interior(),
    ...overrides,
  };
}

async function mount(p: CampusSceneProps) {
  const renderer = await ReactThreeTestRenderer.create(<CampusScene {...p} />, {
    width: 800,
    height: 600,
    orthographic: true,
    camera: { near: -400, far: 800, zoom: 4, position: [60, 60, 60] },
  });
  await renderer.advanceFrames(3, 1 / 60);
  return renderer;
}

describe("3D campus scene (site plan + first-floor interiors)", () => {
  it("renders every building of the site plan with a closed outline", async () => {
    const r = await mount(props({ interior: undefined }));
    for (const b of campus.buildings.filter((x) => x.footprint && x.clickable)) {
      expect(byName(r, `campus-building-group:${b.id ?? b.slug ?? b.label}`), b.label).toHaveLength(1);
    }
    expect(byName(r, "campus-interior")).toHaveLength(0);
    await r.unmount();
  });

  it("draws the first floor of buildings 1-3 and both sky bridges", async () => {
    const r = await mount(props());
    expect(byName(r, "campus-interior")).toHaveLength(1);
    expect(byPrefix(r, "interior-floor:")).toHaveLength(interiors.floors.length);
    expect(byPrefix(r, "campus-bridge:")).toHaveLength(interiors.bridges.length);
    expect(interiors.bridges.length).toBeGreaterThanOrEqual(2);
    await r.unmount();
  });

  it("one selectable mesh per room; click and hover report the room id", async () => {
    const onSelectRoom = vi.fn();
    const onHoverRoom = vi.fn();
    const r = await mount(props({ interior: interior({ onSelectRoom, onHoverRoom }) }));
    const meshes = byPrefix(r, "interior-room:");
    expect(meshes.length).toBe(data.rooms.filter((x) => interiors.floors.some((f) => f.floorId === x.floorId)).length);
    const mesh = byName(r, `interior-room:${B2_OFFICE_430}`)[0]!;
    await r.fireEvent(mesh, "pointerOver");
    expect(onHoverRoom).toHaveBeenLastCalledWith(B2_OFFICE_430);
    await r.fireEvent(mesh, "pointerOut");
    expect(onHoverRoom).toHaveBeenLastCalledWith(null);
    await r.fireEvent(mesh, "click");
    expect(onSelectRoom).toHaveBeenCalledWith(B2_OFFICE_430);
    await r.unmount();
  });

  it("only the buildings that are opened show their interior", async () => {
    const r = await mount(props({ interior: interior({ openBuildingIds: new Set(["campus-b2"]) }) }));
    const floorIds = byPrefix(r, "interior-floor:").map((n) => n.props.name as string);
    const b2Floor = interiors.floors.find((f) => f.buildingId === "campus-b2")!.floorId;
    expect(floorIds).toEqual([`interior-floor:${b2Floor}`]);
    await r.unmount();
  });

  it("draws the indoor route of a journey that crosses a sky bridge", async () => {
    const j = planJourney(data, lookups, graph, campus, GATE, B2_OFFICE_430);
    if (j.status !== "ok") throw new Error("journey expected");
    const r = await mount(
      props({
        interior: interior({ route: j.indoorPoints, destinationRoomId: B2_OFFICE_430 }),
        route: { points: j.outdoor.points },
        routeStartId: GATE,
      }),
    );
    expect(byName(r, "campus-indoor-route")).toHaveLength(1);
    expect(byName(r, "campus-route")).toHaveLength(1);
    await r.unmount();
  });

  it("building selection: clicking a building reports its key", async () => {
    const onSelect = vi.fn();
    const r = await mount(props({ onSelect, interior: undefined }));
    const b = campus.buildings.find((x) => x.footprint && x.clickable)!;
    const key = b.id ?? b.slug ?? b.label;
    await r.fireEvent(byName(r, `campus-building:${key}`)[0]!, "click");
    expect(onSelect).toHaveBeenCalledWith(key);
    await r.unmount();
  });
});
