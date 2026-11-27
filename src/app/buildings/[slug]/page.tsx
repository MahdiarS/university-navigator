import { redirect } from "next/navigation";

/** Buildings no longer have a page of their own: the campus map is the single place for maps and routes. */
export default async function BuildingPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { slug } = await params;
  const sp = await searchParams;
  const q = new URLSearchParams({ building: slug });
  for (const [k, v] of Object.entries(sp)) {
    const val = Array.isArray(v) ? v[0] : v;
    if (val && k !== "from") q.set(k, val);
  }
  redirect(`/campus?${q.toString()}`);
}
