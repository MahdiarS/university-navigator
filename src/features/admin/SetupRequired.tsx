import { KeyRound } from "lucide-react";
import { ButtonLink } from "@/components/ui/Button";

/** Shown instead of the admin panel when Supabase is not configured (and the dev-only demo admin is off). */
export function SetupRequired() {
  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-12 md:px-6">
      <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-panel">
        <span className="mb-4 grid size-12 place-items-center rounded-xl bg-gray-100 text-navy-800">
          <KeyRound className="size-6" aria-hidden />
        </span>
        <h1 className="mb-2 text-xl font-bold">پنل مدیریت هنوز راه‌اندازی نشده است</h1>
        <p className="mb-4 text-sm leading-7 text-gray-700">
          مدیریت واقعی داده‌ها به احراز هویت Supabase نیاز دارد و در این نسخه تنظیم نشده است. تا آن زمان سایت عمومی با
          داده‌ی نمونه کار می‌کند و هیچ بخش مدیریتی بدون ورود در دسترس نیست.
        </p>
        <ol className="mb-5 list-decimal space-y-1.5 ps-5 text-sm leading-7 text-gray-700">
          <li>یک پروژه‌ی Supabase بسازید و فایل‌های <code className="ltr inline-block">database/schema.sql</code> و <code className="ltr inline-block">database/seed.sql</code> را اجرا کنید.</li>
          <li>مقادیر <code className="ltr inline-block">NEXT_PUBLIC_SUPABASE_URL</code> و <code className="ltr inline-block">NEXT_PUBLIC_SUPABASE_ANON_KEY</code> را در <code className="ltr inline-block">.env.local</code> بگذارید.</li>
          <li>یک کاربر در Supabase Auth بسازید و برای او ردیف <code className="ltr inline-block">profiles</code> با نقش admin ثبت کنید.</li>
        </ol>
        <p className="mb-5 text-xs leading-6 text-gray-500">
          جزئیات در <span className="ltr inline-block">docs/deployment-guide.md</span>. برای آزمایش محلی در توسعه می‌توانید
          <span className="ltr mx-1 inline-block">NEXT_PUBLIC_DEMO_ADMIN=true</span> را فعال کنید (بدون رمز، فقط localStorage، فقط NODE_ENV=development).
        </p>
        <ButtonLink href="/" variant="secondary">بازگشت به صفحه اصلی</ButtonLink>
      </div>
    </main>
  );
}
