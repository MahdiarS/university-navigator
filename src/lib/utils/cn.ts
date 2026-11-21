/** Tiny class-name joiner (keeps the dependency list short). Falsy values are skipped. */
export function cn(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(" ");
}
