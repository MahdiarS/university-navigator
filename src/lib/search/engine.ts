import type { Building, Department, DepartmentService, Floor, NavigatorData, Room } from "@/lib/data/types";
import { compactText, normalizeText, tokenize } from "./normalize";

/**
 * Search service (UI-independent). Builds an in-memory index from NavigatorData and ranks
 * departments (primary) and rooms that have no department (e.g. classrooms).
 */

const PERSIAN_ORDINALS = ["همکف", "اول", "دوم", "سوم", "چهارم", "پنجم", "ششم", "هفتم", "هشتم", "نهم", "دهم"];

/** Alternative names for a floor so "طبقه 1", "طبقه اول", "floor 1" and "اول" all find it. */
export function floorAliases(floor: Floor): string[] {
  const n = floor.floorNumber;
  const ordinal = n >= 0 && n < PERSIAN_ORDINALS.length ? PERSIAN_ORDINALS[n] : undefined;
  return [
    floor.displayName,
    n === 0 ? "طبقه همکف" : `طبقه ${n}`,
    `floor ${n}`,
    ...(ordinal ? [`طبقه ${ordinal}`, ordinal] : []),
  ];
}

export type MatchField = "name" | "roomNumber" | "service" | "keyword" | "description" | "floor" | "building" | "roomName";

interface IndexedField {
  field: MatchField;
  weight: number;
  text: string; // normalised
  compact: string; // normalised, spaces removed
}

interface IndexEntry {
  kind: "department" | "room";
  id: string;
  department: Department | null;
  room: Room;
  floor: Floor;
  building: Building;
  services: DepartmentService[];
  fields: IndexedField[];
  /** all text, used for the whole-query containment fallback */
  allCompact: string;
}

export interface SearchIndex {
  entries: IndexEntry[];
}

export interface SearchHit {
  kind: "department" | "room";
  id: string;
  score: number;
  title: string;
  department: Department | null;
  room: Room;
  floor: Floor;
  building: Building;
  services: DepartmentService[];
  matchedFields: MatchField[];
}

export interface SearchOptions {
  limit?: number;
  /** restrict to a building id */
  buildingId?: string;
  /** restrict to a floor id */
  floorId?: string;
}

const field = (f: MatchField, weight: number, value: string | null | undefined): IndexedField[] =>
  value ? [{ field: f, weight, text: normalizeText(value), compact: compactText(value) }] : [];

export function buildSearchIndex(
  data: Pick<NavigatorData, "buildings" | "floors" | "rooms" | "departments" | "services">,
): SearchIndex {
  const buildings = new Map(data.buildings.map((b) => [b.id, b]));
  const floors = new Map(data.floors.map((f) => [f.id, f]));
  const servicesByDept = new Map<string, DepartmentService[]>();
  for (const s of data.services) {
    const list = servicesByDept.get(s.departmentId) ?? [];
    list.push(s);
    servicesByDept.set(s.departmentId, list);
  }
  const deptsByRoom = new Map<string, Department[]>();
  for (const d of data.departments.filter((x) => x.isActive)) {
    const list = deptsByRoom.get(d.roomId) ?? [];
    list.push(d);
    deptsByRoom.set(d.roomId, list);
  }

  const entries: IndexEntry[] = [];
  for (const room of data.rooms) {
    const floor = floors.get(room.floorId);
    const building = floor ? buildings.get(floor.buildingId) : undefined;
    if (!floor || !building || !building.isActive) continue;

    const common: IndexedField[] = [
      ...field("roomNumber", 9, room.roomNumber),
      // People type "اتاق ۱۰۱" / "room 101": the label word must be searchable next to the bare number.
      ...field("roomNumber", 9, `اتاق ${room.roomNumber}`),
      ...field("roomNumber", 9, `room ${room.roomNumber}`),
      ...floorAliases(floor).flatMap((a) => field("floor", 3, a)),
      ...field("building", 2, building.name),
    ];
    const depts = deptsByRoom.get(room.id) ?? [];

    for (const d of depts) {
      const svcs = servicesByDept.get(d.id) ?? [];
      const fields = [
        ...field("name", 10, d.name),
        ...field("roomName", 4, room.name),
        ...svcs.flatMap((s) => field("service", 6, s.serviceName)),
        ...d.keywords.flatMap((k) => field("keyword", 5, k)),
        ...svcs.flatMap((s) => s.keywords.flatMap((k) => field("keyword", 4, k))),
        ...field("description", 1, d.description),
        ...common,
      ];
      entries.push({
        kind: "department",
        id: d.id,
        department: d,
        room,
        floor,
        building,
        services: svcs,
        fields,
        allCompact: fields.map((f) => f.compact).join(""),
      });
    }
    // Rooms with no active department are still discoverable (classrooms, restrooms, labs ...).
    if (depts.length === 0) {
      const fields = [...field("name", 10, room.name), ...field("roomName", 4, room.roomType), ...common];
      entries.push({
        kind: "room",
        id: room.id,
        department: null,
        room,
        floor,
        building,
        services: [],
        fields,
        allCompact: fields.map((f) => f.compact).join(""),
      });
    }
  }
  return { entries };
}

