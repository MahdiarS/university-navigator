import { brand } from "@/lib/brand";

export function Footer() {
  return (
    <footer className="mt-auto border-t border-gray-200 bg-white">
      <div className="mx-auto flex max-w-6xl flex-col gap-1 px-4 py-6 text-xs leading-6 text-gray-500 md:px-6">
        <p className="font-medium text-gray-700">
          {brand.productFa} <span className="ltr inline-block">· {brand.productEn}</span>
        </p>
        <p>{brand.dataNotice}</p>
        <p>
          این سامانه موقعیت‌یابی زنده (GPS) ندارد؛ نقطه شروع مسیر را خودتان انتخاب می‌کنید.
        </p>
      </div>
    </footer>
  );
}
