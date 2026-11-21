import { z } from "zod";

/**
 * Zod schemas for every record the app reads or an admin may write.
 * Domain objects use camelCase; src/lib/data/mappers.ts translates to the
 * snake_case columns of database/schema.sql.
 */

/** Stable, URL/SQL-friendly identifier (never reused, never derived from display text). */
export const idSchema = z
  .string()
  .trim()
  .min(2, "شناسه حداقل ۲ نویسه باشد")
  .max(80, "شناسه بیش از حد طولانی است")
  .regex(/^[A-Za-z0-9][A-Za-z0-9_-]*$/, "شناسه فقط شامل حروف انگلیسی، عدد، خط تیره و زیرخط باشد");

export const slugSchema = z
  .string()
  .trim()
  .min(2)
  .max(80)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "slug فقط شامل حروف کوچک انگلیسی، عدد و خط تیره باشد");

const text = (max = 200) => z.string().trim().min(1, "این فیلد الزامی است").max(max);
const optionalText = (max = 2000) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((v) => (v === undefined || v === null || v === "" ? null : v));
const meters = z.number({ error: "عدد معتبر وارد کنید" }).finite().min(-10000).max(10000);

/** Only same-origin absolute paths or https URLs may be used as model references. */
const modelUrl = z
  .string()
  .trim()
  .max(500)
  .refine((v) => v.startsWith("/") || v.startsWith("https://"), "مسیر باید با / یا https:// شروع شود")
  .refine((v) => !v.includes(".."), "مسیر نباید شامل .. باشد")
  .nullish()
  .transform((v) => (v === undefined || v === null || v === "" ? null : v));

export const ROOM_TYPES = [
  "office",
  "classroom",
  "lab",
  "meeting",
  "study",
  "library",
  "lobby",
  "restroom",
  "hall",
  "other",
] as const;
export const NODE_TYPES = ["entrance", "corridor", "junction", "room-door", "stair", "elevator"] as const;
export const EDGE_TYPES = ["corridor", "door", "stairs", "elevator"] as const;
export const FACILITY_TYPES = ["restroom", "stairs", "elevator", "info-desk", "other"] as const;

export const BuildingSchema = z.object({
  id: idSchema,
  name: text(),
  slug: slugSchema,
  description: optionalText(),
  modelUrl: modelUrl,
  isActive: z.boolean(),
  isDemo: z.boolean().default(false),
});

export const FloorSchema = z.object({
  id: idSchema,
  buildingId: idSchema,
  floorNumber: z.number().int().min(-10).max(200),
  displayName: text(60),
  /** Y of the walking surface, meters. */
  elevation: meters,
  modelUrl: modelUrl,
  isDemo: z.boolean().default(false),
});

export const RoomSchema = z.object({
  id: idSchema,
  floorId: idSchema,
  roomNumber: text(20),
  name: text(),
  roomType: z.enum(ROOM_TYPES).default("other"),
  /** Name of the mesh/object in the 3D model that represents this room. */
  modelObjectId: text(80),
  positionX: meters,
  positionY: meters,
  positionZ: meters,
  /** Navigation node (type room-door) that gives access to this room. */
  doorNodeId: idSchema.nullish().transform((v) => v ?? null),
  isDemo: z.boolean().default(false),
});

export const DepartmentSchema = z.object({
  id: idSchema,
  roomId: idSchema,
  name: text(),
  slug: slugSchema,
  description: optionalText(),
  phone: optionalText(40),
  workingHours: optionalText(200),
  keywords: z.array(z.string().trim().min(1).max(60)).max(40).default([]),
  isActive: z.boolean(),
  isDemo: z.boolean().default(false),
});

export const DepartmentServiceSchema = z.object({
  id: idSchema,
  departmentId: idSchema,
  serviceName: text(),
  keywords: z.array(z.string().trim().min(1).max(60)).max(40).default([]),
  isDemo: z.boolean().default(false),
});

export const EntranceSchema = z.object({
  id: idSchema,
  buildingId: idSchema,
  floorId: idSchema,
  name: text(),
  positionX: meters,
  positionY: meters,
  positionZ: meters,
  nodeId: idSchema.nullish().transform((v) => v ?? null),
  isDemo: z.boolean().default(false),
});

export const FacilitySchema = z.object({
  id: idSchema,
  floorId: idSchema,
  facilityType: z.enum(FACILITY_TYPES),
  name: text(),
  positionX: meters,
  positionY: meters,
  positionZ: meters,
  isDemo: z.boolean().default(false),
});

