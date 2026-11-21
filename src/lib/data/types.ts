import type { z } from "zod";
import type {
  BuildingModelSchema,
  BuildingSchema,
  CampusSchema,
  DepartmentSchema,
  DepartmentServiceSchema,
  EntranceSchema,
  FacilitySchema,
  FloorSchema,
  ModelManifestSchema,
  NavEdgeSchema,
  NavNodeSchema,
  ProceduralLayoutSchema,
  ProceduralRoomLayoutSchema,
  RoomSchema,
} from "./schemas";

export type Building = z.infer<typeof BuildingSchema>;
export type Floor = z.infer<typeof FloorSchema>;
export type Room = z.infer<typeof RoomSchema>;
export type Department = z.infer<typeof DepartmentSchema>;
export type DepartmentService = z.infer<typeof DepartmentServiceSchema>;
export type Entrance = z.infer<typeof EntranceSchema>;
export type Facility = z.infer<typeof FacilitySchema>;
export type NavNode = z.infer<typeof NavNodeSchema>;
export type NavEdge = z.infer<typeof NavEdgeSchema>;
export type ModelManifest = z.infer<typeof ModelManifestSchema>;
export type BuildingModel = z.infer<typeof BuildingModelSchema>;
export type ProceduralLayout = z.infer<typeof ProceduralLayoutSchema>;
export type ProceduralRoomLayout = z.infer<typeof ProceduralRoomLayoutSchema>;
export type Campus = z.infer<typeof CampusSchema>;

export type DataSourceKind = "demo" | "supabase";

/** Everything the public UI needs, loaded once per request on the server and passed to client components. */
export interface NavigatorData {
  source: DataSourceKind;
  buildings: Building[];
  floors: Floor[];
  rooms: Room[];
  departments: Department[];
  services: DepartmentService[];
  entrances: Entrance[];
  facilities: Facility[];
  nodes: NavNode[];
  edges: NavEdge[];
  manifest: ModelManifest;
}

export type ResourceKey =
  | "buildings"
  | "floors"
  | "rooms"
  | "departments"
  | "services"
  | "entrances"
  | "nodes"
  | "edges";
