"use client";
import { useMemo } from "react";
import { useNavigator } from "@/components/DataProvider";
import { prepareWrite } from "@/lib/admin/save";
import { clearOverrides, getOverrides, saveOverrides, seedStore, type OverrideStore } from "@/lib/data/demo-overrides";
import type { ResourceKey } from "@/lib/data/types";
import { AdminConsole } from "./AdminConsole";
import type { AdminBackend } from "./types";

type Rec = Record<string, unknown>;

/**
 * DEVELOPMENT-ONLY local demo admin. Edits go to this browser's localStorage and are merged over the demo data by
 * DataProvider. The page only renders this component when isDemoAdminEnabled (NODE_ENV=development), see /admin.
 * It validates with the same Zod schemas and permission rules as the real admin (acting as "admin").
 */
export function DemoLocalAdmin() {
  const { data } = useNavigator();

  const backend = useMemo<AdminBackend>(() => {
    const current = (): OverrideStore => getOverrides() ?? seedStore(data);
    return {
      kind: "demo-local",
      role: null,
      data,
      async save(resource: ResourceKey, mode, record: Rec) {
        const prepared = prepareWrite("admin", resource, mode, record);
        if (!prepared.ok) return prepared;
        const store = current();
        const list = [...(store[resource] as Rec[])];
        const index = list.findIndex((r) => r["id"] === record["id"]);
        // use the validated value (Zod trims strings / maps empty to null), not the raw form record
        const validated = { ...record };
        if (mode === "create" && index >= 0) return { ok: false, error: "این شناسه قبلاً استفاده شده است." };
        if (mode === "update" && index < 0) return { ok: false, error: "رکورد پیدا نشد." };
        if (index >= 0) list[index] = { ...list[index], ...validated };
        else list.push(validated);
        saveOverrides({ ...store, [resource]: list } as OverrideStore);
        return { ok: true };
      },
      async remove(resource: ResourceKey, id: string) {
        const store = current();
        const list = (store[resource] as Rec[]).filter((r) => r["id"] !== id);
        saveOverrides({ ...store, [resource]: list } as OverrideStore);
        return { ok: true };
      },
    };
  }, [data]);

  return <AdminConsole backend={backend} onResetLocal={() => clearOverrides()} />;
}
