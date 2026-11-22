import { describe, expect, it } from "vitest";
import campusLayoutJson from "@data/campus/campus-layout.json";
import { CampusSchema } from "@/lib/data/schemas";
import {
  buildCampusGraph,
  findCampusRoute,
  segmentCrossesInterior,
  strictlyInside,
  WALKING_SPEED,
  type CampusObstacle,
} from "@/lib/navigation/campus-route";
import {
  campusEntrances,
  describeCampusRoute,
  entranceName,
  formatWalkTime,
  nearestEntrance,
  routeFailureText,
  routeFromEntrance,
} from "@/lib/model/campus-nav";

const square = (id: string, x0: number, z0: number, x1: number, z1: number): CampusObstacle => ({
  id,
  ring: [
    { x: x0, z: z0 },
    { x: x1, z: z0 },
    { x: x1, z: z1 },
    { x: x0, z: z1 },
  ],
});

describe("geometry predicates", () => {
  const ring = square("s", 0, 0, 10, 10).ring;

  it("treats outline points as outside and interior points as inside", () => {
    expect(strictlyInside({ x: 5, z: 5 }, ring)).toBe(true);
    expect(strictlyInside({ x: 0, z: 5 }, ring)).toBe(false);
    expect(strictlyInside({ x: 10, z: 10 }, ring)).toBe(false);
    expect(strictlyInside({ x: 11, z: 5 }, ring)).toBe(false);
  });

  it("blocks segments through the interior but not ones that touch or run along the outline", () => {
    expect(segmentCrossesInterior({ x: -5, z: 5 }, { x: 15, z: 5 }, ring)).toBe(true);
    expect(segmentCrossesInterior({ x: 0, z: 0 }, { x: 10, z: 10 }, ring)).toBe(true); // diagonal through two corners
    expect(segmentCrossesInterior({ x: 0, z: 0 }, { x: 10, z: 0 }, ring)).toBe(false); // along an edge
    expect(segmentCrossesInterior({ x: -5, z: -5 }, { x: 0, z: 0 }, ring)).toBe(false); // ends at a corner
    expect(segmentCrossesInterior({ x: -5, z: -5 }, { x: 20, z: -5 }, ring)).toBe(false);
  });
});

describe("findCampusRoute on a synthetic yard", () => {
  const wall = square("wall", 0, -10, 4, 10);
  const graph = buildCampusGraph([wall]);

  it("goes straight when nothing is in the way", () => {
    const r = findCampusRoute(buildCampusGraph([]), { x: 0, z: 0 }, { kind: "point", point: { x: 30, z: 0 } });
    expect(r).toMatchObject({ status: "ok", length: 30 });
  });

  it("walks around an obstacle instead of through it, and reports the corner it bends at", () => {
    const r = findCampusRoute(graph, { x: -10, z: 0 }, { kind: "point", point: { x: 14, z: 0 } });
    if (r.status !== "ok") throw new Error(r.status);
    expect(r.length).toBeGreaterThan(24);
    expect(r.points.length).toBe(4); // start, two wall corners, goal
    for (const leg of r.legs) expect(segmentCrossesInterior(leg.from, leg.to, wall.ring)).toBe(false);
    expect(r.legs[0]!.cornerOf).toBe("wall");
    expect(r.legs.at(-1)!.cornerOf).toBeNull();
    expect(r.durationSec).toBeCloseTo(r.length / WALKING_SPEED, 6);
  });

  it("can target an obstacle: ends on its outline, on the near side", () => {
    const r = findCampusRoute(graph, { x: -20, z: 0 }, { kind: "obstacle", obstacleId: "wall" });
    if (r.status !== "ok") throw new Error(r.status);
    expect(r.arrival.x).toBeCloseTo(0, 6);
    expect(r.length).toBeCloseTo(20, 1);
  });

  it("reports unknown goals, same location and a start swallowed by a building", () => {
    expect(findCampusRoute(graph, { x: -5, z: 0 }, { kind: "obstacle", obstacleId: "nope" }).status).toBe("unknown-goal");
    expect(findCampusRoute(graph, { x: -5, z: 0 }, { kind: "point", point: { x: -5, z: 0.1 } }).status).toBe("same-location");
    const big = buildCampusGraph([square("big", 0, -30, 40, 30)]);
    expect(findCampusRoute(big, { x: 20, z: 0 }, { kind: "point", point: { x: 60, z: 0 } }).status).toBe("blocked-start"); // deeper than the snap limit
    // a start just inside the outline is nudged out instead of rejected
    expect(findCampusRoute(graph, { x: 2, z: 0 }, { kind: "point", point: { x: 20, z: 0 } }).status).toBe("ok");
  });

  it("reports no route when the goal is walled in", () => {
    // four overlapping walls around the goal (overlaps leave no gap at the corners)
    const box = [square("n", -12, -10, 12, -8), square("s", -12, 8, 12, 10), square("w", -10, -12, -8, 12), square("e", 8, -12, 10, 12)];
    const r = findCampusRoute(buildCampusGraph(box), { x: -30, z: 0 }, { kind: "point", point: { x: 0, z: 0 } });
    expect(r.status).toBe("no-route");
  });
});

