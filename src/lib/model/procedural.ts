import type { BuildingModel, Floor, ProceduralLayout, Room } from "@/lib/data/types";

/**
 * Procedural demo building: pure geometry DESCRIPTORS (boxes) computed from the model manifest.
 * React Three Fiber components turn these into meshes. Keeping this layer free of Three.js makes the
 * "procedural model loads" behaviour unit-testable without a GPU.
 *
 * Coordinates are the shared building coordinates (meters; X east, Y up, Z south), i.e. exactly the same
 * space as room positions and navigation nodes. Every Y already includes the floor elevation; the
 * exploded-view offset is applied later by moving the whole floor group.
 */
export interface BoxSpec {
  /** centre */
  x: number;
  y: number;
  z: number;
  /** size */
  w: number;
  h: number;
  d: number;
}

export interface RoomTile {
  roomId: string;
  /** stable id of the 3D object, mapped to the room record (matches GLB mesh names) */
  objectId: string;
  box: BoxSpec;
  /** where a label / marker for this room is anchored */
  anchor: [number, number, number];
}

export interface FloorGeometry {
  floorId: string;
  floorNumber: number;
  elevation: number;
  slab: BoxSpec;
  walls: BoxSpec[];
  corridorTiles: BoxSpec[];
  rooms: RoomTile[];
  doors: BoxSpec[];
  /** stair steps that rise from this floor towards the next one (empty on the top floor) */
  steps: BoxSpec[];
  elevator: { shaft: BoxSpec; car: BoxSpec } | null;
  entrance: { x: number; y: number; z: number; width: number } | null;
}

export const ROOM_TILE_HEIGHT = 0.08;
const CORRIDOR_TILE_HEIGHT = 0.04;
const EPS = 0.001;

interface Opening {
  at: number;
  width: number;
}

/** Axis-aligned wall from (a) to (b) with gaps for doors. Returns solid boxes between the openings. */
function wallWithOpenings(
  axis: "x" | "z",
  fixed: number,
  from: number,
  to: number,
  openings: Opening[],
  baseY: number,
  height: number,
  thickness: number,
): BoxSpec[] {
  const gaps = [...openings].sort((a, b) => a.at - b.at);
  const boxes: BoxSpec[] = [];
  let cursor = from;
  const push = (s: number, e: number) => {
    if (e - s < EPS) return;
    const mid = (s + e) / 2;
    const len = e - s;
    boxes.push(
      axis === "x"
        ? { x: mid, y: baseY + height / 2, z: fixed, w: len, h: height, d: thickness }
        : { x: fixed, y: baseY + height / 2, z: mid, w: thickness, h: height, d: len },
    );
  };
  for (const g of gaps) {
    push(cursor, g.at - g.width / 2);
    cursor = g.at + g.width / 2;
  }
  push(cursor, to);
  return boxes;
}

function buildWalls(p: ProceduralLayout, roomRects: Room[], floorNumber: number, baseY: number): BoxSpec[] {
  const { footprint: fp, corridor, wallHeight: h, wallThickness: t, doorWidth } = p;
  const walls: BoxSpec[] = [];
  const doorsNorth = roomRects.filter((r) => p.rooms[r.id]?.doorSide === "north").map((r) => p.rooms[r.id]!.doorX);
  const doorsSouth = roomRects.filter((r) => p.rooms[r.id]?.doorSide === "south").map((r) => p.rooms[r.id]!.doorX);

  // Perimeter. The main entrance gap only exists on the ground floor.
  const entranceGap: Opening[] = floorNumber === 0 ? [{ at: p.mainEntrance.x, width: p.mainEntrance.width }] : [];
  walls.push(...wallWithOpenings("x", fp.minZ, fp.minX, fp.maxX, [], baseY, h, t));
  walls.push(...wallWithOpenings("x", fp.maxZ, fp.minX, fp.maxX, entranceGap, baseY, h, t));
  walls.push(...wallWithOpenings("z", fp.minX, fp.minZ, fp.maxZ, [], baseY, h, t));
  walls.push(...wallWithOpenings("z", fp.maxX, fp.minZ, fp.maxZ, [], baseY, h, t));

  // Corridor walls with door openings (the stair core and elevator shaft doors are at the west end).
  const stairDoor: Opening = { at: p.stairNode.x, width: doorWidth };
  const elevDoor: Opening = { at: p.elevatorNode.x, width: doorWidth };
  walls.push(
    ...wallWithOpenings("x", corridor.minZ, fp.minX, fp.maxX,
      [stairDoor, ...doorsNorth.map((at) => ({ at, width: doorWidth }))], baseY, h, t),
  );
  walls.push(
    ...wallWithOpenings("x", corridor.maxZ, fp.minX, fp.maxX,
      [elevDoor, ...doorsSouth.map((at) => ({ at, width: doorWidth }))], baseY, h, t),
  );

  // Partitions between rooms: every distinct room edge strictly inside the footprint.
  const partitionsNorth = new Set<number>();
  const partitionsSouth = new Set<number>();
  for (const r of roomRects) {
    const box = p.rooms[r.id];
    if (!box) continue;
    const set = box.doorSide === "north" ? partitionsNorth : partitionsSouth;
    for (const x of [box.minX, box.maxX]) if (x > fp.minX + EPS && x < fp.maxX - EPS) set.add(x);
  }
  for (const x of partitionsNorth) walls.push(...wallWithOpenings("z", x, fp.minZ, corridor.minZ, [], baseY, h, t));
  for (const x of partitionsSouth) walls.push(...wallWithOpenings("z", x, corridor.maxZ, fp.maxZ, [], baseY, h, t));

  // Elevator shaft sides (north side is the corridor wall).
  const sh = p.elevatorShaft;
  walls.push(...wallWithOpenings("z", sh.minX, sh.minZ, sh.maxZ, [], baseY, h, t));
  walls.push(...wallWithOpenings("z", sh.maxX, sh.minZ, sh.maxZ, [], baseY, h, t));
  walls.push(...wallWithOpenings("x", sh.maxZ, sh.minX, sh.maxX, [], baseY, h, t));
  return walls;
}

