import type {
  Building,
  Department,
  DepartmentService,
  Floor,
  NavNode,
  NavigatorData,
  Room,
} from "./types";

/** Id/slug maps derived once from NavigatorData so components never scan arrays. */
export interface Lookups {
  buildingsById: Map<string, Building>;
  buildingsBySlug: Map<string, Building>;
  floorsById: Map<string, Floor>;
  floorsByBuilding: Map<string, Floor[]>;
  roomsById: Map<string, Room>;
  roomsByFloor: Map<string, Room[]>;
  roomByDoorNode: Map<string, Room>;
  departmentsById: Map<string, Department>;
  departmentsBySlug: Map<string, Department>;
  departmentsByRoom: Map<string, Department[]>;
  servicesByDepartment: Map<string, DepartmentService[]>;
  nodesById: Map<string, NavNode>;
}

export function buildLookups(data: NavigatorData): Lookups {
  const floorsByBuilding = new Map<string, Floor[]>();
  for (const f of data.floors) {
    const list = floorsByBuilding.get(f.buildingId) ?? [];
    list.push(f);
    floorsByBuilding.set(f.buildingId, list);
  }
  for (const list of floorsByBuilding.values()) list.sort((a, b) => a.floorNumber - b.floorNumber);

  const roomsByFloor = new Map<string, Room[]>();
  const roomByDoorNode = new Map<string, Room>();
  for (const r of data.rooms) {
    const list = roomsByFloor.get(r.floorId) ?? [];
    list.push(r);
    roomsByFloor.set(r.floorId, list);
    if (r.doorNodeId) roomByDoorNode.set(r.doorNodeId, r);
  }

  const departmentsByRoom = new Map<string, Department[]>();
  for (const d of data.departments) {
    const list = departmentsByRoom.get(d.roomId) ?? [];
    list.push(d);
    departmentsByRoom.set(d.roomId, list);
  }
  const servicesByDepartment = new Map<string, DepartmentService[]>();
  for (const s of data.services) {
    const list = servicesByDepartment.get(s.departmentId) ?? [];
    list.push(s);
    servicesByDepartment.set(s.departmentId, list);
  }

  return {
    buildingsById: new Map(data.buildings.map((b) => [b.id, b])),
    buildingsBySlug: new Map(data.buildings.map((b) => [b.slug, b])),
    floorsById: new Map(data.floors.map((f) => [f.id, f])),
    floorsByBuilding,
    roomsById: new Map(data.rooms.map((r) => [r.id, r])),
    roomsByFloor,
    roomByDoorNode,
    departmentsById: new Map(data.departments.map((d) => [d.id, d])),
    departmentsBySlug: new Map(data.departments.map((d) => [d.slug, d])),
    departmentsByRoom,
    servicesByDepartment,
    nodesById: new Map(data.nodes.map((n) => [n.id, n])),
  };
}
