"use client";
import { FlaskConical, Landmark, Map, Menu, Search, ShieldCheck, X, Building2 } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { useNavigator } from "@/components/DataProvider";
import { brand, PILOT_BUILDING_SLUG } from "@/lib/brand";
import { cn } from "@/lib/utils/cn";

const links = [
  { href: "/", label: "خانه", icon: Landmark },
  { href: "/campus", label: "پردیس", icon: Map },
  { href: `/buildings/${PILOT_BUILDING_SLUG}`, label: "ساختمان", icon: Building2 },
  { href: "/search", label: "جستجو", icon: Search },
] as const;

function isActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`) || (href === "/search" && pathname.startsWith("/departments"));
}

/** University identity is a placeholder until official branding is provided. */
function Brand() {
  return (
    <Link href="/" className="flex min-w-0 items-center gap-3" aria-label={`${brand.productFa} — صفحه اصلی`}>
      <span
        className="grid size-9 shrink-0 place-items-center rounded-lg border border-dashed border-white/40 bg-white/10 text-white"
        title={brand.universityPlaceholder}
      >
        <Landmark className="size-5" aria-hidden />
      </span>
      <span className="min-w-0 leading-tight">
        <span className="block truncate text-[15px] font-bold text-white">{brand.productFa}</span>
        <span className="ltr block truncate text-[11px] font-medium text-white/60">{brand.productEn}</span>
      </span>
    </Link>
  );
}

export function Header() {
  const pathname = usePathname();
  const { data } = useNavigator();
  const [open, setOpen] = useState(false);
  const isDemo = data.manifest.isDemo || data.source === "demo";

  return (
    <header className="relative z-40 shrink-0">
      <div className="flex h-14 items-center justify-between gap-4 bg-navy-900 px-4 md:px-6">
        <Brand />
        <nav aria-label="ناوبری اصلی" className="hidden items-center gap-1 md:flex">
          {links.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              aria-current={isActive(pathname, href) ? "page" : undefined}
              className={cn(
                "flex min-h-10 items-center gap-2 rounded-lg px-3 text-sm font-medium transition-colors",
                isActive(pathname, href) ? "bg-white/15 text-white" : "text-white/70 hover:bg-white/10 hover:text-white",
              )}
            >
              <Icon className="size-4" aria-hidden />
              {label}
            </Link>
          ))}
          <Link
            href="/admin"
            className="ms-2 flex min-h-10 items-center gap-2 rounded-lg border border-white/20 px-3 text-sm text-white/70 hover:bg-white/10 hover:text-white"
          >
            <ShieldCheck className="size-4" aria-hidden />
            ورود کارکنان
          </Link>
        </nav>
        <button
          type="button"
          className="grid size-11 place-items-center rounded-lg text-white hover:bg-white/10 md:hidden"
          aria-label={open ? "بستن منو" : "باز کردن منو"}
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
        >
          {open ? <X className="size-5" /> : <Menu className="size-5" />}
        </button>
      </div>

      {open && (
        <nav aria-label="ناوبری موبایل" className="absolute inset-x-0 top-14 z-50 bg-navy-800 p-2 shadow-float md:hidden">
          {links.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              onClick={() => setOpen(false)}
              aria-current={isActive(pathname, href) ? "page" : undefined}
              className={cn(
                "flex min-h-12 items-center gap-3 rounded-lg px-3 text-[15px] text-white/80",
                isActive(pathname, href) && "bg-white/15 text-white",
              )}
            >
              <Icon className="size-5" aria-hidden />
              {label}
            </Link>
          ))}
          <Link href="/admin" onClick={() => setOpen(false)} className="flex min-h-12 items-center gap-3 rounded-lg px-3 text-[15px] text-white/80">
            <ShieldCheck className="size-5" aria-hidden />
            ورود کارکنان
          </Link>
        </nav>
      )}

      {isDemo && (
        <div role="note" className="flex items-center gap-2 bg-orange-100 px-4 py-1.5 text-xs text-gray-700 md:px-6">
          <FlaskConical className="size-3.5 shrink-0 text-orange-500" aria-hidden />
          <span className="truncate md:whitespace-normal" title={brand.demoNotice}>
            {brand.demoNotice}
          </span>
        </div>
      )}
    </header>
  );
}
