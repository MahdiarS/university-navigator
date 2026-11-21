import { ArrowLeft, BookOpen, Building2, GraduationCap, Landmark, Layers, Route, Search, Users, Wallet } from "lucide-react";
import Link from "next/link";
import { ButtonLink } from "@/components/ui/Button";
import { Footer } from "@/components/layout/Footer";
import { DemoBadge } from "@/components/ui/Badge";
import { CampusPreview } from "@/features/home/CampusPreview";
import { HeroSearch } from "@/features/home/HeroSearch";
import { PILOT_BUILDING_SLUG, brand } from "@/lib/brand";
import { buildLookups } from "@/lib/data/lookups";
import { getNavigatorData } from "@/lib/data/repository";
import { toPersianDigits } from "@/lib/search/normalize";

/** Quick links are searches, not claims about the university: they work with any dataset. */
const CATEGORIES = [
  { label: "آموزش و ثبت‌نام", query: "ثبت‌نام", icon: GraduationCap },
  { label: "امور مالی و شهریه", query: "شهریه", icon: Wallet },
  { label: "امور دانشجویی", query: "دانشجویی", icon: Users },
  { label: "دبیرخانه و نامه‌ها", query: "نامه", icon: Landmark },
  { label: "کتابخانه", query: "کتابخانه", icon: BookOpen },
] as const;

const STEPS = [
  { icon: Search, title: "جستجو", text: "نام واحد یا خدمت مورد نیازتان را بنویسید." },
  { icon: Layers, title: "دیدن روی نقشه", text: "طبقه و اتاق در مدل سه‌بعدی ساختمان مشخص می‌شود." },
  { icon: Route, title: "مسیریابی", text: "نقطه شروع را انتخاب کنید و مسیر گام‌به‌گام را ببینید." },
] as const;

export default async function Home() {
  const data = await getNavigatorData();
  const lookups = buildLookups(data);
  const buildings = data.buildings.filter((b) => b.isActive);
  const pilot = lookups.buildingsBySlug.get(PILOT_BUILDING_SLUG);

  return (
    <>
    <main className="flex-1">
      <section className="border-b border-gray-200 bg-white">
        <div className="mx-auto grid max-w-6xl items-center gap-8 px-4 py-8 md:grid-cols-[1.05fr_1fr] md:gap-12 md:px-6 md:py-14">
          <div className="space-y-6">
            <div className="space-y-3">
              <p className="text-sm font-medium text-teal-600">{brand.universityPlaceholder} · راهنمای ورودی‌ها و مراجعان</p>
              <h1 className="text-3xl font-bold leading-[1.5] text-navy-900 md:text-4xl md:leading-[1.5]">
                دفتر مورد نظرتان را پیدا کنید،
                <br />
                مسیرش را روی نقشه سه‌بعدی ببینید
              </h1>
              <p className="max-w-xl text-[15px] leading-8 text-gray-700">
                {brand.tagline}. بدون ثبت‌نام و ورود؛ فقط جستجو کنید، طبقه را انتخاب کنید و مسیر را دنبال کنید.
              </p>
            </div>
            <HeroSearch />
            <ul className="flex flex-wrap gap-2" aria-label="دسته‌بندی خدمات">
              {CATEGORIES.map(({ label, query, icon: Icon }) => (
                <li key={label}>
                  <Link href={`/search?q=${encodeURIComponent(query)}`} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-gray-200 bg-gray-50 px-3.5 text-sm text-navy-800 hover:border-blue-400 hover:bg-white">
                    <Icon className="size-4 text-blue-600" aria-hidden />
                    {label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
          <CampusPreview />
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-10 md:px-6" aria-labelledby="entry">
        <div className="flex flex-col gap-6 overflow-hidden rounded-3xl bg-navy-900 p-6 text-white md:flex-row md:items-center md:justify-between md:p-8">
          <div className="space-y-2">
            <p className="flex items-center gap-2 text-xs text-white/60"><Building2 className="size-4" aria-hidden />ساختمان آزمایشی (پایلوت)</p>
            <h2 id="entry" className="text-xl font-bold md:text-2xl">{pilot?.name ?? "ساختمان نمونه"}</h2>
            <p className="max-w-xl text-sm leading-7 text-white/75">
              نمای ایزومتریک با طبقات قابل‌جداسازی (Exploded View)، انتخاب اتاق‌ها و مسیریابی داخلی.
              {pilot ? ` ${toPersianDigits(lookups.floorsByBuilding.get(pilot.id)?.length ?? 0)} طبقه‌ی نمونه.` : ""}
            </p>
          </div>
          <ButtonLink href={`/buildings/${PILOT_BUILDING_SLUG}`} size="lg" variant="secondary" className="shrink-0 border-transparent">
            ورود به نقشه سه‌بعدی ساختمان
            <ArrowLeft className="size-5" aria-hidden />
          </ButtonLink>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 pb-10 md:px-6" aria-labelledby="how">
        <h2 id="how" className="mb-4 text-lg font-bold">چگونه کار می‌کند</h2>
        <ol className="grid gap-3 md:grid-cols-3">
          {STEPS.map(({ icon: Icon, title, text }, i) => (
            <li key={title} className="flex gap-3 rounded-2xl border border-gray-200 bg-white p-4">
              <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-blue-100 text-blue-600"><Icon className="size-5" aria-hidden /></span>
              <div>
                <h3 className="text-[15px] font-bold">{toPersianDigits(i + 1)}. {title}</h3>
                <p className="mt-1 text-sm leading-7 text-gray-500">{text}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section className="mx-auto max-w-6xl px-4 pb-14 md:px-6" aria-labelledby="buildings">
        <h2 id="buildings" className="mb-4 text-lg font-bold">ساختمان‌ها</h2>
        <ul className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {buildings.map((b) => (
            <li key={b.id}>
              <Link href={`/buildings/${b.slug}`} className="flex min-h-20 items-center justify-between gap-3 rounded-2xl border border-gray-200 bg-white p-4 hover:border-blue-400">
                <span className="min-w-0">
                  <span className="flex flex-wrap items-center gap-2 text-[15px] font-bold">{b.name}{b.isDemo && <DemoBadge />}</span>
                  <span className="mt-1 block text-xs text-gray-500">{toPersianDigits(lookups.floorsByBuilding.get(b.id)?.length ?? 0)} طبقه</span>
                </span>
                <ArrowLeft className="size-4 shrink-0 text-gray-300" aria-hidden />
              </Link>
            </li>
          ))}
          <li className="flex min-h-20 items-center rounded-2xl border border-dashed border-gray-300 p-4 text-sm text-gray-500">
            ساختمان‌های دیگر پس از دریافت نقشه‌های رسمی اضافه می‌شوند.
          </li>
        </ul>
      </section>
    </main>
    <Footer />
    </>
  );
}
