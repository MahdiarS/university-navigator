import { ShieldAlert } from "lucide-react";
import { redirect } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { DemoLocalAdmin } from "@/features/admin/DemoLocalAdmin";
import { SetupRequired } from "@/features/admin/SetupRequired";
import { SupabaseAdmin } from "@/features/admin/SupabaseAdmin";
import { signOutAction } from "@/lib/admin/actions";
import { getStaffContext } from "@/lib/admin/session";
import { getAdminMode } from "@/lib/config";
import manifestJson from "@data/demo/model-manifest.json";
import { loadSupabaseData } from "@/lib/data/supabase-source";

export default async function AdminPage() {
  const mode = getAdminMode();
  if (mode === "setup-required") return <SetupRequired />;
  if (mode === "demo-local") return <DemoLocalAdmin />;

  // Real admin: identity and role are verified on the server on every request.
  const ctx = await getStaffContext();
  if (ctx.status === "unconfigured") return <SetupRequired />;
  if (ctx.status === "anonymous") redirect("/admin/login");
  if (ctx.status === "forbidden") {
    return (
      <main className="mx-auto w-full max-w-lg flex-1 px-4 py-12 text-center">
        <ShieldAlert className="mx-auto mb-4 size-10 text-orange-500" aria-hidden />
        <h1 className="mb-2 text-xl font-bold">دسترسی ندارید</h1>
        <p className="mb-5 text-sm leading-7 text-gray-700">
          حساب {ctx.email ?? "شما"} نقش کارمندی (مدیر یا ویرایشگر) ندارد. از مدیر سامانه بخواهید برای شما پروفایل ثبت کند.
        </p>
        <form action={signOutAction}>
          <Button type="submit" variant="secondary">خروج</Button>
        </form>
      </main>
    );
  }

  // Staff see every row (RLS staff-read policies), including inactive ones.
  const data = await loadSupabaseData(ctx.client, manifestJson);
  return <SupabaseAdmin data={data} role={ctx.role} userLabel={ctx.fullName || ctx.user.email || ""} />;
}
