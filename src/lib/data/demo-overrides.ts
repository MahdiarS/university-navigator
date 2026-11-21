"use client";
import { z } from "zod";
import {
  BuildingSchema, DepartmentSchema, DepartmentServiceSchema, EntranceSchema, FloorSchema,
  NavEdgeSchema, NavNodeSchema, RoomSchema,
} from "./schemas";
import type { NavigatorData, ResourceKey } from "./types";

/**
 * LOCAL-ONLY, TEMPORARY edits made in the development demo admin.
 * Stored in this browser's localStorage; never sent anywhere; ignored in production builds
 * (see isDemoAdminEnabled in src/lib/config.ts). This is NOT a security feature.
 */
export const OVERRIDES_KEY = "un.demo-admin.v1";
const CHANGE_EVENT = "un:demo-overrides";

const StoreSchema = z.object({
  buildings: z.array(BuildingSchema),
  floors: z.array(FloorSchema),
  rooms: z.array(RoomSchema),
  departments: z.array(DepartmentSchema),
  services: z.array(DepartmentServiceSchema),
  entrances: z.array(EntranceSchema),
  nodes: z.array(NavNodeSchema),
  edges: z.array(NavEdgeSchema),
});
export type OverrideStore = z.infer<typeof StoreSchema>;

let cachedRaw: string | null = null;
let cachedValue: OverrideStore | null = null;

/** Stable snapshot for useSyncExternalStore: same object until the stored string changes. */
export function getOverrides(): OverrideStore | null {
  if (typeof window === "undefined") return null;
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(OVERRIDES_KEY);
  } catch {
    return null;
  }
  if (raw === cachedRaw) return cachedValue;
  cachedRaw = raw;
  try {
    cachedValue = raw ? StoreSchema.parse(JSON.parse(raw)) : null;
  } catch {
    cachedValue = null; // corrupt/tampered value: ignore it
  }
  return cachedValue;
}

export function subscribeOverrides(callback: () => void): () => void {
  window.addEventListener("storage", callback);
  window.addEventListener(CHANGE_EVENT, callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener(CHANGE_EVENT, callback);
  };
}

export function seedStore(data: NavigatorData): OverrideStore {
  return {
    buildings: data.buildings, floors: data.floors, rooms: data.rooms, departments: data.departments,
    services: data.services, entrances: data.entrances, nodes: data.nodes, edges: data.edges,
  };
}

export function saveOverrides(store: OverrideStore): void {
  window.localStorage.setItem(OVERRIDES_KEY, JSON.stringify(store));
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

export function clearOverrides(): void {
  window.localStorage.removeItem(OVERRIDES_KEY);
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

export function applyOverrides(base: NavigatorData, store: OverrideStore | null): NavigatorData {
  return store ? { ...base, ...store } : base;
}

export type { ResourceKey };
