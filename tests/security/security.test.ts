import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { canWrite, isStaffRole } from "@/lib/admin/permissions";
import { prepareWrite } from "@/lib/admin/save";
import { RESOURCES } from "@/lib/data/resources";
import type { ResourceKey } from "@/lib/data/types";

const root = path.resolve(import.meta.dirname, "../..");
const read = (rel: string) => readFileSync(path.join(root, rel), "utf8");

/** Comments may legitimately say "we never use a service-role key"; only executable code is scanned. */
const stripComments = (text: string) => text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*(\/\/|#).*$/gm, "");

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

const RESOURCE_KEYS = Object.keys(RESOURCES) as ResourceKey[];
const ADMIN_ONLY: ResourceKey[] = RESOURCE_KEYS.filter((k) => !["departments", "services", "rooms"].includes(k));

describe("admin authorisation rules (application layer)", () => {
  it("lets public / unknown roles write nothing", () => {
    for (const role of [null, undefined] as const) {
      for (const key of RESOURCE_KEYS) {
        for (const op of ["create", "update", "delete"] as const) expect(canWrite(role, key, op)).toBe(false);
      }
    }
    // A role string coming from the browser is never a valid role unless it is exactly admin|editor.
    for (const forged of ["superadmin", "ADMIN", "root", "", "admin ", "editor,admin"]) {
      expect(isStaffRole(forged)).toBe(false);
    }
  });

  it("limits editors to departments, services and rooms, and to deleting services only", () => {
    for (const key of ["departments", "services", "rooms"] as const) {
      expect(canWrite("editor", key, "create")).toBe(true);
      expect(canWrite("editor", key, "update")).toBe(true);
    }
    expect(canWrite("editor", "services", "delete")).toBe(true);
    expect(canWrite("editor", "departments", "delete")).toBe(false);
    expect(canWrite("editor", "rooms", "delete")).toBe(false);
    for (const key of ADMIN_ONLY) {
      for (const op of ["create", "update", "delete"] as const) expect(canWrite("editor", key, op)).toBe(false);
    }
  });

  it("lets admins write every resource", () => {
    for (const key of RESOURCE_KEYS) {
      for (const op of ["create", "update", "delete"] as const) expect(canWrite("admin", key, op)).toBe(true);
    }
  });

  it("rejects writes before validation when the caller has no permission (public users cannot write)", () => {
    const res = prepareWrite(null, "departments", "create", { id: "x-dept", name: "x" });
    expect(res.ok).toBe(false);
    const forbidden = prepareWrite("editor", "buildings", "update", { id: "building-01" });
    expect(forbidden.ok).toBe(false);
  });

  it("rejects unknown resources and non-object payloads, and validates input with Zod", () => {
    expect(prepareWrite("admin", "profiles", "create", {}).ok).toBe(false); // profiles are not editable from the app
    expect(prepareWrite("admin", "departments; drop table", "create", {}).ok).toBe(false);
    expect(prepareWrite("admin", "departments", "create", "nope").ok).toBe(false);
    expect(prepareWrite("admin", "departments", "create", [1, 2]).ok).toBe(false);
    const invalid = prepareWrite("admin", "departments", "create", { id: "ab", slug: "Bad Slug!", name: "" });
    expect(invalid.ok).toBe(false);
    if (!invalid.ok) expect(Object.keys(invalid.fieldErrors ?? {}).length).toBeGreaterThan(0);
  });

  it("refuses unsafe model URLs in admin input (path traversal, javascript:)", () => {
    const base = { id: "building-02", name: "Demo", slug: "building-02", description: null, isActive: true, isDemo: true };
    for (const modelUrl of ["../secret.glb", "javascript:alert(1)", "http://insecure.example/x.glb", "/models/../x.glb"]) {
      expect(prepareWrite("admin", "buildings", "create", { ...base, modelUrl }).ok, modelUrl).toBe(false);
    }
    expect(prepareWrite("admin", "buildings", "create", { ...base, modelUrl: "/models/building-02/exterior.glb" }).ok).toBe(true);
  });
});

describe("local demo admin cannot exist in production", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  async function loadConfig(env: Record<string, string>) {
    vi.resetModules();
    for (const [k, v] of Object.entries(env)) vi.stubEnv(k, v);
    return import("@/lib/config");
  }

  it("is disabled in production even when NEXT_PUBLIC_DEMO_ADMIN=true", async () => {
    const cfg = await loadConfig({ NODE_ENV: "production", NEXT_PUBLIC_DEMO_ADMIN: "true", NEXT_PUBLIC_SUPABASE_URL: "", NEXT_PUBLIC_SUPABASE_ANON_KEY: "" });
    expect(cfg.isDemoAdminEnabled).toBe(false);
    expect(cfg.getAdminMode()).toBe("setup-required");
  });

  it("is available only in development, only when requested, and never together with Supabase data", async () => {
    const dev = await loadConfig({ NODE_ENV: "development", NEXT_PUBLIC_DEMO_ADMIN: "true", NEXT_PUBLIC_SUPABASE_URL: "", NEXT_PUBLIC_SUPABASE_ANON_KEY: "" });
    expect(dev.getAdminMode()).toBe("demo-local");
    const off = await loadConfig({ NODE_ENV: "development", NEXT_PUBLIC_DEMO_ADMIN: "false", NEXT_PUBLIC_SUPABASE_URL: "", NEXT_PUBLIC_SUPABASE_ANON_KEY: "" });
    expect(off.getAdminMode()).toBe("setup-required");
  });

  it("uses real authentication once Supabase is configured", async () => {
    const cfg = await loadConfig({ NODE_ENV: "production", NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co", NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon-key" });
    expect(cfg.getAdminMode()).toBe("supabase");
    expect(cfg.isDemoAdminEnabled).toBe(false);
  });
});

