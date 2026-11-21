import { describe, expect, it } from "vitest";
import { buildSearchIndex, search } from "@/lib/search/engine";
import { compactText, normalizeText, toPersianDigits } from "@/lib/search/normalize";
import { data } from "../navigation/helpers";

const index = buildSearchIndex(data);
const titles = (q: string, o = {}) => search(index, q, o).map((h) => h.title);

describe("Persian normalisation", () => {
  it("unifies Arabic and Persian letter forms", () => {
    expect(normalizeText("امور مالي")).toBe(normalizeText("امور مالی"));
    expect(normalizeText("كتابخانه")).toBe(normalizeText("کتابخانه"));
    expect(normalizeText("ي ك")).toBe("ی ک");
  });
  it("unifies digits, ZWNJ, tatweel and whitespace", () => {
    expect(normalizeText("اتاق ۲۰۱")).toBe("اتاق 201");
    expect(normalizeText("اتاق ٢٠١")).toBe("اتاق 201");
    expect(normalizeText("ثبت‌نام")).toBe("ثبت نام");
    expect(normalizeText("  ثبت   نام  ")).toBe("ثبت نام");
    expect(compactText("ثبت‌نام")).toBe(compactText("ثبت نام"));
    expect(normalizeText("کـتـاب")).toBe("کتاب");
  });
  it("renders Persian digits for display", () => {
    expect(toPersianDigits("اتاق 201")).toBe("اتاق ۲۰۱");
    expect(toPersianDigits(35)).toBe("۳۵");
  });
});

describe("search", () => {
  it("finds a department by name, with Arabic variants and extra whitespace", () => {
    expect(titles("امور مالی")[0]).toBe("امور مالی");
    expect(titles("امور  مالي")[0]).toBe("امور مالی");
    expect(titles("كتابخانه")[0]).toBe("کتابخانه");
  });
  it("finds a department by service name and keyword (ZWNJ / space / joined variants)", () => {
    expect(titles("ثبت نام")[0]).toBe("اداره آموزش");
    expect(titles("ثبت‌نام")[0]).toBe("اداره آموزش");
    expect(titles("ثبتنام")[0]).toBe("اداره آموزش");
    expect(titles("شهریه")[0]).toBe("امور مالی");
    expect(titles("وام")[0]).toBe("امور دانشجویی");
    expect(titles("رمز عبور")[0]).toBe("مرکز فناوری اطلاعات");
  });
  it("finds departments by English keywords", () => {
    expect(titles("finance")[0]).toBe("امور مالی");
    expect(titles("student affairs")[0]).toBe("امور دانشجویی");
  });
  it("finds by room number, in Persian or Latin digits", () => {
    expect(titles("۱۰۱")).toContain("امور مالی");
    expect(titles("101")).toContain("امور مالی");
    // room 201 hosts two departments
    const t = titles("201");
    expect(t).toContain("دبیرخانه");
    expect(t).toContain("بایگانی");
  });
  it("finds by the natural phrase \"اتاق ۱۰۱\" / \"room 101\" (label word + number)", () => {
    expect(titles("اتاق ۱۰۱")).toEqual(["امور مالی"]);
    expect(titles("room 101")).toEqual(["امور مالی"]);
    expect(titles("اتاق 201")).toEqual(expect.arrayContaining(["دبیرخانه", "بایگانی"]));
  });
  it("finds by floor and building and can filter", () => {
    expect(titles("طبقه دوم")).toEqual(expect.arrayContaining(["دبیرخانه", "مرکز فناوری اطلاعات"]));
    expect(titles("همکف")).toEqual(expect.arrayContaining(["اداره آموزش", "امور دانشجویی"]));
    const f1 = search(index, "", { floorId: "floor-01" });
    expect(f1.every((h) => h.floor.id === "floor-01")).toBe(true);
    expect(search(index, "ساختمان نمونه").length).toBeGreaterThan(5);
  });
  it("includes rooms without a department (e.g. restrooms)", () => {
    const hits = search(index, "سرویس بهداشتی");
    expect(hits.length).toBe(3);
    expect(hits.every((h) => h.kind === "room")).toBe(true);
  });
  it("requires every word to match, and returns nothing for gibberish", () => {
    expect(search(index, "امور مالی کتابخانه")).toEqual([]);
    expect(search(index, "zzzzqqq")).toEqual([]);
  });
  it("lists all departments for an empty query, ordered by floor", () => {
    const all = search(index, "");
    expect(all).toHaveLength(data.departments.length);
    const nums = all.map((h) => h.floor.floorNumber);
    expect([...nums].sort((a, b) => a - b)).toEqual(nums);
  });
  it("hides inactive departments", () => {
    const inactive = {
      ...data,
      departments: data.departments.map((d) => (d.slug === "library" ? { ...d, isActive: false } : d)),
    };
    const idx = buildSearchIndex(inactive);
    expect(search(idx, "کتابخانه").some((h) => h.department?.slug === "library")).toBe(false);
  });
});
