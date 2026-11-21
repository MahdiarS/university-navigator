import type { SaveResult } from "@/lib/admin/actions";
import type { StaffRole } from "@/lib/admin/permissions";
import type { NavigatorData, ResourceKey } from "@/lib/data/types";

/** Where the admin console reads from and writes to. */
export interface AdminBackend {
  kind: "supabase" | "demo-local";
  /** null for the development-only demo admin (no real role exists there) */
  role: StaffRole | null;
  data: NavigatorData;
  save(resource: ResourceKey, mode: "create" | "update", record: Record<string, unknown>): Promise<SaveResult>;
  remove(resource: ResourceKey, id: string): Promise<SaveResult>;
}
