import type { GraphEdge, GraphNode, NavGraph, Neighbor } from "./types";

export const euclidean = (a: Pick<GraphNode, "x" | "y" | "z">, b: Pick<GraphNode, "x" | "y" | "z">): number =>
  Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);

/**
 * Build the walkable graph.
 * - bidirectional edges are added in both directions; one-way edges only from -> to.
 * - edges referencing unknown nodes are ignored here (validateGraph reports them).
 */
export function buildGraph(nodes: readonly GraphNode[], edges: readonly GraphEdge[]): NavGraph {
  const nodeMap = new Map<string, GraphNode>();
  for (const n of nodes) nodeMap.set(n.id, n);

  const adjacency = new Map<string, Neighbor[]>();
  for (const n of nodes) adjacency.set(n.id, []);

  let scale = 1;
  for (const e of edges) {
    const a = nodeMap.get(e.fromNode);
    const b = nodeMap.get(e.toNode);
    if (!a || !b) continue;
    adjacency.get(a.id)!.push({ edge: e, to: b.id, reversed: false });
    if (e.bidirectional) adjacency.get(b.id)!.push({ edge: e, to: a.id, reversed: true });
    const straight = euclidean(a, b);
    if (straight > 0 && e.distance > 0) scale = Math.min(scale, e.distance / straight);
  }
  return { nodes: nodeMap, adjacency, heuristicScale: scale };
}

export interface GraphIssue {
  level: "error" | "warning";
  code:
    | "duplicate-node"
    | "duplicate-edge"
    | "dangling-edge"
    | "bad-distance"
    | "short-edge"
    | "disconnected";
  message: string;
  ref?: string;
}

/** Integrity checks for hand-edited navigation data (used by tests and the admin panel). */
export function validateGraph(nodes: readonly GraphNode[], edges: readonly GraphEdge[]): GraphIssue[] {
  const issues: GraphIssue[] = [];
  const nodeMap = new Map<string, GraphNode>();
  for (const n of nodes) {
    if (nodeMap.has(n.id)) issues.push({ level: "error", code: "duplicate-node", message: `Duplicate node ${n.id}`, ref: n.id });
    nodeMap.set(n.id, n);
  }
  const edgeIds = new Set<string>();
  for (const e of edges) {
    if (edgeIds.has(e.id)) issues.push({ level: "error", code: "duplicate-edge", message: `Duplicate edge ${e.id}`, ref: e.id });
    edgeIds.add(e.id);
    const a = nodeMap.get(e.fromNode);
    const b = nodeMap.get(e.toNode);
    if (!a || !b) {
      issues.push({ level: "error", code: "dangling-edge", message: `Edge ${e.id} references a missing node`, ref: e.id });
      continue;
    }
    if (!(e.distance > 0)) {
      issues.push({ level: "error", code: "bad-distance", message: `Edge ${e.id} has non-positive distance`, ref: e.id });
    } else if (e.distance + 1e-6 < euclidean(a, b)) {
      issues.push({
        level: "warning",
        code: "short-edge",
        message: `Edge ${e.id} is shorter than the straight line between its nodes (A* heuristic is scaled down)`,
        ref: e.id,
      });
    }
  }

  // Connectivity (treating every edge as undirected).
  const graph = buildGraph(nodes, edges.map((e) => ({ ...e, bidirectional: true })));
  const seen = new Set<string>();
  let components = 0;
  for (const n of nodes) {
    if (seen.has(n.id)) continue;
    components++;
    const stack = [n.id];
    seen.add(n.id);
    while (stack.length) {
      const id = stack.pop()!;
      for (const nb of graph.adjacency.get(id) ?? []) {
        if (!seen.has(nb.to)) {
          seen.add(nb.to);
          stack.push(nb.to);
        }
      }
    }
  }
  if (components > 1) {
    issues.push({
      level: "warning",
      code: "disconnected",
      message: `Navigation graph has ${components} disconnected parts; some destinations cannot be reached`,
    });
  }
  return issues;
}