/**
 * Switchback staircase inside the stair core: flight A climbs the west lane towards the back wall,
 * flight B climbs the east lane back towards the door. 12 steps per flight, each flight rises half the
 * floor-to-floor height, so the second flight lands exactly on the next floor.
 */
function buildStairSteps(p: ProceduralLayout, baseY: number, rise: number): BoxSpec[] {
  const core = p.stairCore;
  const stepsPerFlight = 12;
  const flightRise = rise / 2;
  const stepRise = flightRise / stepsPerFlight;
  const laneW = 1.8;
  const run = 0.55;
  const zStart = core.maxZ - 1.8; // first step just inside the door side
  const laneAX = core.minX + 0.5 + laneW / 2;
  const laneBX = core.maxX - 0.5 - laneW / 2;
  const boxes: BoxSpec[] = [];
  const zFar = zStart - stepsPerFlight * run;

  for (let i = 0; i < stepsPerFlight; i++) {
    const topA = baseY + (i + 1) * stepRise;
    boxes.push({ x: laneAX, y: baseY + (topA - baseY) / 2, z: zStart - run * (i + 0.5), w: laneW, h: topA - baseY, d: run });
  }
  // landing at half height
  const landingTop = baseY + flightRise;
  boxes.push({
    x: (core.minX + core.maxX) / 2,
    y: baseY + (landingTop - baseY) / 2,
    z: zFar - 0.5,
    w: core.maxX - core.minX - 1,
    h: landingTop - baseY,
    d: 1,
  });
  for (let i = 0; i < stepsPerFlight; i++) {
    const top = landingTop + (i + 1) * stepRise;
    boxes.push({ x: laneBX, y: baseY + (top - baseY) / 2, z: zFar + run * (i + 0.5), w: laneW, h: top - baseY, d: run });
  }
  return boxes;
}

