"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { RESOURCES, isResourceKey } from "@/lib/data/resources";
import { createUserClient } from "@/lib/supabase/server";
import { canWrite } from "./permissions";
import { DeleteRequestSchema, friendlyDbError, prepareWrite, type SaveFailure } from "./save";
import { getStaffContext } from "./session";

/**
 * Server Actions for the admin panel. Each one re-verifies the session and role on the server; the form values are
 * the ONLY thing taken from the browser, and they are validated with Zod. Row Level Security is the second lock.
 */

export interface LoginState {
  error: string | null;
}

const LoginSchema = z.object({
  email: z.string().trim().email().max(200),
  password: z.string().min(1).max(200),
});

export async function signInAction(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const parsed = LoginSchema.safeParse({ email: formData.get("email"), password: formData.get("password") });
  if (!parsed.success) return { error: "ایمیل و گذرواژه را درست وارد کنید." };

  const client = await createUserClient();
  if (!client) return { error: "اتصال Supabase تنظیم نشده است." };

  const { error } = await client.auth.signInWithPassword(parsed.data);
  // One generic message: never reveal whether the email exists.
  if (error) return { error: "ایمیل یا گذرواژه نادرست است." };

  const ctx = await getStaffContext();
  if (ctx.status === "forbidden") {
    await client.auth.signOut();
    return { error: "این حساب دسترسی کارکنان ندارد." };
  }
  redirect("/admin");
}

export async function signOutAction(): Promise<void> {
  const client = await createUserClient();
  if (client) await client.auth.signOut();
  redirect("/admin/login");
}

export type SaveResult = { ok: true } | SaveFailure;

export async function saveRecordAction(resource: string, mode: "create" | "update", payload: unknown): Promise<SaveResult> {
  const ctx = await getStaffContext();
  if (ctx.status !== "ok") return { ok: false, error: "نشست شما معتبر نیست. دوباره وارد شوید." };

  const prepared = prepareWrite(ctx.role, resource, mode, payload);
  if (!prepared.ok) return prepared;

  const table = ctx.client.from(prepared.table);
  const { error } =
    mode === "create"
      ? await table.insert(prepared.row)
      : await table.update(withoutId(prepared.row)).eq("id", prepared.id);
  if (error) {
    console.error(`[admin] ${mode} ${prepared.table} failed:`, error.code ?? "unknown");
    return { ok: false, error: friendlyDbError(error) };
  }
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function deleteRecordAction(resource: string, id: string): Promise<SaveResult> {
  const ctx = await getStaffContext();
  if (ctx.status !== "ok") return { ok: false, error: "نشست شما معتبر نیست. دوباره وارد شوید." };

  const parsed = DeleteRequestSchema.safeParse({ resource, id });
  if (!parsed.success || !isResourceKey(parsed.data.resource)) return { ok: false, error: "درخواست نامعتبر است." };
  if (!canWrite(ctx.role, parsed.data.resource, "delete")) return { ok: false, error: "شما اجازه‌ی حذف ندارید." };

  const { error } = await ctx.client.from(RESOURCES[parsed.data.resource].table).delete().eq("id", parsed.data.id);
  if (error) {
    console.error(`[admin] delete ${parsed.data.resource} failed:`, error.code ?? "unknown");
    return { ok: false, error: friendlyDbError(error) };
  }
  revalidatePath("/", "layout");
  return { ok: true };
}

/** The primary key is never rewritten by an update. */
function withoutId(row: Record<string, unknown>): Record<string, unknown> {
  const { id: _id, ...rest } = row;
  return rest;
}
