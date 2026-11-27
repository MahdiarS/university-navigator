/**
 * Navigation engine types. The engine is deliberately independent of React, Three.js and
 * the data layer: any object structurally matching these interfaces can be routed.
 *
 * Coordinate convention (meters): X = horizontal axis one (east +), Y = elevation (up +),
 * Z = horizontal axis two (south +; -Z is "north" in plan view).
 */
export type NodeType = "entrance" | "corridor" | "junction" | "room-door" | "stair" | "elevator";
export type EdgeType = "corridor" | "door" | "stairs" | "elevator" | "bridge";

export interface GraphNode {
  id: string;
  buildingId: string;
  floorId: string;
  x: number;
  y: number;
  z: number;
  type: NodeType;
  label?: string | null;
}

export interface GraphEdge {
  id: string;
  fromNode: string;
  toNode: string;
  /** Walking cost in meters. Must be >= straight-line distance for the A* heuristic to be admissible. */
  distance: number;
  edgeType: EdgeType;
  /** true ONLY when the data explicitly states the connection is step-free. */
  accessible: boolean;
  bidirectional: boolean;
}

export interface Neighbor {
  edge: GraphEdge;
  /** Node reached by following this edge. */
  to: string;
  /** true when the edge is traversed from toNode to fromNode. */
  reversed: boolean;
}

export interface NavGraph {
  nodes: ReadonlyMap<string, GraphNode>;
  adjacency: ReadonlyMap<string, readonly Neighbor[]>;
  /**
   * Scale applied to the Euclidean heuristic. It is min(1, min over edges of distance / straightLine),
   * which keeps A* admissible even if hand-edited data contains an edge shorter than the straight line.
   */
  heuristicScale: number;
}

export type Algorithm = "astar" | "dijkstra";

export interface RouteOptions {
  /** Exclude stair edges and any edge not explicitly marked accessible. */
  accessibleOnly?: boolean;
  algorithm?: Algorithm;
}

/** One edge as actually walked (direction matters for bidirectional edges). */
export interface Traversal {
  edge: GraphEdge;
  from: string;
  to: string;
}

export interface PathResult {
  found: boolean;
  nodeIds: string[];
  traversals: Traversal[];
  cost: number;
  /** nodes popped from the open set: used to compare A* with Dijkstra. */
  expanded: number;
}

export interface RouteSegment {
  floorId: string;
  nodeIds: string[];
}

export interface RouteTransfer {
  via: "stairs" | "elevator";
  fromNodeId: string;
  toNodeId: string;
  fromFloorId: string;
  toFloorId: string;
  direction: "up" | "down";
  accessible: boolean;
}

export interface RouteSuccess {
  status: "ok";
  startId: string;
  goalId: string;
  algorithm: Algorithm;
  accessibleOnly: boolean;
  nodeIds: string[];
  nodes: GraphNode[];
  traversals: Traversal[];
  totalDistance: number;
  /** Floors in the order they are visited (no repeats of consecutive floors). */
  floorIds: string[];
  /** Consecutive path pieces on one floor. Vertical transfers separate segments. */
  segments: RouteSegment[];
  transfers: RouteTransfer[];
  /** true only if every walked edge is explicitly marked accessible in the data. */
  stepFree: boolean;
  expanded: number;
}

export type RouteFailureStatus =
  | "unknown-start"
  | "unknown-goal"
  | "same-location"
  | "no-route"
  /** A route exists, but only through connections not marked accessible. */
  | "no-accessible-route";

export interface RouteFailure {
  status: RouteFailureStatus;
  startId: string;
  goalId: string;
  accessibleOnly: boolean;
}

export type RouteResult = RouteSuccess | RouteFailure;

export type Turn = "left" | "right" | "u-turn";

export type DirectionStep =
  | { kind: "start"; nodeId: string; floorId: string }
  | {
      kind: "walk";
      floorId: string;
      distance: number;
      /** Turn to make BEFORE walking; null for straight / first leg / after a transfer. */
      turn: Turn | null;
      fromNodeId: string;
      toNodeId: string;
    }
  | {
      kind: "transfer";
      via: "stairs" | "elevator";
      direction: "up" | "down";
      fromFloorId: string;
      toFloorId: string;
      fromNodeId: string;
      toNodeId: string;
      accessible: boolean;
    }
  | {
      /** crossing an enclosed sky bridge between two buildings */
      kind: "bridge";
      floorId: string;
      distance: number;
      fromNodeId: string;
      toNodeId: string;
    }
  | { kind: "arrive"; nodeId: string; floorId: string };
