import { ShieldCheck } from "lucide-react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ButtonLink } from "@/components/ui/Button";
import { LoginForm } from "@/features/admin/LoginForm";
import { SetupRequired } from "@/features/admin/SetupRequired";
import { getStaffContext } from "@/lib/admin/session";
import { getAdminMode } from "@/lib/config";

export const metadata: Metadata = { title: "ورود کارکنان" };

export default async function AdminLoginPage() {
  const mode = getAdminMode();
  if (mode === "setup-required") return <SetupRequired />;
  if (mode === "demo-local") {
    return (
      <main className="mx-auto w-full max-w-md flex-1 px-4 py-12 text-center">
        <p className="mb-4 text-sm leading-7 text-gray-700">
          حالت دمو محلی (فقط توسعه) فعال است و ورود ندارد. این حالت امن نیست و در نسخه‌ی تولیدی کار نمی‌کند.
        </p>
        <ButtonLink href="/admin">رفتن به پنل آزمایشی</ButtonLink>
      </main>
    );
  }

  const ctx = await getStaffContext();
  if (ctx.status === "ok") redirect("/admin");

  return (
    <main className="mx-auto w-full max-w-md flex-1 px-4 py-12">
      <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-panel">
        <span className="mb-4 grid size-12 place-items-center rounded-xl bg-navy-800 text-white">
          <ShieldCheck className="size-6" aria-hidden />
        </span>
        <h1 className="mb-1 text-xl font-bold">ورود کارکنان</h1>
        <p className="mb-5 text-sm text-gray-500">فقط برای مدیران و ویرایشگران مجاز دانشگاه.</p>
        <LoginForm />
      </div>
    </main>
  );
}
