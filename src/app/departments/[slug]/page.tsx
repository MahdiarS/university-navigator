import { ArrowRight, Building2, DoorOpen, Layers, MapPin, Navigation, Tags } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Footer } from "@/components/layout/Footer";
import { DemoBadge } from "@/components/ui/Badge";
import { ButtonLink } from "@/components/ui/Button";
import { ContactFacts, Fact, ServiceChips } from "@/features/departments/DepartmentFacts";
import { buildLookups } from "@/lib/data/lookups";
import { getNavigatorData } from "@/lib/data/repository";
import { toPersianDigits } from "@/lib/search/normalize";

type Params = { slug: string };

export async function generateStaticParams(): Promise<Params[]> {
  const data = await getNavigatorData();
  return data.departments.filter((d) => d.isActive).map((d) => ({ slug: d.slug }));
}

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { slug } = await params;
  const data = await getNavigatorData();
  const dept = data.departments.find((d) => d.slug === slug && d.isActive);
  return { title: dept ? dept.name : "واحد پیدا نشد" };
}

export default async function DepartmentPage({ params }: { params: Promise<Params> }) {
  const { slug } = await params;
  const data = await getNavigatorData();
  const lookups = buildLookups(data);

  const dept = lookups.departmentsBySlug.get(slug);
  if (!dept || !dept.isActive) notFound();
  const room = lookups.roomsById.get(dept.roomId);
  const floor = room ? lookups.floorsById.get(room.floorId) : undefined;
  const building = floor ? lookups.buildingsById.get(floor.buildingId) : undefined;
  const services = (lookups.servicesByDepartment.get(dept.id) ?? []).map((s) => s.serviceName);
  const roommates = room ? (lookups.departmentsByRoom.get(room.id) ?? []).filter((d) => d.id !== dept.id && d.isActive) : [];

  const mapHref = building ? `/buildings/${building.slug}?dept=${dept.slug}` : null;
  const navHref = mapHref ? `${mapHref}&navigate=1` : null;
  const canRoute = Boolean(room?.doorNodeId);

  return (
    <>
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-6 md:px-6 md:py-10">
      <Link href="/search" className="mb-4 inline-flex min-h-9 items-center gap-1 text-sm text-gray-500 hover:text-navy-800">
        <ArrowRight className="size-4" aria-hidden />
        بازگشت به جستجو
      </Link>

      <article className="space-y-6 rounded-2xl border border-gray-200 bg-white p-5 shadow-panel md:p-8">
        <header className="space-y-2">
          <h1 className="flex flex-wrap items-center gap-3 text-2xl font-bold leading-9">
            {dept.name}
            {dept.isDemo && <DemoBadge />}
          </h1>
          {dept.description ? (
            <p className="text-[15px] leading-8 text-gray-700">{dept.description}</p>
          ) : (
            <p className="text-sm text-gray-500">توضیحاتی ثبت نشده است.</p>
          )}
        </header>

        <div className="flex flex-wrap gap-2">
          {navHref && (
            canRoute ? (
              <ButtonLink href={navHref} size="lg">
                <Navigation className="size-5" aria-hidden />
                مسیریابی تا این دفتر
              </ButtonLink>
            ) : (
              <span className="inline-flex min-h-12 items-center rounded-xl bg-gray-100 px-5 text-sm text-gray-500">مسیر این دفتر ثبت نشده است</span>
            )
          )}
          {mapHref && (
            <ButtonLink href={mapHref} size="lg" variant="secondary">
              <MapPin className="size-5" aria-hidden />
              نمایش روی نقشه
            </ButtonLink>
          )}
        </div>

        <section aria-labelledby="loc">
          <h2 id="loc" className="mb-3 text-sm font-bold text-gray-700">موقعیت</h2>
          <dl className="grid gap-3 sm:grid-cols-3">
            <Fact icon={<Building2 className="size-4" aria-hidden />} label="ساختمان" value={building?.name ?? null} />
            <Fact icon={<Layers className="size-4" aria-hidden />} label="طبقه" value={floor?.displayName ?? null} />
            <Fact icon={<DoorOpen className="size-4" aria-hidden />} label="شماره اتاق" value={room ? toPersianDigits(room.roomNumber) : null} />
          </dl>
        </section>

        <section aria-labelledby="contact">
          <h2 id="contact" className="mb-3 text-sm font-bold text-gray-700">تماس و ساعت کاری</h2>
          <ContactFacts department={dept} />
        </section>

        <section aria-labelledby="svc">
          <h2 id="svc" className="mb-3 text-sm font-bold text-gray-700">خدمات</h2>
          <ServiceChips names={services} />
        </section>

        {dept.keywords.length > 0 && (
          <section aria-labelledby="kw">
            <h2 id="kw" className="mb-3 flex items-center gap-1.5 text-sm font-bold text-gray-700">
              <Tags className="size-4" aria-hidden />
              کلیدواژه‌های جستجو
            </h2>
            <ul className="flex flex-wrap gap-1.5">
              {dept.keywords.map((k) => (
                <li key={k} className="rounded-full border border-gray-200 px-2.5 py-1 text-xs text-gray-700">{k}</li>
              ))}
            </ul>
          </section>
        )}

        {roommates.length > 0 && (
          <section aria-labelledby="same-room">
            <h2 id="same-room" className="mb-3 text-sm font-bold text-gray-700">واحدهای دیگر در همین اتاق</h2>
            <ul className="space-y-1.5 text-sm">
              {roommates.map((d) => (
                <li key={d.id}><Link href={`/departments/${d.slug}`} className="text-blue-600 hover:underline">{d.name}</Link></li>
              ))}
            </ul>
          </section>
        )}

        {dept.isDemo && (
          <p className="rounded-xl bg-orange-100 p-3 text-xs leading-6 text-gray-700">
            این صفحه نمونه (دمو) است؛ نام، مکان و خدمات فرضی‌اند و اطلاعات رسمی دانشگاه نیستند. تلفن و ساعت کاری عمداً ثبت نشده‌اند.
          </p>
        )}
      </article>
    </main>
    <Footer />
    </>
  );
}
