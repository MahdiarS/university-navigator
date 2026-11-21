import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import { DataProvider } from "@/components/DataProvider";
import { Header } from "@/components/layout/Header";
import { brand } from "@/lib/brand";
import { getNavigatorData } from "@/lib/data/repository";

export const metadata: Metadata = {
  title: { default: `${brand.productFa} | ${brand.productEn}`, template: `%s | ${brand.productFa}` },
  description: brand.tagline,
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#0b1f3a",
};

/** Published data changes rarely; admin saves also call revalidatePath. */
export const revalidate = 300;

export default async function RootLayout({ children }: { children: ReactNode }) {
  const data = await getNavigatorData();
  return (
    <html lang="fa" dir="rtl">
      <body className="flex h-dvh flex-col overflow-hidden bg-gray-50 text-navy-900 antialiased">
        <DataProvider initialData={data}>
          <Header />
          <div id="main-scroll" className="flex min-h-0 flex-1 flex-col overflow-y-auto">{children}</div>
        </DataProvider>
      </body>
    </html>
  );
}
