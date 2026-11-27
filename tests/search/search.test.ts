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
  it("finds a professor by name, with Arabic variants and extra whitespace", () => {
    expect(titles("علیرضا حریری")[0]).toBe("علیرضا حریری ایرج");
    expect(titles("علیرضا  حریری")[0]).toBe("علیرضا حریری ایرج");
    expect(titles("حريري")[0]).toBe("علیرضا حریری ایرج");
  });
  it("finds by room number, in Persian or Latin digits", () => {
    expect(titles("۴۳۰")).toContain("علیرضا حریری ایرج");
    expect(titles("430")).toContain("علیرضا حریری ایرج");
  });
  it("finds the natural phrase \"دفتر 430 ساختمان 2 علیرضا حریری\" (several words, all must match)", () => {
    const hits = search(index, "دفتر 430 ساختمان 2 علیرضا حریری");
    expect(hits.map((h) => h.title)).toEqual(["علیرضا حریری ایرج"]);
    expect(hits[0]!.room.id).toBe("campus-b2-r430");
  });
  it("finds by building and can filter by building and floor", () => {
    const b2 = search(index, "", { buildingId: "campus-b2" });
    expect(b2.length).toBeGreaterThan(5);
    expect(b2.every((h) => h.floor.buildingId === "campus-b2")).toBe(true);
    const f1 = search(index, "", { floorId: "campus-b1-f1" });
    expect(f1.every((h) => h.floor.id === "campus-b1-f1")).toBe(true);
    expect(search(index, "طبقه اول").length).toBeGreaterThan(5);
  });
  it("includes rooms without a department (e.g. restrooms)", () => {
    const hits = search(index, "سرویس بهداشتی");
    expect(hits.length).toBeGreaterThanOrEqual(2);
    expect(hits.every((h) => h.kind === "room")).toBe(true);
  });
  it("requires every word to match, and returns nothing for gibberish", () => {
    expect(search(index, "حریری زرین‌کلاه‌ناموجود")).toEqual([]);
    expect(search(index, "zzzzqqq")).toEqual([]);
  });
  it("lists every active department for an empty query, ordered by floor", () => {
    const all = search(index, "", { limit: 1000 });
    expect(all.length).toBeGreaterThanOrEqual(data.departments.length);
    const nums = all.map((h) => h.floor.floorNumber);
    expect([...nums].sort((a, b) => a - b)).toEqual(nums);
  });
  it("hides inactive departments", () => {
    const target = data.departments[0]!;
    const inactive = { ...data, departments: data.departments.map((d) => (d.id === target.id ? { ...d, isActive: false } : d)) };
    const idx = buildSearchIndex(inactive);
    expect(search(idx, "", { limit: 1000 }).some((h) => h.department?.id === target.id)).toBe(false);
  });
});
