import { normalizeText, toPersianDigits } from "@/lib/search/normalize";
import type { Lookups } from "@/lib/data/lookups";
import type { NavigatorData, Room } from "@/lib/data/types";

/**
 * Pure helpers that turn data into the options of the "from" and "to" pickers. Kept out of the components so they
 * are unit-testable and the same rules apply everywhere.
 */
export type PlaceGroup = "entrance" | "room" | "corridor" | "vertical";

export const PLACE_GROUP_LABEL: Record<PlaceGroup, string> = {
  entrance: "ورودی ساختمان",
  room: "اتاق‌ها و واحدها",
  corridor: "نقاط راهرو",
  vertical: "راه‌پله و آسانسور",
};

export interface PlaceOption {
  /** unique option id */
  id: string;
  /** navigation node used as route start */
  nodeId: string;
  label: string;
  detail: string;
  group: PlaceGroup;
  /** normalised text used for filtering */
  searchText: string;
}

export interface DestinationOption {
  roomId: string;
  label: string;
  detail: string;
  searchText: string;
  /** false when the room has no door node, so no route can end there */
  routable: boolean;
}

export function roomTitle(room: Room, lookups: Lookups): string {
  const depts = (lookups.departmentsByRoom.get(room.id) ?? []).filter((d) => d.isActive);
  return depts.length > 0 ? depts.map((d) => d.name).join(" · ") : room.name;
}

export function roomDetail(room: Room, lookups: Lookups): string {
  const floor = lookups.floorsById.get(room.floorId);
  return `اتاق ${toPersianDigits(room.roomNumber)}${floor ? ` · ${floor.displayName}` : ""}`;
}

const option = (id: string, nodeId: string, label: string, detail: string, group: PlaceGroup, extra = ""): PlaceOption => ({
  id,
  nodeId,
  label,
  detail,
  group,
  searchText: normalizeText(`${label} ${detail} ${extra}`),
});

export function buildStartOptions(data: NavigatorData, lookups: Lookups, buildingId: string): PlaceOption[] {
  const out: PlaceOption[] = [];
  const nodes = data.nodes.filter((n) => n.buildingId === buildingId);
  const floorName = (floorId: string) => lookups.floorsById.get(floorId)?.displayName ?? "";

  for (const e of data.entrances.filter((x) => x.buildingId === buildingId)) {
    if (e.nodeId) out.push(option(`start:${e.id}`, e.nodeId, e.name, floorName(e.floorId), "entrance", "ورودی main entrance"));
  }
  for (const n of nodes) {
    if (n.type === "room-door") {
      const room = lookups.roomByDoorNode.get(n.id);
      if (room) out.push(option(`start:${n.id}`, n.id, roomTitle(room, lookups), roomDetail(room, lookups), "room", room.roomNumber));
    } else if (n.type === "corridor" || n.type === "junction") {
      out.push(option(`start:${n.id}`, n.id, n.label ?? n.id, floorName(n.floorId), "corridor", "راهرو"));
    } else if (n.type === "stair" || n.type === "elevator") {
      out.push(option(`start:${n.id}`, n.id, n.label ?? n.id, floorName(n.floorId), "vertical", n.type === "stair" ? "پله stairs" : "آسانسور elevator"));
    }
  }
  const order: PlaceGroup[] = ["entrance", "room", "vertical", "corridor"];
  return out.sort((a, b) => order.indexOf(a.group) - order.indexOf(b.group));
}

export function buildDestinationOptions(data: NavigatorData, lookups: Lookups, buildingId: string): DestinationOption[] {
  const floorIds = new Set((lookups.floorsByBuilding.get(buildingId) ?? []).map((f) => f.id));
  return data.rooms
    .filter((r) => floorIds.has(r.floorId))
    .map((room) => {
      const depts = (lookups.departmentsByRoom.get(room.id) ?? []).filter((d) => d.isActive);
      const label = roomTitle(room, lookups);
      const detail = roomDetail(room, lookups);
      return {
        roomId: room.id,
        label,
        detail,
        routable: Boolean(room.doorNodeId),
        searchText: normalizeText(
          [label, room.name, room.roomNumber, detail, ...depts.flatMap((d) => d.keywords)].join(" "),
        ),
      };
    })
    .sort((a, b) => a.detail.localeCompare(b.detail, "fa") || a.label.localeCompare(b.label, "fa"));
}

/** Case/ZWNJ/Arabic-letter tolerant filter shared by both pickers. */
export function filterByText<T extends { searchText: string }>(items: readonly T[], query: string): T[] {
  const tokens = normalizeText(query).split(" ").filter(Boolean);
  if (tokens.length === 0) return [...items];
  return items.filter((i) => tokens.every((t) => i.searchText.includes(t)));
}
