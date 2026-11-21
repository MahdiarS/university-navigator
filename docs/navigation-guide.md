# Navigation guide

The engine lives in `src/lib/navigation/` and is independent of React, Three.js and the data source. It works on any objects matching `GraphNode` / `GraphEdge` (`types.ts`). It is covered by `tests/navigation/pathfinding.test.ts`.

## Graph model

Coordinates use the shared convention (meters; X east, Y up, Z south). See `docs/3d-model-guide.md`.

**Node** — `id`, `buildingId`, `floorId`, `x`, `y`, `z`, `type`, optional `label`.

| `type` | Use |
| --- | --- |
| `entrance` | building entrance (ground floor) |
| `corridor` | point along a corridor |
| `junction` | corridor junction / branching point |
| `room-door` | the door of a room; referenced by `rooms.door_node_id` |
| `stair` | stair landing on a floor |
| `elevator` | elevator stop on a floor |

**Edge** — `id`, `fromNode`, `toNode`, `distance` (walking cost in meters), `edgeType`, `accessible`, `bidirectional`.

| `edgeType` | Use |
| --- | --- |
| `corridor` | walking along a corridor / open space |
| `door` | passing through a door |
| `stairs` | vertical connection between floors by stairs |
| `elevator` | vertical connection between floors by elevator |

Edges are added in both directions when `bidirectional` is true; one-way edges only `from → to`.

The demo graph (`data/demo/navigation-nodes.json`, `navigation-edges.json`) has 49 nodes and 50 edges: corridor junctions per floor, a door node per room, an entrance on the ground floor, a stair node and an elevator node per floor, and stair/elevator edges between consecutive floors. Its stair edges are `accessible: false`; its elevator edges are `accessible: true`. These values are demo data, not verified facts about any real building.

## Pathfinding

`findPath` (`pathfinding.ts`) is A\* by default, with a binary min-heap (`heap.ts`) and lazy deletion of stale entries.

- `g(n)` = accumulated edge `distance` (edges are weighted, not unit cost).
- `h(n)` = `heuristicScale × straight-line 3D distance` from `n` to the goal. Y is included, so vertical travel is accounted for.
- **Admissibility**: the straight line must never exceed the true cost. This holds when every edge's `distance` is ≥ the Euclidean distance between its nodes. `buildGraph` computes `heuristicScale = min(1, min over edges of distance / straightLine)`, so even a hand-edited, too-short edge cannot make A\* return a non-optimal route (it just expands more nodes). `validateGraph` reports such an edge as a `short-edge` warning.
- `algorithm: "dijkstra"` uses `h = 0` as a comparison/fallback; the tests check that costs agree and that A\* expands no more nodes.

## Routes

`computeRoute(graph, startId, goalId, { accessibleOnly?, algorithm? })` (`route.ts`) returns either a success object or a failure with an explicit status:

| `status` | Meaning |
| --- | --- |
| `ok` | route found |
| `unknown-start` / `unknown-goal` | node id not in the graph |
| `same-location` | start equals goal |
| `no-route` | the nodes are not connected |
| `no-accessible-route` | connected, but only through stairs or connections not marked accessible |

A success contains `nodes`, `traversals`, `totalDistance`, per-floor `segments`, vertical `transfers` (stairs/elevator, up/down), `floorIds`, `stepFree` and `expanded` (nodes expanded by the search). Vertical edges split the route into per-floor segments, which is what the 3D layer draws; nothing is drawn straight through walls or between disconnected floors.

Supported cases: same-floor, multi-floor, from the entrance, step-free, no route, and recomputation when the destination changes (the graph is immutable, so a new call gives a new, independent result).

## Accessible (step-free) routing

With `accessibleOnly: true`, an edge is skipped if it is a `stairs` edge **or** its `accessible` flag is not `true`. The engine never assumes accessibility: `stepFree` on a result is true only if every walked edge has `accessible === true` and is not a stairs edge, and each transfer reports `accessible` the same way. If no such path exists the status is `no-accessible-route` and the UI explains it. Mark an edge `accessible: true` only after it has been verified as step-free (no steps, adequate width, working lift, etc.).

## Directions

`buildDirections` (`directions.ts`) converts a route into structured steps (`start`, `walk`, `transfer`, `arrive`); `directions-fa.ts` renders Persian text. Turns are computed from heading changes in plan view: with +X to the right and +Z towards the bottom, a positive `h1.x*h2.z − h1.z*h2.x` is a right turn (north then east = right). Angles below 35° count as straight and above 150° as a U-turn. After stairs/lift the orientation is unknown, so no turn is announced for the next leg.

## Authoring nodes and edges

1. Place nodes in the shared coordinate system. Every node on a floor has `y = floor.elevation`.
2. Add a `room-door` node for each room, at the door opening, and set `rooms.door_node_id` to it. Connect it to the nearest corridor node with a `door` (or `corridor`) edge.
3. Put `corridor`/`junction` nodes along the corridor centre line at each door position and each turn; connect consecutive nodes with `corridor` edges.
4. Add one `entrance` node at the main entrance (also referenced by `entrances.node_id`).
5. For each stair/lift per floor add a `stair`/`elevator` node, connect it to the corridor, and connect it to the same node on the adjacent floor with a `stairs`/`elevator` edge. Use a realistic travel distance (≥ the straight-line height difference).
6. Set `distance` to the real walking length in meters (≥ the straight line between the two nodes). Mark `accessible` only for verified step-free connections. Use `bidirectional: false` only for genuinely one-way connections.
7. Edge ids must be unique (demo ids look like `e-f00-corr-0--f00-corr-1`); node ids follow `idSchema`.

You can edit nodes/edges in `data/demo/*.json` (demo mode) or in the `/admin` panel (tables `navigation_nodes` / `navigation_edges`; the node's `buildingId` is derived from its floor). The demo files are produced by `node scripts/generate-demo-data.mjs`; if you re-run it, it overwrites `data/demo/*.json` and `database/seed.sql`.

## Validation

`validateGraph(nodes, edges)` returns issues with `level` (`error`/`warning`) and `code`:

- errors: `duplicate-node`, `duplicate-edge`, `dangling-edge` (edge references a missing node), `bad-distance` (distance ≤ 0)
- warnings: `short-edge` (distance below the straight line), `disconnected` (more than one connected component, i.e. some destinations are unreachable)

The demo graph is tested to have no integrity errors and to be fully connected. Run `validateGraph` after any bulk edit of real data. The database adds its own constraints (`distance > 0 and ≤ 10000`, `from_node_id <> to_node_id`, valid node/edge type enums).

## Limits

- The start point is chosen manually by the user; there is no GPS or indoor positioning.
- Route quality depends entirely on the graph data. Demo data is fictional.
