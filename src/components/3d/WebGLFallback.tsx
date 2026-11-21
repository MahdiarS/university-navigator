import { Box, Search } from "lucide-react";
import { ButtonLink } from "@/components/ui/Button";

/** Shown instead of a 3D canvas when WebGL is missing or the scene fails. Search and details still work. */
export function WebGLFallback({ reason }: { reason: "unsupported" | "error" }) {
  return (
    <div role="alert" className="un-viewer-bg grid size-full place-items-center p-6">
      <div className="max-w-sm text-center">
        <span className="mx-auto mb-4 grid size-14 place-items-center rounded-2xl bg-white text-gray-500 shadow-panel">
          <Box className="size-7" aria-hidden />
        </span>
        <h2 className="mb-2 text-lg font-bold">
          {reason === "unsupported" ? "نقشه سه‌بعدی روی این دستگاه در دسترس نیست" : "نمایش نقشه سه‌بعدی با خطا روبه‌رو شد"}
        </h2>
        <p className="mb-5 text-sm leading-7 text-gray-500">
          {reason === "unsupported"
            ? "مرورگر شما WebGL را پشتیبانی نمی‌کند یا غیرفعال است."
            : "لطفاً صفحه را دوباره بارگذاری کنید."}{" "}
          همچنان می‌توانید دفاتر و خدمات را جستجو کنید و اطلاعات مقصد (طبقه، شماره اتاق، توضیحات) را بخوانید.
        </p>
        <ButtonLink href="/search" variant="primary">
          <Search className="size-4" aria-hidden />
          جستجوی دفاتر و خدمات
        </ButtonLink>
      </div>
    </div>
  );
}
