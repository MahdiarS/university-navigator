import { describe, expect, it } from "vitest";
import {
  buildDirections,
  buildGraph,
  computeRoute,
  findPath,
  turnBetween,
  validateGraph,
  type GraphEdge,
  type GraphNode,
  type RouteSuccess,
} from "@/lib/navigation";
import { B1_OFFICE_400, B2_OFFICE_430, B3_OFFICE_440, ENTRANCE_B1, ENTRANCE_B3, data, graph, roomDoor } from "./helpers";

const buildingsOf = (r: RouteSuccess): string[] => r.nodes.map((n) => n.buildingId).filter((b, i, a) => i === 0 || b !== a[i - 1]);

const ok = (r: ReturnType<typeof computeRoute>): RouteSuccess => {
  if (r.status !== "ok") throw new Error(`expected ok route, got ${r.status}`);
  return r;
};

describe("campus indoor navigation graph (first floors of buildings 1-3 + sky bridges)", () => {
  it("has no integrity errors and is fully connected", () => {
    expect(validateGraph(data.nodes, data.edges)).toEqual([]);
  });

  it("keeps the A* heuristic admissible without scaling (every edge >= straight line)", () => {
    expect(graph.heuristicScale).toBe(1);
  });
});

describe("same-floor route", () => {
  it("routes between two offices of one building along the corridor", () => {
    const r = ok(computeRoute(graph, roomDoor(B1_OFFICE_400), roomDoor("campus-b1-r402")));
    expect(r.floorIds).toEqual(["campus-b1-f1"]);
    expect(r.transfers).toHaveLength(0);
    expect(r.nodeIds[0]).toBe(roomDoor(B1_OFFICE_400));
    expect(r.nodeIds.at(-1)).toBe(roomDoor("campus-b1-r402"));
    expect(r.totalDistance).toBeGreaterThan(2);
  });
});

describe("route from an outdoor entrance", () => {
  it("climbs from the ground floor to the first floor by the stairs", () => {
    const r = ok(computeRoute(graph, ENTRANCE_B3, roomDoor(B3_OFFICE_440)));
    expect(r.nodeIds[0]).toBe(ENTRANCE_B3);
    expect(r.floorIds).toEqual(["campus-b3-f0", "campus-b3-f1"]);
    expect(r.nodes[0]!.type).toBe("entrance");
    expect(r.transfers).toHaveLength(1);
    expect(r.transfers[0]!.via).toBe("stairs");
  });

  it("reaches building 2 (no outdoor door) only through a sky bridge", () => {
    const fromB3 = ok(computeRoute(graph, ENTRANCE_B3, roomDoor(B2_OFFICE_430)));
    expect(fromB3.traversals.filter((t) => t.edge.edgeType === "bridge")).toHaveLength(1);
    expect(buildingsOf(fromB3)).toEqual(["campus-b3", "campus-b2"]);
    const fromB1 = ok(computeRoute(graph, ENTRANCE_B1, roomDoor(B2_OFFICE_430)));
    expect(fromB1.traversals.filter((t) => t.edge.edgeType === "bridge")).toHaveLength(1);
    expect(buildingsOf(fromB1)).toEqual(["campus-b1", "campus-b2"]);
  });

  it("goes between building 3 and building 1 across both bridges", () => {
    const r = ok(computeRoute(graph, roomDoor(B3_OFFICE_440), roomDoor(B1_OFFICE_400)));
    expect(r.traversals.filter((t) => t.edge.edgeType === "bridge")).toHaveLength(2);
    expect(buildingsOf(r)).toEqual(["campus-b3", "campus-b2", "campus-b1"]);
    expect(r.floorIds).toEqual(["campus-b3-f1"]); // the sky bridges join the first floors: no stairs needed
  });
});

describe("shortest paths", () => {
  it("A* and Dijkstra agree on cost; A* expands no more nodes", () => {
    const ids = data.rooms.filter((r) => r.doorNodeId).map((r) => roomDoor(r.id));
    for (const from of ids.slice(0, 20)) {
      for (const to of [roomDoor(B2_OFFICE_430), roomDoor(B1_OFFICE_400), ENTRANCE_B3]) {
        if (from === to) continue;
        const a = findPath(graph, from, to, { algorithm: "astar" });
        const d = findPath(graph, from, to, { algorithm: "dijkstra" });
        expect(a.found && d.found).toBe(true);
        expect(a.cost).toBeCloseTo(d.cost, 6);
        expect(a.expanded).toBeLessThanOrEqual(d.expanded);
      }
    }
  });
});

describe("accessible (step-free) route", () => {
  it("says so when the only way up is a staircase (there is no elevator in the data)", () => {
    expect(computeRoute(graph, ENTRANCE_B3, roomDoor(B3_OFFICE_440)).status).toBe("ok");
    expect(computeRoute(graph, ENTRANCE_B3, roomDoor(B3_OFFICE_440), { accessibleOnly: true }).status).toBe("no-accessible-route");
  });

  it("does not call a stair route step-free", () => {
    expect(ok(computeRoute(graph, ENTRANCE_B3, roomDoor(B3_OFFICE_440))).stepFree).toBe(false);
  });
});

