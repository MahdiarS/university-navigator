import { SearchX } from "lucide-react";
import { ButtonLink } from "@/components/ui/Button";

export default function NotFound() {
  return (
    <main className="mx-auto flex w-full max-w-xl flex-1 flex-col items-center justify-center gap-4 px-4 py-20 text-center">
      <span className="grid size-14 place-items-center rounded-2xl bg-gray-100 text-gray-500">
        <SearchX className="size-7" aria-hidden />
      </span>
      <h1 className="text-xl font-bold">صفحه‌ای که دنبالش بودید پیدا نشد</h1>
      <p className="text-sm text-gray-500">ممکن است نشانی اشتباه باشد یا این مورد غیرفعال شده باشد.</p>
      <div className="flex flex-wrap justify-center gap-2">
        <ButtonLink href="/" variant="primary">
          صفحه اصلی
        </ButtonLink>
        <ButtonLink href="/search" variant="secondary">
          جستجوی دفاتر و خدمات
        </ButtonLink>
      </div>
    </main>
  );
}
