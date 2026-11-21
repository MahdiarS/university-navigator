import { findPath } from "./pathfinding";
import type {
  Algorithm,
  NavGraph,
  RouteOptions,
  RouteResult,
  RouteSegment,
  RouteSuccess,
  RouteTransfer,
  Traversal,
} from "./types";

/**
 * Compute a route between two graph nodes.
 *
 * Failure statuses are explicit so the UI can show a precise message:
 *  - "unknown-start" / "unknown-goal": id not in the graph
 *  - "same-location": start and goal are the same node
 *  - "no-route": nodes are not connected
 *  - "no-accessible-route": connected, but only through stairs or connections not marked accessible
 *
 * `stepFree` on a success is derived ONLY from the edges actually walked (edge.accessible === true and
 * no stair edge). The engine never assumes accessibility.
 */
export function computeRoute(
  graph: NavGraph,
  startId: string,
  goalId: string,
  options: RouteOptions = {},
): RouteResult {
  const accessibleOnly = options.accessibleOnly ?? false;
  const algorithm: Algorithm = options.algorithm ?? "astar";
  const fail = (status: Exclude<RouteResult["status"], "ok">): RouteResult => ({
    status,
    startId,
    goalId,
    accessibleOnly,
  });

  if (!graph.nodes.has(startId)) return fail("unknown-start");
  if (!graph.nodes.has(goalId)) return fail("unknown-goal");
  if (startId === goalId) return fail("same-location");

  const path = findPath(graph, startId, goalId, { algorithm, accessibleOnly });
  if (!path.found) {
    if (accessibleOnly && findPath(graph, startId, goalId, { algorithm }).found) return fail("no-accessible-route");
    return fail("no-route");
  }
  return toSuccess(graph, path.nodeIds, path.traversals, path.cost, path.expanded, {
    startId,
    goalId,
    algorithm,
    accessibleOnly,
  });
}

function toSuccess(
  graph: NavGraph,
  nodeIds: string[],
  traversals: Traversal[],
  totalDistance: number,
  expanded: number,
  meta: { startId: string; goalId: string; algorithm: Algorithm; accessibleOnly: boolean },
): RouteSuccess {
  const nodes = nodeIds.map((id) => graph.nodes.get(id)!);

  // Split into per-floor segments. A vertical traversal ends one segment and begins the next.
  const segments: RouteSegment[] = [];
  const transfers: RouteTransfer[] = [];
  let current: RouteSegment = { floorId: nodes[0]!.floorId, nodeIds: [nodes[0]!.id] };
  for (const t of traversals) {
    const to = graph.nodes.get(t.to)!;
    const from = graph.nodes.get(t.from)!;
    const vertical = t.edge.edgeType === "stairs" || t.edge.edgeType === "elevator";
    if (vertical && to.floorId !== from.floorId) {
      segments.push(current);
      transfers.push({
        via: t.edge.edgeType === "stairs" ? "stairs" : "elevator",
        fromNodeId: from.id,
        toNodeId: to.id,
        fromFloorId: from.floorId,
        toFloorId: to.floorId,
        direction: to.y > from.y ? "up" : "down",
        accessible: t.edge.accessible && t.edge.edgeType !== "stairs",
      });
      current = { floorId: to.floorId, nodeIds: [to.id] };
    } else {
      current.nodeIds.push(to.id);
    }
  }
  segments.push(current);

  const floorIds = segments.map((s) => s.floorId).filter((f, i, a) => i === 0 || f !== a[i - 1]);
  const stepFree = traversals.every((t) => t.edge.accessible === true && t.edge.edgeType !== "stairs");

  return {
    status: "ok",
    ...meta,
    nodeIds,
    nodes,
    traversals,
    totalDistance,
    floorIds,
    segments,
    transfers,
    stepFree,
    expanded,
  };
}
