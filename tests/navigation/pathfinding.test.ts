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
import {
  ENTRANCE,
  EDUCATION,
  FINANCE,
  SECRETARIAT,
  STUDENT_AFFAIRS,
  STUDY_HALL,
  data,
  graph,
  roomDoor,
} from "./helpers";

const ok = (r: ReturnType<typeof computeRoute>): RouteSuccess => {
  if (r.status !== "ok") throw new Error(`expected ok route, got ${r.status}`);
  return r;
};

describe("demo navigation graph", () => {
  it("has no integrity errors and is fully connected", () => {
    const issues = validateGraph(data.nodes, data.edges);
    expect(issues).toEqual([]);
  });

  it("keeps the A* heuristic admissible without scaling (every edge >= straight line)", () => {
    expect(graph.heuristicScale).toBe(1);
  });
});

describe("same-floor route", () => {
  it("routes between two rooms on the ground floor with the expected weighted distance", () => {
    const r = ok(computeRoute(graph, roomDoor(EDUCATION), roomDoor(STUDENT_AFFAIRS)));
    // door(1.5) + corridor(9.5) + door(1.5)
    expect(r.totalDistance).toBeCloseTo(12.5, 5);
    expect(r.floorIds).toEqual(["floor-00"]);
    expect(r.segments).toHaveLength(1);
    expect(r.transfers).toHaveLength(0);
    expect(r.nodeIds[0]).toBe(roomDoor(EDUCATION));
    expect(r.nodeIds.at(-1)).toBe(roomDoor(STUDENT_AFFAIRS));
  });
});

describe("multi-floor route", () => {
  it("goes ground -> second floor and exposes explicit vertical transfers", () => {
    const r = ok(computeRoute(graph, roomDoor(EDUCATION), roomDoor(SECRETARIAT)));
    expect(r.floorIds).toEqual(["floor-00", "floor-01", "floor-02"]);
    expect(r.segments).toHaveLength(3);
    expect(r.transfers).toHaveLength(2);
    expect(r.transfers.map((t) => t.direction)).toEqual(["up", "up"]);
    // default (not accessible-only) prefers the cheaper stairs
    expect(r.transfers.every((t) => t.via === "stairs")).toBe(true);
    expect(r.stepFree).toBe(false);
    // no straight line through floors: consecutive path nodes on different floors are always a transfer edge
    for (const t of r.traversals) {
      const a = graph.nodes.get(t.from)!;
      const b = graph.nodes.get(t.to)!;
      if (a.floorId !== b.floorId) expect(["stairs", "elevator"]).toContain(t.edge.edgeType);
    }
  });

  it("A* and Dijkstra agree on cost; A* expands no more nodes", () => {
    const ids = data.rooms.map((r) => roomDoor(r.id));
    for (const from of ids.slice(0, 21)) {
      for (const to of [roomDoor(FINANCE), roomDoor(SECRETARIAT), ENTRANCE]) {
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

describe("route from the entrance", () => {
  it("reaches the Finance Office on the first floor", () => {
    const r = ok(computeRoute(graph, ENTRANCE, roomDoor(FINANCE)));
    expect(r.nodeIds[0]).toBe(ENTRANCE);
    expect(r.floorIds).toEqual(["floor-00", "floor-01"]);
    expect(r.nodes[0]!.type).toBe("entrance");
  });
});

describe("accessible (step-free) route", () => {
  it("avoids stairs and uses the elevator, and is reported step-free from the data", () => {
    const r = ok(computeRoute(graph, ENTRANCE, roomDoor(FINANCE), { accessibleOnly: true }));
    expect(r.transfers).toHaveLength(1);
    expect(r.transfers[0]!.via).toBe("elevator");
    expect(r.traversals.some((t) => t.edge.edgeType === "stairs")).toBe(false);
    expect(r.stepFree).toBe(true);
  });

  it("is never longer-than-necessary wrong: accessible cost >= unrestricted cost", () => {
    const a = ok(computeRoute(graph, ENTRANCE, roomDoor(SECRETARIAT)));
    const b = ok(computeRoute(graph, ENTRANCE, roomDoor(SECRETARIAT), { accessibleOnly: true }));
    expect(b.totalDistance).toBeGreaterThanOrEqual(a.totalDistance);
  });

  it("explains when a destination only has a non-accessible connection", () => {
    // demo data marks the study hall threshold as not accessible
    const normal = computeRoute(graph, ENTRANCE, roomDoor(STUDY_HALL));
    expect(normal.status).toBe("ok");
    const r = computeRoute(graph, ENTRANCE, roomDoor(STUDY_HALL), { accessibleOnly: true });
    expect(r.status).toBe("no-accessible-route");
  });

  it("does not call a route step-free when an edge is not explicitly accessible", () => {
    const r = ok(computeRoute(graph, ENTRANCE, roomDoor(STUDY_HALL)));
    expect(r.stepFree).toBe(false);
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
    const first = ok(computeRoute(graph, ENTRANCE, roomDoor(EDUCATION)));
    const second = ok(computeRoute(graph, ENTRANCE, roomDoor(FINANCE)));
    expect(second.goalId).toBe(roomDoor(FINANCE));
    expect(first.goalId).toBe(roomDoor(EDUCATION));
    expect(second.nodeIds).not.toEqual(first.nodeIds);
    expect(second.floorIds).toEqual(["floor-00", "floor-01"]);
    expect(first.floorIds).toEqual(["floor-00"]);
  });
});

describe("directions", () => {
  it("starts with start, ends with arrive and contains a transfer for multi-floor routes", () => {
    const r = ok(computeRoute(graph, ENTRANCE, roomDoor(FINANCE)));
    const steps = buildDirections(graph, r);
    expect(steps[0]!.kind).toBe("start");
    expect(steps.at(-1)!.kind).toBe("arrive");
    expect(steps.filter((s) => s.kind === "transfer")).toHaveLength(1);
    const walked = steps.filter((s) => s.kind === "walk").reduce((n, s) => n + (s.kind === "walk" ? s.distance : 0), 0);
    const transfers = r.traversals.filter((t) => t.edge.edgeType === "stairs" || t.edge.edgeType === "elevator");
    const vertical = transfers.reduce((n, t) => n + t.edge.distance, 0);
    expect(walked + vertical).toBeCloseTo(r.totalDistance, 5);
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
