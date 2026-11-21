import { z } from "zod";
import { RESOURCES, isResourceKey, toRow } from "@/lib/data/resources";
import type { ResourceKey } from "@/lib/data/types";
import { canWrite, type StaffRole, type WriteOperation } from "./permissions";

/**
 * Pure part of the admin write path (no I/O), so it can be unit-tested:
 * resource whitelist -> role check -> Zod validation -> database row.
 */
export type SaveFailure = { ok: false; error: string; fieldErrors?: Record<string, string> };
export type PreparedWrite = { ok: true; resource: ResourceKey; table: string; row: Record<string, unknown>; id: string };

export function prepareWrite(
  role: StaffRole | null | undefined,
  resourceName: string,
  op: Exclude<WriteOperation, "delete">,
  payload: unknown,
): PreparedWrite | SaveFailure {
  if (!isResourceKey(resourceName)) return { ok: false, error: "نوع رکورد نامعتبر است." };
  if (!canWrite(role, resourceName, op)) return { ok: false, error: "شما اجازه‌ی این تغییر را ندارید." };
  if (typeof payload !== "object" || payload === null || Array.isArray(payload)) {
    return { ok: false, error: "داده‌ی ارسالی نامعتبر است." };
  }

  const def = RESOURCES[resourceName];
  // Navigation nodes carry buildingId in the domain model, but the database derives it from the floor.
  // Accept the payload without it and let the schema see an empty placeholder.
  const input: Record<string, unknown> = { ...(payload as Record<string, unknown>) };
  if (resourceName === "nodes" && input["buildingId"] === undefined) input["buildingId"] = "pending-derived";

  const parsed = def.schema.safeParse(input);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? "");
      if (key && !(key in fieldErrors)) fieldErrors[key] = issue.message;
    }
    return { ok: false, error: "برخی فیلدها نامعتبر است.", fieldErrors };
  }
  const row = toRow(def, parsed.data);
  return { ok: true, resource: resourceName, table: def.table, row, id: String(parsed.data["id"]) };
}

export const DeleteRequestSchema = z.object({ resource: z.string(), id: z.string().min(2).max(80) });

/** Maps a PostgREST/Postgres error to a short Persian message without exposing internals. */
export function friendlyDbError(error: { code?: string; message?: string } | null): string {
  switch (error?.code) {
    case "42501":
      return "دسترسی مجاز نیست (سیاست امنیتی پایگاه داده).";
    case "23505":
      return "این شناسه یا slug قبلاً استفاده شده است.";
    case "23503":
      return "این رکورد به رکورد دیگری وابسته است یا رکوردهای دیگر به آن وابسته‌اند.";
    case "23514":
      return "مقدار واردشده قید پایگاه داده را رعایت نمی‌کند.";
    default:
      return "ذخیره‌سازی ناموفق بود. دوباره تلاش کنید.";
  }
}
