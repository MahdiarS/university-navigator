import type { z } from "zod";
import {
  BuildingSchema,
  DepartmentSchema,
  DepartmentServiceSchema,
  EntranceSchema,
  FacilitySchema,
  FloorSchema,
  NavEdgeSchema,
  NavNodeSchema,
  RoomSchema,
} from "./schemas";
import type { ResourceKey } from "./types";

/**
 * Single registry describing how each domain record maps to a Supabase table.
 * Used by the Supabase repository (reads) and the admin server actions (writes),
 * so the camelCase <-> snake_case translation lives in exactly one place.
 */
export interface ResourceDef {
  key: ResourceKey | "facilities";
  table: string;
  /** Persian label for the admin UI. */
  label: string;
  schema: z.ZodType<Record<string, unknown>>;
  /** domain key -> column name */
  columns: Record<string, string>;
}

const common = { isDemo: "is_demo" };

export const RESOURCES: Record<ResourceKey | "facilities", ResourceDef> = {
  buildings: {
    key: "buildings",
    table: "buildings",
    label: "ساختمان‌ها",
    schema: BuildingSchema as unknown as ResourceDef["schema"],
    columns: {
      id: "id", name: "name", slug: "slug", description: "description",
      modelUrl: "model_url", isActive: "is_active", ...common,
    },
  },
  floors: {
    key: "floors",
    table: "floors",
    label: "طبقات",
    schema: FloorSchema as unknown as ResourceDef["schema"],
    columns: {
      id: "id", buildingId: "building_id", floorNumber: "floor_number", displayName: "display_name",
      elevation: "elevation", modelUrl: "model_url", ...common,
    },
  },
  rooms: {
    key: "rooms",
    table: "rooms",
    label: "اتاق‌ها",
    schema: RoomSchema as unknown as ResourceDef["schema"],
    columns: {
      id: "id", floorId: "floor_id", roomNumber: "room_number", name: "name", roomType: "room_type",
      modelObjectId: "model_object_id", positionX: "position_x", positionY: "position_y",
      positionZ: "position_z", doorNodeId: "door_node_id", ...common,
    },
  },
  departments: {
    key: "departments",
    table: "departments",
    label: "واحدها",
    schema: DepartmentSchema as unknown as ResourceDef["schema"],
    columns: {
      id: "id", roomId: "room_id", name: "name", slug: "slug", description: "description",
      phone: "phone", workingHours: "working_hours", keywords: "keywords", isActive: "is_active", ...common,
    },
  },
  services: {
    key: "services",
    table: "department_services",
    label: "خدمات",
    schema: DepartmentServiceSchema as unknown as ResourceDef["schema"],
    columns: {
      id: "id", departmentId: "department_id", serviceName: "service_name", keywords: "keywords", ...common,
    },
  },
  entrances: {
    key: "entrances",
    table: "entrances",
    label: "ورودی‌ها",
    schema: EntranceSchema as unknown as ResourceDef["schema"],
    columns: {
      id: "id", buildingId: "building_id", floorId: "floor_id", name: "name", positionX: "position_x",
      positionY: "position_y", positionZ: "position_z", nodeId: "node_id", ...common,
    },
  },
  facilities: {
    key: "facilities",
    table: "facilities",
    label: "امکانات",
    schema: FacilitySchema as unknown as ResourceDef["schema"],
    columns: {
      id: "id", floorId: "floor_id", facilityType: "facility_type", name: "name", positionX: "position_x",
      positionY: "position_y", positionZ: "position_z", ...common,
    },
  },
  nodes: {
    key: "nodes",
    table: "navigation_nodes",
    label: "گره‌های مسیریابی",
    schema: NavNodeSchema as unknown as ResourceDef["schema"],
    // buildingId has no column: it is derived from the floor.
    columns: {
      id: "id", floorId: "floor_id", x: "position_x", y: "position_y", z: "position_z",
      type: "node_type", label: "label", ...common,
    },
  },
  edges: {
    key: "edges",
    table: "navigation_edges",
    label: "یال‌های مسیریابی",
    schema: NavEdgeSchema as unknown as ResourceDef["schema"],
    columns: {
      id: "id", fromNode: "from_node_id", toNode: "to_node_id", distance: "distance",
      edgeType: "edge_type", accessible: "accessible", bidirectional: "bidirectional", ...common,
    },
  },
};

/** Resources that staff can manage through the admin panel. */
export const ADMIN_RESOURCE_KEYS: ResourceKey[] = [
  "departments",
  "services",
  "rooms",
  "floors",
  "buildings",
  "entrances",
  "nodes",
  "edges",
];

export function isResourceKey(value: string): value is ResourceKey {
  return (ADMIN_RESOURCE_KEYS as string[]).includes(value);
}

/** domain object -> DB row. Keys without a column (e.g. node.buildingId) are dropped. */
export function toRow(def: ResourceDef, value: Record<string, unknown>): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  for (const [key, column] of Object.entries(def.columns)) {
    if (key in value) row[column] = value[key];
  }
  return row;
}

/** DB row -> domain object. Null arrays become [] (keywords). */
export function fromRow(def: ResourceDef, row: Record<string, unknown>): Record<string, unknown> {
  const value: Record<string, unknown> = {};
  for (const [key, column] of Object.entries(def.columns)) {
    const raw = row[column];
    value[key] = key === "keywords" && raw == null ? [] : raw;
  }
  return value;
}
