import ReactThreeTestRenderer from "@react-three/test-renderer";
import { forwardRef, createElement } from "react";
import { describe, expect, it, vi } from "vitest";
import type { Group, Mesh, OrthographicCamera } from "three";
import { BuildingScene, type BuildingSceneProps } from "@/components/3d/BuildingScene";
import { buildRouteGeometry } from "@/lib/model/routeGeometry";
import { initialViewerState, viewerReducer, type ViewerState } from "@/lib/model/viewerState";
import { computeRoute } from "@/lib/navigation";
import type { RoomVisualState } from "@/lib/theme/tokens";
import { ENTRANCE, FINANCE, data, graph, roomDoor } from "../navigation/helpers";

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
 * Renders the REAL React Three Fiber scene headlessly (no WebGL needed) and checks what ends up in the scene graph.
 * Pixel output and GPU behaviour are not covered here; see docs/architecture.md ("What is and is not tested").
 */
const model = data.manifest.buildings[0]!;

function props(overrides: Partial<BuildingSceneProps> = {}, viewer: ViewerState = initialViewerState): BuildingSceneProps {
  return {
    floors: data.floors,
    rooms: data.rooms,
    model,
    viewer,
    roomStates: new Map<string, RoomVisualState>(),
    labelRoomIds: new Set<string>(),
    roomLabel: (id) => id,
    route: null,
    startPin: null,
    destinationPin: null,
    cutaway: true,
    onHoverRoom: () => {},
    onSelectRoom: () => {},
    ...overrides,
  };
}

const floorGroups = (r: Awaited<ReturnType<typeof ReactThreeTestRenderer.create>>) =>
  r.scene.findAll((n) => n.props.name?.startsWith?.("floor:") ?? false);
const byName = (r: Awaited<ReturnType<typeof ReactThreeTestRenderer.create>>, name: string) =>
  r.scene.findAll((n) => n.props.name === name);
type Instance = Awaited<ReturnType<typeof ReactThreeTestRenderer.create>>["scene"];
const y = (n: Instance) => (n.instance as Group).position.y;

let camera: OrthographicCamera | null = null;

async function mount(p: BuildingSceneProps) {
  // orthographic, like the real <Canvas orthographic> in BuildingViewer
  const renderer = await ReactThreeTestRenderer.create(<BuildingScene {...p} />, {
    width: 800,
    height: 600,
    orthographic: true,
    camera: { near: -400, far: 800, zoom: 10, position: [60, 60, 60] },
    onCreated: (state) => {
      camera = state.camera as OrthographicCamera;
    },
  });
  await renderer.advanceFrames(3, 1 / 60);
  return renderer;
}

