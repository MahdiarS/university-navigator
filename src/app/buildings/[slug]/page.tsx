import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { BuildingExplorer } from "@/features/buildings/BuildingExplorer";
import { getNavigatorData } from "@/lib/data/repository";

type Params = { slug: string };

export async function generateStaticParams(): Promise<Params[]> {
  const data = await getNavigatorData();
  return data.buildings.filter((b) => b.isActive).map((b) => ({ slug: b.slug }));
}

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { slug } = await params;
  const data = await getNavigatorData();
  const building = data.buildings.find((b) => b.slug === slug);
  return { title: building ? `نقشه سه‌بعدی ${building.name}` : "ساختمان" };
}

export default async function BuildingPage({ params }: { params: Promise<Params> }) {
  const { slug } = await params;
  const data = await getNavigatorData();
  if (!data.buildings.some((b) => b.slug === slug && b.isActive)) notFound();
  return (
    <Suspense fallback={<div className="un-viewer-bg flex-1" />}>
      <BuildingExplorer slug={slug} />
    </Suspense>
  );
}