/** Score a single token against the entry fields; 0 means "not found". */
function scoreToken(entry: IndexEntry, token: string): { score: number; field: MatchField | null } {
  let best = 0;
  let bestField: MatchField | null = null;
  const tokenCompact = token.replace(/\s+/g, "");
  for (const f of entry.fields) {
    let s = 0;
    const words = f.text.split(" ");
    if (f.text === token || f.compact === tokenCompact) s = f.weight * 3; // exact field
    else if (words.some((w) => w === token)) s = f.weight * 2.2; // whole word
    else if (words.some((w) => w.startsWith(token))) s = f.weight * 1.6; // word prefix
    else if (f.compact.includes(tokenCompact)) s = f.weight; // substring (handles ZWNJ/space variants)
    if (s > best) {
      best = s;
      bestField = f.field;
    }
  }
  return { score: best, field: bestField };
}

/**
 * Rank entries for a query. Every token must match something (AND semantics).
 * An empty query lists every department ordered by floor then name.
 */
export function search(index: SearchIndex, query: string, options: SearchOptions = {}): SearchHit[] {
  const tokens = tokenize(query);
  const wholeCompact = compactText(query);
  const hits: SearchHit[] = [];

  for (const entry of index.entries) {
    if (options.buildingId && entry.building.id !== options.buildingId) continue;
    if (options.floorId && entry.floor.id !== options.floorId) continue;

    let score = 0;
    const matched = new Set<MatchField>();

    if (tokens.length === 0) {
      if (entry.kind !== "department") continue;
      score = 1;
    } else {
      let ok = true;
      for (const t of tokens) {
        const { score: s, field: f } = scoreToken(entry, t);
        if (s === 0) {
          ok = false;
          break;
        }
        score += s;
        if (f) matched.add(f);
      }
      // Fallback: "ثبتنام" typed without spaces against multi-word fields.
      if (!ok && wholeCompact && entry.allCompact.includes(wholeCompact)) {
        ok = true;
        score = 1;
      }
      if (!ok) continue;
      // Bonus when the whole query equals the title.
      const titleCompact = compactText(entry.department?.name ?? entry.room.name);
      if (titleCompact === wholeCompact) score += 25;
      else if (titleCompact.startsWith(wholeCompact)) score += 8;
    }

    hits.push({
      kind: entry.kind,
      id: entry.id,
      score,
      title: entry.department?.name ?? entry.room.name,
      department: entry.department,
      room: entry.room,
      floor: entry.floor,
      building: entry.building,
      services: entry.services,
      matchedFields: [...matched],
    });
  }

  hits.sort(
    (a, b) =>
      b.score - a.score ||
      a.floor.floorNumber - b.floor.floorNumber ||
      a.title.localeCompare(b.title, "fa"),
  );
  return options.limit ? hits.slice(0, options.limit) : hits;
}