describe("3D building scene (procedural demo model)", () => {
  it("loads: three floors, one selectable mesh per room, mapped by stable object id", async () => {
    const r = await mount(props());
    expect(floorGroups(r).map((n) => n.props.name)).toEqual(["floor:floor-00", "floor:floor-01", "floor:floor-02"]);
    for (const [objectId] of Object.entries(model.objectMap)) {
      const meshes = byName(r, objectId);
      expect(meshes, objectId).toHaveLength(1);
      expect((meshes[0]!.instance as Mesh).userData["roomId"]).toBe(model.objectMap[objectId]);
    }
    await r.unmount();
  });

  it("selecting a room: click fires onSelectRoom with the room id; hover reports it too", async () => {
    const onSelectRoom = vi.fn();
    const onHoverRoom = vi.fn();
    const r = await mount(props({ onSelectRoom, onHoverRoom }));
    const mesh = byName(r, "ROOM_B01_F01_R01")[0]!;
    await r.fireEvent(mesh, "pointerOver");
    expect(onHoverRoom).toHaveBeenLastCalledWith("b01-f01-r01");
    await r.fireEvent(mesh, "pointerOut");
    expect(onHoverRoom).toHaveBeenLastCalledWith(null);
    await r.fireEvent(mesh, "click");
    expect(onSelectRoom).toHaveBeenCalledWith("b01-f01-r01");
    await r.unmount();
  });

  it("floor selection: isolating a floor removes the others from the scene; 'all' brings them back", async () => {
    const isolated = viewerReducer(viewerReducer(initialViewerState, { type: "setOtherFloors", mode: "hide" }), {
      type: "selectFloor",
      floorId: "floor-02",
    });
    const r = await mount(props({}, isolated));
    expect(floorGroups(r).map((n) => n.props.name)).toEqual(["floor:floor-02"]);
    await r.update(<BuildingScene {...props({}, viewerReducer(isolated, { type: "selectFloor", floorId: "all" }))} />);
    await r.advanceFrames(2, 1 / 60);
    expect(floorGroups(r)).toHaveLength(3);
    await r.unmount();
  });

  it("floor selection: other floors can stay as non-interactive ghosts", async () => {
    const ghosted = viewerReducer(initialViewerState, { type: "selectFloor", floorId: "floor-01" });
    const onSelectRoom = vi.fn();
    const r = await mount(props({ onSelectRoom }, ghosted));
    expect(floorGroups(r)).toHaveLength(3);
    const ghostRoom = byName(r, "ROOM_B01_F00_R01")[0]!;
    await r.fireEvent(ghostRoom, "click");
    expect(onSelectRoom).not.toHaveBeenCalled();
    await r.unmount();
  });

  it("Exploded View: floors separate in order with the ground floor fixed, then return when assembled", async () => {
    const r = await mount(props());
    const offsets = () => floorGroups(r).map(y);
    expect(offsets()).toEqual([0, 0, 0]);

    const exploded = viewerReducer(initialViewerState, { type: "toggleExplode" });
    await r.update(<BuildingScene {...props({}, exploded)} />);
    await r.advanceFrames(240, 1 / 60); // let the damped animation settle
    const [g0, g1, g2] = offsets() as [number, number, number];
    expect(g0).toBe(0);
    expect(g1).toBeGreaterThan(0);
    expect(g2).toBeGreaterThan(g1);

    await r.update(<BuildingScene {...props({}, viewerReducer(exploded, { type: "toggleExplode" }))} />);
    await r.advanceFrames(240, 1 / 60);
    expect(offsets()).toEqual([0, 0, 0]);
    await r.unmount();
  });

  it("Exploded View: the separation slider changes the distance", async () => {
    const small = viewerReducer(viewerReducer(initialViewerState, { type: "setExploded", value: true }), { type: "setExplodeDistance", value: 4 });
    const large = viewerReducer(small, { type: "setExplodeDistance", value: 12 });
    const r = await mount(props({}, small));
    await r.advanceFrames(240, 1 / 60);
    const topSmall = y(floorGroups(r)[2]!);
    await r.update(<BuildingScene {...props({}, large)} />);
    await r.advanceFrames(240, 1 / 60);
    expect(y(floorGroups(r)[2]!)).toBeGreaterThan(topSmall);
    await r.unmount();
  });

  it("renders the route on the right floors with start/destination markers and an explicit vertical transfer", async () => {
    const result = computeRoute(graph, ENTRANCE, roomDoor(FINANCE));
    if (result.status !== "ok") throw new Error("demo route expected");
    const dest = data.rooms.find((room) => room.id === FINANCE)!;
    const route = buildRouteGeometry(result, dest);
    const startPin = { floorId: route.start.floorId, position: route.start.position, label: "start" };
    const destinationPin = { floorId: route.goal.floorId, position: route.goal.position, label: "goal" };
    const r = await mount(props({ route, startPin, destinationPin }));

    expect(byName(r, "route:floor-00")).toHaveLength(1);
    expect(byName(r, "route:floor-01")).toHaveLength(1);
    expect(byName(r, "route:floor-02")).toHaveLength(0);
    expect(byName(r, "pin:start")).toHaveLength(1);
    expect(byName(r, "pin:destination")).toHaveLength(1);
    expect(byName(r, "transfer:floor-00->floor-01")).toHaveLength(1);
    // The route belongs to its floor's group, so it moves with the floor in the exploded view.
    const floor1 = floorGroups(r)[1]!;
    expect(floor1.findAll((n) => n.props.name === "route:floor-01")).toHaveLength(1);
    await r.unmount();
  });

  it("camera: orthographic isometric camera is created and the reset command re-frames it", async () => {
    const r = await mount(props());
    if (!camera) throw new Error("camera not created");
    expect(camera.isOrthographicCamera).toBe(true);
    const home = { position: camera.position.clone(), zoom: camera.zoom };
    camera.position.set(1, 2, 3);
    camera.zoom = 1;
    await r.update(<BuildingScene {...props({}, viewerReducer(initialViewerState, { type: "resetCamera" }))} />);
    await r.advanceFrames(240, 1 / 60);
    expect(camera.zoom).toBeGreaterThan(1);
    expect(camera.position.distanceTo(home.position)).toBeLessThan(home.position.length());
    await r.unmount();
  });
});
