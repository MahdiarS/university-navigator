import type { Lookups } from "@/lib/data/lookups";
import type { Room } from "@/lib/data/types";
import { toPersianDigits } from "@/lib/search/normalize";

/** Display title of a room: the names of the people/units in it, else the room's own name. */
export function roomTitle(room: Room, lookups: Lookups): string {
  const depts = (lookups.departmentsByRoom.get(room.id) ?? []).filter((d) => d.isActive);
  return depts.length > 0 ? depts.map((d) => d.name).join(" · ") : room.name;
}

export function roomDetail(room: Room, lookups: Lookups): string {
  const floor = lookups.floorsById.get(room.floorId);
  return `اتاق ${toPersianDigits(room.roomNumber)}${floor ? ` · ${floor.displayName}` : ""}`;
}
