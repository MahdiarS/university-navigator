"use client";
import { useRouter } from "next/navigation";
import { useMemo } from "react";
import { deleteRecordAction, saveRecordAction } from "@/lib/admin/actions";
import type { StaffRole } from "@/lib/admin/permissions";
import type { NavigatorData } from "@/lib/data/types";
import { AdminConsole } from "./AdminConsole";
import type { AdminBackend } from "./types";

/** Admin console wired to Server Actions. The role shown here is informational; the server re-checks it on every write. */
export function SupabaseAdmin({ data, role, userLabel }: { data: NavigatorData; role: StaffRole; userLabel: string }) {
  const router = useRouter();
  const backend = useMemo<AdminBackend>(
    () => ({
      kind: "supabase",
      role,
      data,
      async save(resource, mode, record) {
        const result = await saveRecordAction(resource, mode, record);
        if (result.ok) router.refresh();
        return result;
      },
      async remove(resource, id) {
        const result = await deleteRecordAction(resource, id);
        if (result.ok) router.refresh();
        return result;
      },
    }),
    [data, role, router],
  );
  return <AdminConsole backend={backend} userLabel={userLabel} />;
}
