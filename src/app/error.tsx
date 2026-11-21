"use client";
import { TriangleAlert } from "lucide-react";
import { Button, ButtonLink } from "@/components/ui/Button";

/** Route-level error boundary. Never shows stack traces or internal messages to end users. */
export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="mx-auto flex w-full max-w-xl flex-1 flex-col items-center justify-center gap-4 px-4 py-20 text-center">
      <span className="grid size-14 place-items-center rounded-2xl bg-orange-100 text-orange-500">
        <TriangleAlert className="size-7" aria-hidden />
      </span>
      <h1 className="text-xl font-bold">مشکلی پیش آمد</h1>
      <p className="text-sm text-gray-500">بارگذاری این صفحه با خطا روبه‌رو شد. لطفاً دوباره تلاش کنید.</p>
      <div className="flex flex-wrap justify-center gap-2">
        <Button variant="primary" onClick={reset}>
          تلاش دوباره
        </Button>
        <ButtonLink href="/search" variant="secondary">
          جستجوی دفاتر و خدمات
        </ButtonLink>
      </div>
    </main>
  );
}