describe("Row Level Security policies in database/schema.sql", () => {
  const sql = read("database/schema.sql");
  const tables = [...sql.matchAll(/create table if not exists public\.(\w+)/g)].map((m) => m[1]!);

  it("covers every core table", () => {
    for (const t of ["buildings", "floors", "rooms", "departments", "department_services", "entrances", "navigation_nodes", "navigation_edges", "facilities", "profiles"]) {
      expect(tables).toContain(t);
    }
  });

  it("enables RLS on every table", () => {
    for (const t of tables) expect(sql, `RLS on ${t}`).toMatch(new RegExp(`alter table public\\.${t}\\s+enable row level security`));
  });

  it("gives anonymous visitors read-only access and no access to profiles", () => {
    const grants = [...sql.matchAll(/\bgrant\s([\s\S]*?)\sto\s([\s\S]*?);/g)].map((m) => ({ privileges: m[1]!, to: m[2]! }));
    const anonGrants = grants.filter((g) => /\banon\b/.test(g.to) && /^\s*select\b/i.test(g.privileges));
    expect(anonGrants.length).toBeGreaterThan(0);
    for (const g of grants.filter((g) => /\banon\b/.test(g.to))) {
      expect(g.privileges).not.toMatch(/\b(insert|update|delete|all)\b/i);
      expect(g.privileges).not.toMatch(/profiles/);
    }
    // no write policy may target the anon role
    for (const m of sql.matchAll(/create policy[\s\S]*?;/g)) {
      const policy = m[0];
      if (/for (insert|update|delete)/i.test(policy)) expect(policy).not.toMatch(/to[^;]*\banon\b/i);
    }
  });

  it("restricts public reads to active/published rows", () => {
    expect(sql).toMatch(/buildings_public_read[\s\S]*?using \(is_active\)/);
    expect(sql).toMatch(/departments_public_read[\s\S]*?is_active/);
  });

  it("derives staff roles from public.profiles on the database side, with a pinned search_path", () => {
    expect(sql).toMatch(/function public\.is_admin\(\)[\s\S]*?security definer[\s\S]*?set search_path = public/);
    expect(sql).toMatch(/function public\.is_staff\(\)[\s\S]*?security definer[\s\S]*?set search_path = public/);
    expect(sql).toMatch(/revoke all on function public\.is_admin\(\) from public, anon/);
    expect(sql).toMatch(/role\s+text not null check \(role in \('admin', 'editor'\)\)/);
  });

  it("restricts profile management and structural data to admins", () => {
    expect(sql).toMatch(/profiles_admin_insert[\s\S]*?with check \(public\.is_admin\(\)\)/);
    expect(sql).toMatch(/foreach t in array array\['buildings', 'floors', 'entrances', 'facilities', 'navigation_nodes', 'navigation_edges'\]/);
    expect(sql).toMatch(/for insert to authenticated with check \(public\.is_admin\(\)\)/);
  });

  it("never grants editors the right to delete departments or rooms", () => {
    expect(sql).toMatch(/departments_admin_delete on public\.departments for delete to authenticated using \(public\.is_admin\(\)\)/);
    expect(sql).toMatch(/rooms_admin_delete on public\.rooms for delete to authenticated using \(public\.is_admin\(\)\)/);
  });

  it("ships seed data that creates no auth users, passwords or staff profiles", () => {
    const seed = read("database/seed.sql");
    expect(seed).not.toMatch(/auth\.users/i);
    expect(seed).not.toMatch(/insert into public\.profiles/i);
    expect(seed).not.toMatch(/password/i);
  });
});