export const NavNodeSchema = z.object({
  id: idSchema,
  buildingId: idSchema,
  floorId: idSchema,
  x: meters,
  y: meters,
  z: meters,
  type: z.enum(NODE_TYPES),
  label: optionalText(120),
  isDemo: z.boolean().default(false),
});

export const NavEdgeSchema = z.object({
  id: idSchema,
  fromNode: idSchema,
  toNode: idSchema,
  distance: z.number({ error: "عدد معتبر وارد کنید" }).finite().positive("فاصله باید مثبت باشد").max(10000),
  edgeType: z.enum(EDGE_TYPES),
  accessible: z.boolean(),
  bidirectional: z.boolean(),
  isDemo: z.boolean().default(false),
});

// ---------------------------------------------------------------- model manifest
const modelAssetSchema = z.object({
  path: z.string().startsWith("/"),
  status: z.enum(["available", "unavailable"]),
});

const rectSchema = z.object({ minX: z.number(), maxX: z.number(), minZ: z.number(), maxZ: z.number() });

export const ProceduralRoomLayoutSchema = rectSchema.extend({
  doorSide: z.enum(["north", "south"]),
  doorX: z.number(),
});

export const ProceduralLayoutSchema = z.object({
  footprint: rectSchema,
  floorHeight: z.number().positive(),
  slabThickness: z.number().positive(),
  wallHeight: z.number().positive(),
  wallThickness: z.number().positive(),
  doorWidth: z.number().positive(),
  corridor: z.object({ minZ: z.number(), maxZ: z.number() }),
  stairCore: rectSchema,
  elevatorShaft: rectSchema,
  stairNode: z.object({ x: z.number(), z: z.number() }),
  elevatorNode: z.object({ x: z.number(), z: z.number() }),
  mainEntrance: z.object({ x: z.number(), z: z.number(), width: z.number(), side: z.literal("south") }),
  rooms: z.record(z.string(), ProceduralRoomLayoutSchema),
});

export const BuildingModelSchema = z.object({
  buildingId: idSchema,
  exterior: modelAssetSchema,
  floors: z.array(modelAssetSchema.extend({ floorId: idSchema, floorNumber: z.number().int() })),
  /** model object name -> room id */
  objectMap: z.record(z.string(), idSchema),
  procedural: ProceduralLayoutSchema,
});

const xzSchema = z.object({ x: z.number(), z: z.number() });

export const CampusBuildingSchema = z.object({
  /** stable key for selection on the map; falls back to slug for older data */
  id: z.string().optional(),
  /** the number printed on the site plan */
  number: z.number().int().positive().nullable().optional(),
  /** indoor-model building this campus entry opens, if one exists */
  buildingId: idSchema.nullable(),
  slug: z.string().nullable(),
  label: z.string(),
  name: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  /** storeys as described by the owner; null/absent = unknown */
  floors: z.number().int().positive().nullable().optional(),
  /** heights are not in a site plan: true = size.height is a visualisation estimate */
  heightIsEstimate: z.boolean().optional(),
  /** "marker" = no closed outline in the drawing, shown as a pin instead of an invented shape */
  kind: z.enum(["building", "marker"]).optional(),
  position: xzSchema,
  size: z.object({ width: z.number().positive(), depth: z.number().positive(), height: z.number().positive() }),
  clickable: z.boolean(),
  entrance: xzSchema.nullable(),
  /** outline in campus meters (X east, Z south); when present the building is extruded from it */
  footprint: z.array(xzSchema).min(3).optional(),
});

export const CampusSchema = z.object({
  isDemo: z.boolean(),
  /** where the layout came from; shown to users so demo and real content are never confused */
  source: z.object({ kind: z.enum(["demo", "cad"]), note: z.string() }).optional(),
  ground: z.object({ width: z.number().positive(), depth: z.number().positive() }),
  buildings: z.array(CampusBuildingSchema),
  entrances: z.array(z.object({ id: z.string(), label: z.string(), x: z.number(), z: z.number() })).optional(),
  /** flat context lines on the ground; each polyline is a flat [x0, z0, x1, z1, ...] array */
  linework: z
    .array(z.object({ kind: z.enum(["vegetation", "sports", "site"]), polylines: z.array(z.array(z.number()).min(4)) }))
    .optional(),
  paths: z.array(
    z.object({
      id: z.string(),
      points: z.array(xzSchema).min(2),
      width: z.number().positive(),
    }),
  ),
  trees: z.array(xzSchema),
});

export const ModelManifestSchema = z.object({
  schemaVersion: z.literal(1),
  isDemo: z.boolean(),
  note: z.string().optional(),
  units: z.literal("meters"),
  coordinateSystem: z.record(z.string(), z.string()),
  buildings: z.array(BuildingModelSchema),
  campus: CampusSchema,
});