/** Build the descriptors for all floors of one building. Floors are returned sorted by floor number. */
export function buildProceduralBuilding(model: BuildingModel, floors: readonly Floor[], rooms: readonly Room[]): FloorGeometry[] {
  const p = model.procedural;
  const sorted = [...floors].sort((a, b) => a.floorNumber - b.floorNumber);
  const fp = p.footprint;
  const fpW = fp.maxX - fp.minX;
  const fpD = fp.maxZ - fp.minZ;
  const cx = (fp.minX + fp.maxX) / 2;
  const cz = (fp.minZ + fp.maxZ) / 2;

  return sorted.map((floor, index) => {
    const y = floor.elevation;
    const floorRooms = rooms.filter((r) => r.floorId === floor.id && p.rooms[r.id]);
    const hasNext = index < sorted.length - 1;
    const rise = hasNext ? sorted[index + 1]!.elevation - y : p.floorHeight;

    const roomTiles: RoomTile[] = floorRooms.map((room) => {
      const box = p.rooms[room.id]!;
      return {
        roomId: room.id,
        objectId: room.modelObjectId,
        box: {
          x: (box.minX + box.maxX) / 2,
          y: y + ROOM_TILE_HEIGHT / 2,
          z: (box.minZ + box.maxZ) / 2,
          w: box.maxX - box.minX - p.wallThickness,
          h: ROOM_TILE_HEIGHT,
          d: box.maxZ - box.minZ - p.wallThickness,
        },
        anchor: [room.positionX, y + 1.2, room.positionZ],
      };
    });

    // Corridor floor + the open service area next to the elevator shaft.
    const corridorTiles: BoxSpec[] = [
      {
        x: cx, y: y + CORRIDOR_TILE_HEIGHT / 2, z: (p.corridor.minZ + p.corridor.maxZ) / 2,
        w: fpW - p.wallThickness, h: CORRIDOR_TILE_HEIGHT, d: p.corridor.maxZ - p.corridor.minZ - p.wallThickness,
      },
    ];
    // Open alcove west of the first south room (it holds the elevator shaft).
    const southMinX = Math.min(...floorRooms.filter((r) => p.rooms[r.id]!.doorSide === "south").map((r) => p.rooms[r.id]!.minX));
    const southWestW = southMinX - fp.minX;
    corridorTiles.push({
      x: fp.minX + southWestW / 2, y: y + CORRIDOR_TILE_HEIGHT / 2, z: (p.corridor.maxZ + fp.maxZ) / 2,
      w: southWestW - p.wallThickness, h: CORRIDOR_TILE_HEIGHT, d: fp.maxZ - p.corridor.maxZ - p.wallThickness,
    });
    corridorTiles.push({
      x: (p.stairCore.minX + p.stairCore.maxX) / 2, y: y + CORRIDOR_TILE_HEIGHT / 2, z: (p.stairCore.minZ + p.stairCore.maxZ) / 2,
      w: p.stairCore.maxX - p.stairCore.minX - p.wallThickness, h: CORRIDOR_TILE_HEIGHT, d: p.stairCore.maxZ - p.stairCore.minZ - p.wallThickness,
    });

    // Door thresholds: a thin coloured plate in each opening (rooms + stair + elevator).
    const doorBoxes: BoxSpec[] = floorRooms.map((room) => {
      const box = p.rooms[room.id]!;
      const z = box.doorSide === "north" ? p.corridor.minZ : p.corridor.maxZ;
      return { x: box.doorX, y: y + 0.06, z, w: p.doorWidth, h: 0.12, d: p.wallThickness + 0.1 };
    });
    doorBoxes.push(
      { x: p.stairNode.x, y: y + 0.06, z: p.corridor.minZ, w: p.doorWidth, h: 0.12, d: p.wallThickness + 0.1 },
      { x: p.elevatorNode.x, y: y + 0.06, z: p.corridor.maxZ, w: p.doorWidth, h: 0.12, d: p.wallThickness + 0.1 },
    );

    const sh = p.elevatorShaft;
    const shaftH = p.wallHeight;
    return {
      floorId: floor.id,
      floorNumber: floor.floorNumber,
      elevation: y,
      slab: { x: cx, y: y - p.slabThickness / 2, z: cz, w: fpW + p.wallThickness, h: p.slabThickness, d: fpD + p.wallThickness },
      walls: buildWalls(p, floorRooms, floor.floorNumber, y),
      corridorTiles,
      rooms: roomTiles,
      doors: doorBoxes,
      steps: hasNext ? buildStairSteps(p, y, rise) : [],
      elevator: {
        shaft: { x: (sh.minX + sh.maxX) / 2, y: y + shaftH / 2, z: (sh.minZ + sh.maxZ) / 2, w: sh.maxX - sh.minX - 0.3, h: shaftH, d: sh.maxZ - sh.minZ - 0.3 },
        car: { x: (sh.minX + sh.maxX) / 2, y: y + 1.1, z: (sh.minZ + sh.maxZ) / 2, w: 2.2, h: 2.2, d: 2.2 },
      },
      entrance: floor.floorNumber === 0 ? { x: p.mainEntrance.x, y, z: p.mainEntrance.z, width: p.mainEntrance.width } : null,
    };
  });
}

/** Overall bounds of the assembled building (no explode offset). */
export function buildingBounds(model: BuildingModel, floors: readonly Floor[]) {
  const fp = model.procedural.footprint;
  const ys = floors.map((f) => f.elevation);
  const top = Math.max(...ys) + model.procedural.wallHeight;
  const bottom = Math.min(...ys) - model.procedural.slabThickness;
  return {
    min: { x: fp.minX, y: bottom, z: fp.minZ },
    max: { x: fp.maxX, y: top, z: fp.maxZ },
  };
}
