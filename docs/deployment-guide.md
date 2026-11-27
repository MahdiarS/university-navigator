# Deployment guide

University Navigator is a standard Next.js 16 application. It runs without any external service on its local data files, and optionally with Supabase (PostgreSQL + Auth + RLS).

## 1. Requirements

- Node.js **≥ 22.12** (`engines`; `.nvmrc` = 22). Next.js itself only needs 20.9, but the test toolchain (Vitest 5) needs 22.12. The code in this repository was checked on Node v22.23.5.
- `package-lock.json` is committed: install with `npm ci` in CI.

## 2. Build and run

```bash
npm ci
npm run typecheck && npm run lint && npm run test
npm run build
npm run start       # port 3000 by default
```

`prebuild` copies the Draco decoder to `public/draco/` (derived from `node_modules`, git-ignored).

**Vercel**: import the repository, framework preset *Next.js*, build command `npm run build`, install command `npm ci` (defaults work). Set the environment variables below in *Project → Settings → Environment Variables*. **Any other Node host**: run the commands above behind a reverse proxy and set the variables in the environment before `npm run build` (the `NEXT_PUBLIC_*` values are inlined at build time, so rebuild after changing them).

A production build never enables the local admin mode, whatever `NEXT_PUBLIC_DEMO_ADMIN` says.

## 3. Environment variables

| Variable | Required | Notes |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | for Supabase | project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | for Supabase | public **anon** key (safe in the browser because RLS enforces access) |
| `NEXT_PUBLIC_DATA_MODE` | no | `demo` (default; local data files) or `supabase`; `supabase` is honoured only if both values above are set |
| `NEXT_PUBLIC_DEMO_ADMIN` | no | keep `false` in production |

There are no server-only secrets. **Never add a Supabase service-role key** to this app or to any `NEXT_PUBLIC_*` variable; admin writes run as the signed-in user and are enforced by RLS.

## 4. Supabase setup (order matters)

1. Create a Supabase project.
2. SQL Editor → run **`database/schema.sql`** (tables, constraints, indexes, `updated_at` triggers, privileges, RLS policies). It is written to be re-runnable.
3. Optionally run **`database/seed.sql`** (the first floors of buildings 1-3 from `data/indoor`, `on conflict do nothing`; regenerate it with `node scripts/generate-seed-sql.mjs`). If the database was created from an older `schema.sql`, run `database/migrations/001-bridge-edge-type.sql` first (it allows the `bridge` edge type). Names there are low confidence: proofread them. Skip it, or delete the rows, once real data is loaded.
4. Set the environment variables (section 3) and rebuild/redeploy.
5. Authentication → Providers: enable **Email**. Consider disabling public sign-ups (Authentication → Sign In / Providers) so that only users you create can sign in; even a signed-up user without a `profiles` row has no write access and sees only public data.
6. Create the first admin (section 5).

If Supabase is unreachable at runtime, public pages fall back to the local data and log a short message.

## 5. First admin

Only an `admin` can insert into `public.profiles`, so the first one is created from the SQL Editor (which runs with the owner role):

1. Authentication → Users → *Add user* (email + strong password).
2. Run:

```sql
insert into public.profiles (user_id, full_name, role)
select id, 'Admin name', 'admin'
from auth.users
where email = 'admin@example.org';  -- use the real email
```

3. Sign in at `/admin/login`. Further staff can be added the same way with `role = 'editor'` (or by an admin through the `profiles` table). Roles: `admin` (everything) and `editor` (departments, department services, rooms).

No default password exists anywhere in the repository.

## 6. Verify RLS after deployment

Check that policies exist and tables are protected:

```sql
select tablename, rowsecurity from pg_tables where schemaname = 'public' order by 1;   -- rowsecurity = true for all
select tablename, policyname, cmd, roles from pg_policies where schemaname = 'public' order by 1, 2;
```

Then, as an anonymous visitor (the anon key, e.g. with `curl` against `https://<project>.supabase.co/rest/v1/departments?select=id` and the `apikey` header):

- reading `departments` returns only active rows;
- `profiles` returns no rows / is denied;
- `POST`/`PATCH`/`DELETE` on any table is rejected.

Also sign in as an `editor` and confirm that writing to `buildings` or `navigation_edges` is rejected. These checks are manual: `tests/security` only analyses the SQL text statically (RLS enabled, no anon writes, role helpers), it does not run against a live database.

## 7. Publishing real data

- Replace unverified rows with verified data, including contact details and working hours only when verified; unknown fields stay empty ("not available" is shown).
- The campus plan, the interiors and the sky bridges (`data/campus`, `data/indoor`) are part of the deployed code, not of the database: regenerate them with the scripts in `docs/cad-import-guide.md` and redeploy.
- Public pages are statically generated and revalidated every 300 s; admin saves call `revalidatePath`, so edits appear without a redeploy.
- Do not commit private architectural drawings (`*.dwg`, `*.dxf`, `*.blend`): they are git-ignored by default.

## 8. Troubleshooting

- `/admin` shows "setup required": the Supabase variables are missing (or were not present at build time).
- Signed in but "no access": the account has no `public.profiles` row with `role` `admin`/`editor`.
- Public pages show the local data despite Supabase: check `NEXT_PUBLIC_DATA_MODE=supabase` and that the schema was applied; the server log contains `[data] Supabase load failed`.
- Blank 3D area: the browser has no WebGL; search and department pages remain usable.
