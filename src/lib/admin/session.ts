import "server-only";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { createUserClient } from "@/lib/supabase/server";
import { isStaffRole, type StaffRole } from "./permissions";

export type StaffContext =
  | { status: "unconfigured" }
  | { status: "anonymous" }
  /** signed in, but there is no staff profile for this account (or the role is unknown) */
  | { status: "forbidden"; email: string | null }
  | { status: "ok"; client: SupabaseClient; user: User; role: StaffRole; fullName: string };

/**
 * Authoritative server-side identity check, used by every admin page and every server action.
 *  1. auth.getUser() asks the Supabase Auth server to validate the session (cookies alone are not trusted).
 *  2. the role is read from public.profiles through the user's own client, so RLS applies.
 * The browser can never supply or influence the role.
 */
export async function getStaffContext(): Promise<StaffContext> {
  const client = await createUserClient();
  if (!client) return { status: "unconfigured" };

  const { data, error } = await client.auth.getUser();
  if (error || !data.user) return { status: "anonymous" };

  const { data: profile, error: profileError } = await client
    .from("profiles")
    .select("role, full_name")
    .eq("user_id", data.user.id)
    .maybeSingle();
  if (profileError || !profile || !isStaffRole(profile.role)) {
    return { status: "forbidden", email: data.user.email ?? null };
  }
  return { status: "ok", client, user: data.user, role: profile.role, fullName: String(profile.full_name ?? "") };
}
