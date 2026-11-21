import { z } from "zod";
import buildingsJson from "@data/demo/buildings.json";
import floorsJson from "@data/demo/floors.json";
import roomsJson from "@data/demo/rooms.json";
import departmentsJson from "@data/demo/departments.json";
import servicesJson from "@data/demo/department-services.json";
import entrancesJson from "@data/demo/entrances.json";
import facilitiesJson from "@data/demo/facilities.json";
import nodesJson from "@data/demo/navigation-nodes.json";
import edgesJson from "@data/demo/navigation-edges.json";
import manifestJson from "@data/demo/model-manifest.json";
import campusLayoutJson from "@data/campus/campus-layout.json";
import {
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
  RoomSchema,
} from "./schemas";
import type { NavigatorData } from "./types";

/**
 * The model manifest with the campus site plan taken from data/campus/campus-layout.json (extracted from the
 * supplied CAD drawing by scripts/cad/build_campus.py) instead of the procedural demo campus. The indoor demo
 * building keeps its own procedural model; the two are independent.
 */
export const manifestInput: unknown = { ...manifestJson, campus: CampusSchema.parse(campusLayoutJson) };

/**
 * Local demo data source. Every record is fictional (isDemo: true) and is validated
 * with Zod so a broken edit of data/demo/*.json fails loudly at startup.
 */
export function loadDemoData(): NavigatorData {
  return {
    source: "demo",
    buildings: z.array(BuildingSchema).parse(buildingsJson),
    floors: z.array(FloorSchema).parse(floorsJson),
    rooms: z.array(RoomSchema).parse(roomsJson),
    departments: z.array(DepartmentSchema).parse(departmentsJson),
    services: z.array(DepartmentServiceSchema).parse(servicesJson),
    entrances: z.array(EntranceSchema).parse(entrancesJson),
    facilities: z.array(FacilitySchema).parse(facilitiesJson),
    nodes: z.array(NavNodeSchema).parse(nodesJson),
    edges: z.array(NavEdgeSchema).parse(edgesJson),
    manifest: ModelManifestSchema.parse(manifestInput),
  };
}
