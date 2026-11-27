import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { buildLookups } from "@/lib/data/lookups";
import { getNavigatorData } from "@/lib/data/repository";

export const metadata: Metadata = { title: "مسیریابی" };

/** /directions?to=<department slug | room id> opens the campus map with the route to that destination. */
export default async function DirectionsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const to = Array.isArray(sp["to"]) ? sp["to"][0] : sp["to"];
  if (to) {
    const lookups = buildLookups(await getNavigatorData());
    const dept = lookups.departmentsBySlug.get(to);
    const room = dept ? lookups.roomsById.get(dept.roomId) : lookups.roomsById.get(to);
    if (room) redirect(`/campus?${dept ? "dept" : "room"}=${encodeURIComponent(dept ? dept.slug : room.id)}&navigate=1`);
  }
  redirect("/campus");
}
