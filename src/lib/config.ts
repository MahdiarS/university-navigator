/**
 * Runtime configuration. NEXT_PUBLIC_* variables must be referenced literally so Next.js can inline them.
 * No secret is read here: this app never uses a Supabase service-role key.
 */
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ?? "";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() ?? "";
const dataMode = (process.env.NEXT_PUBLIC_DATA_MODE ?? "demo").trim();

export const config = {
  supabaseUrl,
  supabaseAnonKey,
  dataMode,
} as const;

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

/** Public data comes from Supabase only when explicitly requested AND credentials exist. */
export const useSupabaseData = dataMode === "supabase" && isSupabaseConfigured;

/**
 * Local demo admin (no password, localStorage only).
 * Hard-gated on NODE_ENV === "development": production builds can never enable it,
 * whatever the environment variable says.
 */
export const isDemoAdminEnabled =
  process.env.NODE_ENV === "development" && process.env.NEXT_PUBLIC_DEMO_ADMIN === "true" && !useSupabaseData;

export type AdminMode = "supabase" | "demo-local" | "setup-required";

export function getAdminMode(): AdminMode {
  if (isSupabaseConfigured) return "supabase";
  if (isDemoAdminEnabled) return "demo-local";
  return "setup-required";
}
