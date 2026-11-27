import "server-only";
import { cache } from "react";
import { useSupabaseData } from "@/lib/config";
import { createAnonClient } from "@/lib/supabase/clients";
import { loadDemoData, manifestInput } from "./demo-source";
import { loadSupabaseData } from "./supabase-source";
import type { NavigatorData } from "./types";

/**
 * Data access entry point for server components.
 * - demo mode (default): local, validated data from data/indoor and data/campus.
 * - supabase mode: published data through the anon client (RLS-protected).
 * If Supabase is requested but unreachable, we fall back to demo data and say so via `source`.
 */
export const getNavigatorData = cache(async function getNavigatorData(): Promise<NavigatorData> {
  if (!useSupabaseData) return loadDemoData();
  const client = createAnonClient();
  if (!client) return loadDemoData();
  try {
    return await loadSupabaseData(client, manifestInput);
  } catch (error) {
    // Log a short message only; never surface internals to end users.
    console.error("[data] Supabase load failed, using demo data:", error instanceof Error ? error.message : "unknown");
    return loadDemoData();
  }
});
