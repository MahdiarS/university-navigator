import { euclidean } from "./graph";
import { MinHeap } from "./heap";
import type { Algorithm, NavGraph, PathResult, Traversal } from "./types";

export interface PathOptions {
  algorithm?: Algorithm;
  /** Skip stair edges and every edge not explicitly marked accessible. */
  accessibleOnly?: boolean;
}

/**
 * Shortest path by edge weight.
 *
 * A* (default): f(n) = g(n) + h(n), where
 *   g = accumulated edge `distance` (meters), and
 *   h = scale * straight-line 3D distance (meters) from n to the goal.
 * The straight line never exceeds the true walking cost (every edge distance >= straight line, enforced
 * through `graph.heuristicScale`), so h is admissible and the route is optimal. Because Y is part of the
 * distance, the heuristic correctly accounts for vertical travel between floors.
 *
 * Dijkstra is the same loop with h = 0 and is kept for comparison / as a fallback.
 */
export function findPath(graph: NavGraph, startId: string, goalId: string, options: PathOptions = {}): PathResult {
  const { algorithm = "astar", accessibleOnly = false } = options;
  const start = graph.nodes.get(startId);
  const goal = graph.nodes.get(goalId);
  const notFound: PathResult = { found: false, nodeIds: [], traversals: [], cost: Infinity, expanded: 0 };
  if (!start || !goal) return notFound;

  const h = (id: string): number => {
    if (algorithm === "dijkstra") return 0;
    return graph.heuristicScale * euclidean(graph.nodes.get(id)!, goal);
  };

  const gScore = new Map<string, number>([[startId, 0]]);
  const cameFrom = new Map<string, Traversal>();
  const closed = new Set<string>();
  const open = new MinHeap<string>();
  open.push(startId, h(startId));
  let expanded = 0;

  while (open.size > 0) {
    const current = open.pop()!.value;
    if (closed.has(current)) continue; // stale heap entry (lazy deletion)
    closed.add(current);
    expanded++;

    if (current === goalId) {
      const traversals: Traversal[] = [];
      const nodeIds: string[] = [goalId];
      let cursor = goalId;
      while (cursor !== startId) {
        const step = cameFrom.get(cursor)!;
        traversals.push(step);
        nodeIds.push(step.from);
        cursor = step.from;
      }
      traversals.reverse();
      nodeIds.reverse();
      return { found: true, nodeIds, traversals, cost: gScore.get(goalId)!, expanded };
    }

    const gCurrent = gScore.get(current)!;
    for (const nb of graph.adjacency.get(current) ?? []) {
      if (closed.has(nb.to)) continue;
      if (accessibleOnly && (!nb.edge.accessible || nb.edge.edgeType === "stairs")) continue;
      const tentative = gCurrent + nb.edge.distance;
      if (tentative < (gScore.get(nb.to) ?? Infinity)) {
        gScore.set(nb.to, tentative);
        cameFrom.set(nb.to, { edge: nb.edge, from: current, to: nb.to });
        open.push(nb.to, tentative + h(nb.to));
      }
    }
  }
  return { ...notFound, expanded };
}
