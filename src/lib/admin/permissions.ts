import type { ResourceKey } from "@/lib/data/types";

/**
 * Who may change what. This is the application-level mirror of the RLS policies in database/schema.sql
 * (the database is the real enforcement; this module lets server actions fail early with a clear message and
 * lets the UI hide buttons). The role is ALWAYS loaded from public.profiles on the server, never from the browser.
 */
export type StaffRole = "admin" | "editor";
export type WriteOperation = "create" | "update" | "delete";

export const STAFF_ROLES: readonly StaffRole[] = ["admin", "editor"];

export function isStaffRole(value: unknown): value is StaffRole {
  return typeof value === "string" && (STAFF_ROLES as readonly string[]).includes(value);
}

/** Resources an editor may create/update. */
const EDITOR_WRITABLE: ReadonlySet<ResourceKey> = new Set<ResourceKey>(["departments", "services", "rooms"]);

export function canWrite(role: StaffRole | null | undefined, resource: ResourceKey, op: WriteOperation): boolean {
  if (role === "admin") return true;
  if (role !== "editor") return false;
  if (!EDITOR_WRITABLE.has(resource)) return false;
  if (op === "delete") return resource === "services"; // matches department_services_staff_delete
  return true;
}

export const ROLE_LABEL_FA: Record<StaffRole, string> = { admin: "مدیر سامانه", editor: "ویرایشگر" };
