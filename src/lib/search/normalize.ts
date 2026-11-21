/**
 * Persian/Arabic-tolerant text normalisation used for searching.
 *
 * Handles:
 *  - Arabic vs Persian letter forms: ي/ى -> ی, ك -> ک, ة/ۀ -> ه, أ/إ/آ/ٱ -> ا, ؤ -> و, ئ -> ی
 *  - Persian (۰-۹) and Arabic-Indic (٠-٩) digits -> ASCII digits
 *  - diacritics (harakat), tatweel, zero-width joiners (ZWNJ is treated as a space)
 *  - punctuation, repeated whitespace, Latin case
 */
const DIGIT_MAP: Record<string, string> = {};
"۰۱۲۳۴۵۶۷۸۹".split("").forEach((d, i) => (DIGIT_MAP[d] = String(i)));
"٠١٢٣٤٥٦٧٨٩".split("").forEach((d, i) => (DIGIT_MAP[d] = String(i)));

export function normalizeText(input: string): string {
  return input
    .normalize("NFKC")
    .replace(/[۰-۹٠-٩]/g, (d) => DIGIT_MAP[d] ?? d)
    .replace(/[يىئ]/g, "ی")
    .replace(/ك/g, "ک")
    .replace(/[ةۀ]/g, "ه")
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ؤ/g, "و")
    .replace(/[ً-ٰٟـ]/g, "") // harakat + superscript alef + tatweel
    .replace(/[​-‏‪-‮⁦-⁩﻿]/g, " ") // ZWNJ/ZWJ/bidi marks -> space
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Same as normalizeText but with every space removed ("ثبت نام" and "ثبت‌نام" and "ثبتنام" all collapse alike). */
export function compactText(input: string): string {
  return normalizeText(input).replace(/\s+/g, "");
}

export function tokenize(input: string): string[] {
  const n = normalizeText(input);
  return n ? n.split(" ") : [];
}

const PERSIAN_DIGITS = "۰۱۲۳۴۵۶۷۸۹";

/** Convert ASCII digits in a string/number to Persian digits for display. */
export function toPersianDigits(value: string | number): string {
  return String(value).replace(/\d/g, (d) => PERSIAN_DIGITS[Number(d)] ?? d);
}
