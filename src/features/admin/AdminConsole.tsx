"use client";
import { AlertTriangle, CheckCircle2, FlaskConical, LogOut, ShieldCheck } from "lucide-react";
import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { signOutAction } from "@/lib/admin/actions";
import { ROLE_LABEL_FA } from "@/lib/admin/permissions";
import { ADMIN_RESOURCE_KEYS, RESOURCES } from "@/lib/data/resources";
import type { ResourceKey } from "@/lib/data/types";
import { validateGraph } from "@/lib/navigation";
import { cn } from "@/lib/utils/cn";
import { ResourceEditor } from "./ResourceEditor";
import type { AdminBackend } from "./types";

function GraphHealth({ backend }: { backend: AdminBackend }) {
  const issues = useMemo(() => validateGraph(backend.data.nodes, backend.data.edges), [backend.data.nodes, backend.data.edges]);
  const errors = issues.filter((i) => i.level === "error");
  return (
    <section aria-label="سلامت گراف مسیریابی" className="rounded-2xl border border-gray-200 bg-white p-4 text-sm">
      <h2 className="mb-2 flex items-center gap-2 font-bold">
        {errors.length === 0 ? <CheckCircle2 className="size-4 text-teal-600" aria-hidden /> : <AlertTriangle className="size-4 text-orange-500" aria-hidden />}
        سلامت گراف مسیریابی
      </h2>
      <p className="text-gray-700">
        {backend.data.nodes.length} گره · {backend.data.edges.length} یال ·{" "}
        {issues.length === 0 ? "مشکلی پیدا نشد." : `${errors.length} خطا و ${issues.length - errors.length} هشدار`}
      </p>
      {issues.length > 0 && (
        <ul className="ltr mt-2 max-h-40 space-y-1 overflow-auto text-xs text-gray-700">
          {issues.slice(0, 30).map((i, n) => (
            <li key={`${i.code}-${n}`}>
              <Badge tone={i.level === "error" ? "orange" : "neutral"}>{i.level}</Badge> {i.message}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/**
 * Admin console: one tab per resource, all driven by the same generic editor.
 * `backend` decides where data is read from and written to (Supabase Server Actions or the dev-only local demo store).
 */
export function AdminConsole({
  backend,
  userLabel,
  onResetLocal,
}: {
  backend: AdminBackend;
  userLabel?: string;
  /** only for the development-only local demo admin */
  onResetLocal?: () => void;
}) {
  const [tab, setTab] = useState<ResourceKey>("departments");
  const local = backend.kind === "demo-local";

  return (
    <div className="mx-auto w-full max-w-7xl space-y-4 px-4 py-6 md:px-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold">
            <ShieldCheck className="size-6 text-navy-800" aria-hidden />
            پنل مدیریت
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            {local ? "حالت آزمایشی محلی (فقط توسعه)" : `${userLabel ?? ""}${backend.role ? ` · ${ROLE_LABEL_FA[backend.role]}` : ""}`}
          </p>
        </div>
        {local ? (
          onResetLocal && <Button variant="secondary" onClick={onResetLocal}>بازگرداندن داده‌های نمونه</Button>
        ) : (
          <form action={signOutAction}>
            <Button type="submit" variant="secondary">
              <LogOut className="size-4" aria-hidden />
              خروج
            </Button>
          </form>
        )}
      </header>

      {local && (
        <div role="note" className="flex items-start gap-3 rounded-2xl border border-orange-500/40 bg-orange-100 p-4 text-sm">
          <FlaskConical className="mt-0.5 size-5 shrink-0 text-orange-500" aria-hidden />
          <p className="leading-7">
            <strong>حالت دمو محلی — موقت و غیرامن.</strong> تغییرات فقط در localStorage همین مرورگر ذخیره می‌شود، به هیچ
            سرور یا کاربر دیگری نمی‌رسد و رمز یا احراز هویتی ندارد. این حالت فقط در محیط توسعه (NODE_ENV=development)
            فعال است و در نسخه‌ی تولیدی هرگز کار نمی‌کند. برای مدیریت واقعی، Supabase را تنظیم کنید.
          </p>
        </div>
      )}

      <nav aria-label="بخش‌های مدیریت" className="un-scroll -mx-1 flex gap-1 overflow-x-auto px-1 pb-1">
        {ADMIN_RESOURCE_KEYS.map((key) => (
          <button
            key={key}
            type="button"
            aria-current={tab === key ? "page" : undefined}
            onClick={() => setTab(key)}
            className={cn(
              "min-h-11 shrink-0 rounded-xl px-4 text-sm font-medium",
              tab === key ? "bg-navy-800 text-white" : "bg-white text-gray-700 border border-gray-200 hover:bg-gray-50",
            )}
          >
            {RESOURCES[key].label}
          </button>
        ))}
      </nav>

      <ResourceEditor key={tab} resource={tab} backend={backend} />

      {(tab === "nodes" || tab === "edges") && <GraphHealth backend={backend} />}
    </div>
  );
}
