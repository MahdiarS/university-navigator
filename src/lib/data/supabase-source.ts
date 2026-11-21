import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { RESOURCES, fromRow, type ResourceDef } from "./resources";
import { ModelManifestSchema } from "./schemas";
import type { Floor, ModelManifest, NavigatorData } from "./types";

type Row = Record<string, unknown>;

/** Validate rows one by one: a single malformed record is dropped (and logged) instead of breaking the page. */
export function parseRows<T>(def: ResourceDef, rows: Row[], extra?: (v: Row) => Row): T[] {
  const out: T[] = [];
  for (const row of rows) {
    const mapped = extra ? extra(fromRow(def, row)) : fromRow(def, row);
    const parsed = def.schema.safeParse(mapped);
    if (parsed.success) out.push(parsed.data as T);
    else console.error(`[data] dropped invalid ${def.table} row`, row["id"], z.prettifyError(parsed.error));
  }
  return out;
}

async function selectAll(client: SupabaseClient, def: ResourceDef): Promise<Row[]> {
  const { data, error } = await client.from(def.table).select("*");
  if (error) throw new Error(`Failed to read ${def.table}`);
  return (data ?? []) as Row[];
}

/**
 * Loads public data through a client. With the anon client, RLS limits results to active/published rows.
 * The 3D model manifest is not stored in the database; it is passed in (see docs/3d-model-guide.md).
 */
export async function loadSupabaseData(client: SupabaseClient, manifestInput: unknown): Promise<NavigatorData> {
  const [b, f, r, d, s, e, fa, n, ed] = await Promise.all([
    selectAll(client, RESOURCES.buildings),
    selectAll(client, RESOURCES.floors),
    selectAll(client, RESOURCES.rooms),
    selectAll(client, RESOURCES.departments),
    selectAll(client, RESOURCES.services),
    selectAll(client, RESOURCES.entrances),
    selectAll(client, RESOURCES.facilities),
    selectAll(client, RESOURCES.nodes),
    selectAll(client, RESOURCES.edges),
  ]);

  const buildings = parseRows<NavigatorData["buildings"][number]>(RESOURCES.buildings, b);
  const floors = parseRows<Floor>(RESOURCES.floors, f);
  const floorToBuilding = new Map(floors.map((fl) => [fl.id, fl.buildingId]));
  const manifest: ModelManifest = ModelManifestSchema.parse(manifestInput);

  return {
    source: "supabase",
    buildings,
    floors,
    rooms: parseRows(RESOURCES.rooms, r),
    departments: parseRows(RESOURCES.departments, d),
    services: parseRows(RESOURCES.services, s),
    entrances: parseRows(RESOURCES.entrances, e),
    facilities: parseRows(RESOURCES.facilities, fa),
    // navigation_nodes has no building_id column: derive it from the floor.
    nodes: parseRows(RESOURCES.nodes, n, (v) => ({ ...v, buildingId: floorToBuilding.get(String(v["floorId"])) ?? "" })),
    edges: parseRows(RESOURCES.edges, ed),
    manifest,
  };
}