describe("secrets and server-side enforcement", () => {
  const sourceFiles = [...walk(path.join(root, "src")), ...walk(path.join(root, "data")), ...walk(path.join(root, "scripts"))].filter((f) =>
    /\.(ts|tsx|mjs|json|py)$/.test(f),
  );

  it("never references a service-role key or embeds a JWT / private key in the code", () => {
    for (const file of sourceFiles) {
      const text = stripComments(readFileSync(file, "utf8"));
      const rel = path.relative(root, file);
      expect(text, `${rel}: service-role key`).not.toMatch(/service[_-]?role/i);
      expect(text, `${rel}: JWT`).not.toMatch(/eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\./);
      expect(text, `${rel}: private key`).not.toMatch(/-----BEGIN [A-Z ]*PRIVATE KEY-----/);
    }
  });

  it("has no hardcoded passwords or demo credentials", () => {
    for (const file of sourceFiles.filter((f) => /\.(ts|tsx|mjs)$/.test(f))) {
      const text = readFileSync(file, "utf8");
      const rel = path.relative(root, file);
      expect(text, `${rel}: hardcoded password`).not.toMatch(/\b(password|passwd|pwd)\s*[:=]\s*["'`][^"'`\s]{3,}["'`]/i);
    }
  });

  it("only exposes Supabase URL and anon key through NEXT_PUBLIC variables", () => {
    const envNames = new Set<string>();
    for (const file of sourceFiles) for (const m of readFileSync(file, "utf8").matchAll(/NEXT_PUBLIC_[A-Z0-9_]+/g)) envNames.add(m[0]);
    for (const name of envNames) expect(name).not.toMatch(/SECRET|SERVICE|PRIVATE|PASSWORD|TOKEN/);
    expect([...envNames].sort()).toEqual(
      ["NEXT_PUBLIC_DATA_MODE", "NEXT_PUBLIC_DEMO_ADMIN", "NEXT_PUBLIC_SUPABASE_ANON_KEY", "NEXT_PUBLIC_SUPABASE_URL"].sort(),
    );
  });

  it("keeps the .env.local.example free of values and the real env files ignored by git", () => {
    const example = read(".env.local.example");
    expect(example).toMatch(/^NEXT_PUBLIC_SUPABASE_URL=$/m);
    expect(example).toMatch(/^NEXT_PUBLIC_SUPABASE_ANON_KEY=$/m);
    expect(example).toMatch(/^NEXT_PUBLIC_DATA_MODE=demo$/m);
    expect(example).toMatch(/^NEXT_PUBLIC_DEMO_ADMIN=false$/m);
    const ignore = read(".gitignore");
    expect(ignore).toMatch(/^\.env\.local$/m);
    expect(ignore).toMatch(/input-assets\/cad\/\*\*\/\*\.dwg/);
    expect(ignore).toMatch(/input-assets\/cad\/\*\*\/\*\.dxf/);
  });

  it("verifies identity and role on the server in every admin Server Action that touches data", () => {
    const actions = read("src/lib/admin/actions.ts");
    expect(actions.trimStart().startsWith('"use server"')).toBe(true);
    for (const name of ["saveRecordAction", "deleteRecordAction"]) {
      const body = actions.slice(actions.indexOf(`export async function ${name}`));
      const end = body.indexOf("\nexport ", 10);
      const fn = end > 0 ? body.slice(0, end) : body;
      expect(fn, name).toMatch(/await getStaffContext\(\)/);
      expect(fn.indexOf("getStaffContext"), `${name}: session check first`).toBeLessThan(fn.search(/\.insert\(|\.update\(|\.delete\(/));
    }
    const session = read("src/lib/admin/session.ts");
    expect(session).toMatch(/import "server-only"/);
    expect(session).toMatch(/auth\.getUser\(\)/); // server-validated, not just a cookie
    expect(session).toMatch(/from\("profiles"\)/); // role comes from the database
  });

  it("never reads a role from request data", () => {
    for (const rel of ["src/lib/admin/actions.ts", "src/lib/admin/session.ts", "src/proxy.ts"]) {
      expect(read(rel), rel).not.toMatch(/formData\.get\(["']role["']\)|payload\.role|searchParams\.get\(["']role/);
    }
  });

  it("does not leak stack traces or raw database errors to the browser", () => {
    const actions = read("src/lib/admin/actions.ts");
    expect(actions).not.toMatch(/error\.message\s*[}\]]|\.stack/);
    expect(actions).toMatch(/friendlyDbError/);
  });
});
