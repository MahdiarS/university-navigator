import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { colors } from "@/lib/theme/tokens";

/** Design tokens exist twice (CSS for the UI, TS for Three.js materials). They must never drift apart. */
const css = readFileSync(path.resolve(import.meta.dirname, "../src/app/globals.css"), "utf8");

function cssColor(name: string): string | undefined {
  return css.match(new RegExp(`--color-${name}:\\s*(#[0-9a-fA-F]{6})`))?.[1]?.toLowerCase();
}

describe("design tokens", () => {
  it("keeps tokens.ts in sync with the CSS theme variables", () => {
    const toCssName = (key: string) => key.replace(/([a-z]+)(\d+)/, "$1-$2");
    for (const [key, value] of Object.entries(colors)) {
      if (key === "white") continue; // Tailwind's built-in white
      expect(cssColor(toCssName(key)), `--color-${toCssName(key)}`).toBe(value.toLowerCase());
    }
  });

  it("uses a Persian font with system fallbacks and RTL document direction", () => {
    expect(css).toMatch(/--font-sans:[^;]*Vazirmatn[^;]*system-ui/);
    const layout = readFileSync(path.resolve(import.meta.dirname, "../src/app/layout.tsx"), "utf8");
    expect(layout).toMatch(/lang="fa"/);
    expect(layout).toMatch(/dir="rtl"/);
  });
});