describe("real campus: routes start at the university entrance", () => {
  const campus = CampusSchema.parse(campusLayoutJson);
  const buildings = campus.buildings.filter((b) => b.clickable);
  const obstacles = campus.nav!.obstacles;

  it("has the one remaining entrance and obstacles for every extruded building, the pitch, the court, gazebos and the pond", () => {
    expect(campusEntrances(campus)).toHaveLength(1);
    expect(entranceName(campus, "campus-entrance-1")).toBe("درب ورود");
    for (const g of campus.props!) expect(obstacles.some((o) => o.id === g.id)).toBe(true);
    for (const b of buildings) expect(obstacles.some((o) => o.id === b.id)).toBe(true);
    for (const id of ["area-pitch", "area-court", "pond-1"]) expect(obstacles.some((o) => o.id === id)).toBe(true);
  });

  for (const e of campusEntrances(campus)) {
    it(`reaches every building from ${e.id} without crossing any building`, () => {
      for (const b of buildings) {
        const q = routeFromEntrance(campus, e.id, b.id!);
        if (q.status !== "ok") throw new Error(`${e.id} -> ${b.id}: ${q.status}`);
        const { route } = q;
        // starts exactly at the entrance, never at the building itself
        expect(route.points[0]).toMatchObject({ x: e.x, z: e.z });
        // never shorter than the straight line, never through an obstacle interior
        const straight = Math.hypot(route.arrival.x - e.x, route.arrival.z - e.z);
        expect(route.length).toBeGreaterThanOrEqual(straight - 1e-6);
        // the last leg of a door route steps through the building's own walking margin to the door; nothing else may be crossed
        const own = obstacles.find((o) => o.id === b.id)!;
        route.legs.forEach((leg, i) => {
          const last = i === route.legs.length - 1;
          for (const o of obstacles) {
            if (q.toDoor && last && o === own) continue;
            expect(segmentCrossesInterior(leg.from, leg.to, o.ring), `${b.id} leg crosses ${o.id}`).toBe(false);
          }
        });
        if (q.toDoor) {
          // arrives exactly at one of the doors the owner marked, after a short straight approach
          expect(b.doors!.some((d) => Math.hypot(d.x - route.arrival.x, d.z - route.arrival.z) < 1e-6)).toBe(true);
          expect(route.legs.at(-1)!.distance).toBeLessThan(3);
        } else {
          // ends within the walking clearance of the target's own footprint
          expect(strictlyInside(route.arrival, own.ring)).toBe(false);
        }
        expect(route.legs.reduce((s, l) => s + l.distance, 0)).toBeCloseTo(route.length, 6);
      }
    });
  }

  it("routes end at the owner-marked doors (all numbered buildings except 2 and 11, which have no mark)", () => {
    const withDoors = buildings.filter((b) => b.doors?.length).map((b) => b.number);
    expect(withDoors.sort((a, b) => a! - b!)).toEqual([1, 3, 4, 5, 6, 7, 8, 9, 10, 14]);
    expect(campus.buildings.find((b) => b.number === 4)!.doors).toHaveLength(2);
    expect(campus.buildings.find((b) => b.number === 7)!.doors).toHaveLength(2);
    for (const b of buildings) {
      const q = routeFromEntrance(campus, "campus-entrance-1", b.id!);
      if (q.status !== "ok") throw new Error(q.status);
      expect(q.toDoor).toBe(!!b.doors?.length);
    }
  });

  it("picks the nearer door when a building has two", () => {
    const b4 = campus.buildings.find((b) => b.number === 4)!;
    const q = routeFromEntrance(campus, "campus-entrance-1", b4.id!);
    if (q.status !== "ok") throw new Error(q.status);
    const alt = b4.doors!.filter((d) => Math.hypot(d.x - q.route.arrival.x, d.z - q.route.arrival.z) > 1e-6);
    expect(alt).toHaveLength(1);
  });

  it("never routes through land outside the property line (north-east notch)", () => {
    const b6 = campus.buildings.find((b) => b.number === 6)!;
    const q = routeFromEntrance(campus, "campus-entrance-1", b6.id!);
    if (q.status !== "ok") throw new Error(q.status);
    for (const p of q.route.points)
      for (const o of obstacles.filter((x) => x.id.startsWith("outside"))) expect(strictlyInside(p, o.ring)).toBe(false);
    for (const leg of q.route.legs) {
      for (const o of obstacles.filter((x) => x.id.startsWith("outside")))
        expect(segmentCrossesInterior(leg.from, leg.to, o.ring)).toBe(false);
    }
  });

  it("the single entrance is the start for every building, and nearestEntrance returns it", () => {
    for (const b of buildings) expect(nearestEntrance(campus, b.id!)?.entranceId).toBe("campus-entrance-1");
  });

  it("writes Persian steps: start at the entrance, no sub-4 m legs, ends with the arrival", () => {
    for (const b of buildings) {
      const q = routeFromEntrance(campus, "campus-entrance-1", b.id!);
      if (q.status !== "ok") throw new Error(q.status);
      const steps = describeCampusRoute(campus, q);
      expect(steps[0]).toMatchObject({ kind: "start", text: "شروع از درب ورود دانشگاه" });
      expect(steps.at(-1)).toMatchObject({ kind: "arrive" });
      expect(steps.at(-1)!.text).toContain(b.label);
      expect(steps.length).toBeGreaterThanOrEqual(3);
      for (const s of steps.filter((x) => x.kind === "walk")) expect(s.text).toMatch(/حدود [۰-۹]+ متر/);
      expect(steps.filter((x) => x.kind === "walk").every((s) => !/حدود [۱-۳] متر/.test(s.text))).toBe(true);
    }
  });

  it("formats time and failures in Persian and rejects unknown ids", () => {
    expect(formatWalkTime(130)).toBe("حدود ۲ دقیقه پیاده");
    expect(formatWalkTime(5)).toBe("حدود ۱ دقیقه پیاده");
    expect(routeFromEntrance(campus, "nope", "campus-b4").status).toBe("unknown-entrance");
    expect(routeFromEntrance(campus, "campus-entrance-1", "nope").status).toBe("unknown-building");
    expect(routeFailureText("no-route")).toContain("مسیر");
  });
});
