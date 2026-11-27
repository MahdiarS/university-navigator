"use client";
import { ExternalLink, MapPin, Navigation, X } from "lucide-react";
import Link from "next/link";
import { useNavigator } from "@/components/DataProvider";
import { Button, buttonStyles, IconButton } from "@/components/ui/Button";
import { ContactFacts, ServiceChips } from "@/features/departments/DepartmentFacts";
import type { Room } from "@/lib/data/types";
import { toPersianDigits } from "@/lib/search/normalize";

const ROOM_TYPE_FA: Record<string, string> = {
  office: "دفتر",
  classroom: "کلاس",
  lab: "آزمایشگاه",
  meeting: "اتاق جلسات",
  study: "سالن مطالعه",
  library: "کتابخانه",
  lobby: "لابی",
  restroom: "سرویس بهداشتی",
  hall: "سالن",
  other: "فضای عمومی",
};

/** Details of the selected room: its departments (a room may host several), services, and the route action. */
export function RoomDetails({
  room,
  onNavigate,
  onClose,
}: {
  room: Room;
  /** when given, shows the «مسیریابی» button */
  onNavigate?: (roomId: string) => void;
  onClose: () => void;
}) {
  const { lookups } = useNavigator();
  const floor = lookups.floorsById.get(room.floorId);
  const building = floor ? lookups.buildingsById.get(floor.buildingId) : undefined;
  const departments = (lookups.departmentsByRoom.get(room.id) ?? []).filter((d) => d.isActive);

  return (
    <section aria-label="جزئیات اتاق" className="space-y-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="mb-1 flex flex-wrap items-center gap-2 text-xs text-gray-500">
            <MapPin className="size-3.5" aria-hidden />
            {building?.name} · {floor?.displayName} · اتاق {toPersianDigits(room.roomNumber)}
          </p>
          <h2 className="text-lg font-bold leading-7">{departments.length === 1 ? departments[0]!.name : room.name}</h2>
          <p className="text-xs text-gray-500">{ROOM_TYPE_FA[room.roomType] ?? ROOM_TYPE_FA.other}</p>
        </div>
        <IconButton label="بستن جزئیات" onClick={onClose} className="size-10 shrink-0 border-transparent">
          <X className="size-5" />
        </IconButton>
      </div>

      {onNavigate && (
        <Button size="lg" className="w-full" onClick={() => onNavigate(room.id)} disabled={!room.doorNodeId}>
          <Navigation className="size-5" aria-hidden />
          {room.doorNodeId ? "مسیریابی تا اینجا" : "مسیر این اتاق ثبت نشده است"}
        </Button>
      )}

      {departments.length === 0 ? (
        <p className="rounded-xl bg-gray-100 p-3 text-sm text-gray-700">برای این اتاق واحد اداری ثبت نشده است.</p>
      ) : (
        departments.map((d) => {
          const services = (lookups.servicesByDepartment.get(d.id) ?? []).map((s) => s.serviceName);
          return (
            <article key={d.id} className="space-y-3 rounded-xl border border-gray-200 p-3">
              {departments.length > 1 && <h3 className="text-[15px] font-bold">{d.name}</h3>}
              {d.description && <p className="text-sm leading-7 text-gray-700">{d.description}</p>}
              <ContactFacts department={d} />
              <div>
                <h4 className="mb-1.5 text-xs font-medium text-gray-500">خدمات</h4>
                <ServiceChips names={services} />
              </div>
              <Link href={`/departments/${d.slug}`} className={buttonStyles("secondary", "sm", "w-full")}>
                <ExternalLink className="size-4" aria-hidden />
                صفحه کامل واحد
              </Link>
            </article>
          );
        })
      )}
    </section>
  );
}