describe("no-route and invalid input", () => {
  const nodes: GraphNode[] = [
    { id: "a", buildingId: "b", floorId: "f0", x: 0, y: 0, z: 0, type: "corridor" },
    { id: "b", buildingId: "b", floorId: "f0", x: 5, y: 0, z: 0, type: "corridor" },
    { id: "island", buildingId: "b", floorId: "f0", x: 50, y: 0, z: 0, type: "room-door" },
  ];
  const edges: GraphEdge[] = [
    { id: "ab", fromNode: "a", toNode: "b", distance: 5, edgeType: "corridor", accessible: true, bidirectional: true },
  ];
  const g = buildGraph(nodes, edges);

  it("returns no-route for a disconnected node", () => {
    expect(computeRoute(g, "a", "island").status).toBe("no-route");
  });
  it("returns unknown-start / unknown-goal / same-location", () => {
    expect(computeRoute(g, "zzz", "a").status).toBe("unknown-start");
    expect(computeRoute(g, "a", "zzz").status).toBe("unknown-goal");
    expect(computeRoute(g, "a", "a").status).toBe("same-location");
  });
  it("respects one-way edges", () => {
    const oneWay = buildGraph(nodes, [{ ...edges[0]!, bidirectional: false }]);
    expect(computeRoute(oneWay, "a", "b").status).toBe("ok");
    expect(computeRoute(oneWay, "b", "a").status).toBe("no-route");
  });
  it("flags dangling edges and warns about edges shorter than the straight line", () => {
    const issues = validateGraph(nodes, [
      ...edges,
      { id: "bad", fromNode: "a", toNode: "ghost", distance: 1, edgeType: "corridor", accessible: true, bidirectional: true },
      { id: "short", fromNode: "b", toNode: "island", distance: 2, edgeType: "corridor", accessible: true, bidirectional: true },
    ]);
    expect(issues.some((i) => i.code === "dangling-edge")).toBe(true);
    expect(issues.some((i) => i.code === "short-edge")).toBe(true);
  });
  it("scales the heuristic down so A* stays optimal with a too-short edge", () => {
    const tricky = buildGraph(nodes, [
      { id: "short", fromNode: "a", toNode: "b", distance: 2, edgeType: "corridor", accessible: true, bidirectional: true },
    ]);
    expect(tricky.heuristicScale).toBeCloseTo(2 / 5, 6);
    expect(findPath(tricky, "a", "b").cost).toBe(2);
  });
});

describe("route replacement when the destination changes", () => {
  it("returns a different, correct route for the new destination and leaves the old one untouched", () => {
    const first = ok(computeRoute(graph, ENTRANCE_B3, roomDoor(B3_OFFICE_440)));
    const second = ok(computeRoute(graph, ENTRANCE_B3, roomDoor(B2_OFFICE_430)));
    expect(second.goalId).toBe(roomDoor(B2_OFFICE_430));
    expect(first.goalId).toBe(roomDoor(B3_OFFICE_440));
    expect(second.nodeIds).not.toEqual(first.nodeIds);
    expect(first.floorIds).toEqual(["campus-b3-f0", "campus-b3-f1"]);
    expect(buildingsOf(second)).toEqual(["campus-b3", "campus-b2"]);
  });
});

describe("directions", () => {
  it("starts with start, ends with arrive and has a bridge step for the sky bridge", () => {
    const r = ok(computeRoute(graph, ENTRANCE_B3, roomDoor(B2_OFFICE_430)));
    const steps = buildDirections(graph, r);
    expect(steps[0]!.kind).toBe("start");
    expect(steps.at(-1)!.kind).toBe("arrive");
    expect(steps.filter((s) => s.kind === "transfer")).toHaveLength(1);
    expect(steps.filter((s) => s.kind === "bridge")).toHaveLength(1);
    // every metre of the route is accounted for by a walk, a stair flight or a bridge step
    const sum = steps.reduce((n, s) => n + (s.kind === "walk" || s.kind === "bridge" ? s.distance : 0), 0);
    const vertical = r.traversals.filter((t) => t.edge.edgeType === "stairs" || t.edge.edgeType === "elevator").reduce((n, t) => n + t.edge.distance, 0);
    expect(sum + vertical).toBeCloseTo(r.totalDistance, 5);
  });

  it("computes left/right turns with a documented handedness (north then east = right)", () => {
    const north = { x: 0, z: -1 };
    const east = { x: 1, z: 0 };
    const west = { x: -1, z: 0 };
    expect(turnBetween(north, east)).toBe("right");
    expect(turnBetween(north, west)).toBe("left");
    expect(turnBetween(north, { x: 0, z: -1 })).toBeNull();
    expect(turnBetween(north, { x: 0, z: 1 })).toBe("u-turn");
  });
});
