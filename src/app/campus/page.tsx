import type { Metadata } from "next";
import { CampusExplorer } from "@/features/campus/CampusExplorer";

export const metadata: Metadata = { title: "پردیس" };

export default function CampusPage() {
  return <CampusExplorer />;
}
