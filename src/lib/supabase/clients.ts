import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { config, isSupabaseConfigured } from "@/lib/config";

/**
 * Anonymous Supabase client for PUBLIC reads. It carries no user session, so Row Level
 * Security exposes only published/active data. Only the public anon key is used.
 */
export function createAnonClient(): SupabaseClient | null {
  if (!isSupabaseConfigured) return null;
  return createClient(config.supabaseUrl, config.supabaseAnonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
