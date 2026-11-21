# Architecture

## Layers

```
 data/demo/*.json ──┐                      ┌── Supabase (RLS)
                    ▼                      ▼
        src/lib/data  (Zod schemas, demo-source, supabase-source, repository)
                    │  NavigatorData (server → DataProvider)
                    ▼
        src/components/DataProvider.tsx  → lookups, nav graph, search index
        ┌───────────┼────────────────────────────┐
        ▼           ▼                            ▼
 src/lib/navigation  src/lib/search        src/lib/model
 (graph, A*, routes) (normalise + rank)    (layout, procedural, glb, viewerState)
        │                                        │
        └──────────────► src/components/3d ◄─────┘   (React Three Fiber, rendering only)
                                  │
                         src/features/*  (UI composition)  →  src/app/* (routes)
```

Rules that keep the code maintainable:

- `src/lib/navigation` has no React, Three.js or data-layer imports: it routes anything that matches `GraphNode`/`GraphEdge`.
- `src/lib/model` is pure TypeScript (geometry descriptors, reducer, bounds). `src/components/3d` only turns that state into meshes. This is why the model logic is unit-testable without a GPU.
- Demo content lives only in `data/demo/` and is loaded through `src/lib/data`. UI components never import JSON directly.
- Stable identifiers (`idSchema`: `^[A-Za-z0-9][A-Za-z0-9_-]*$`) link database rows, graph nodes and 3D objects.

## Data flow

`src/app/layout.tsx` calls `getNavigatorData()` (`src/lib/data/repository.ts`, cached per request, `revalidate = 300`).

- **Demo mode** (default): `loadDemoData()` parses `data/demo/*.json` with Zod.
- **Supabase mode**: only when `NEXT_PUBLIC_DATA_MODE=supabase` *and* both Supabase variables exist (`useSupabaseData` in `src/lib/config.ts`). Rows are read with the anonymous client, so RLS limits them to published/active data. Rows that fail Zod validation are dropped and logged. On any load error the app falls back to demo data and logs a short message only.

The 3D model manifest (`data/demo/model-manifest.json`) is **not** stored in the database in either mode.

The result is passed to `DataProvider` (client), which derives lookup maps, the navigation graph (`buildGraph`) and the search index once.

## Routes

| Route | Purpose |
| --- | --- |
| `/` | home: search, categories, campus preview, building list |
| `/campus` | procedural 3D campus, clickable pilot building |
| `/buildings/[slug]` | 3D building viewer (deep links: `?room=`, `?dept=`, `&navigate=1`, `&from=<nodeId>`) |
| `/search` | search page |
| `/directions` | resolves `?to=<department slug or room id>` and redirects to the viewer with route planning |
| `/departments/[slug]` | department details |
| `/admin/login`, `/admin` | restricted admin (see below) |

## 3D viewer

Orthographic isometric camera (`ISO_DIRECTION = (1,1,1)`) with drei `OrbitControls`; the render loop is demand-driven (floors animate with frame-rate independent damping and the scene only invalidates while something moves). `dpr={[1, 1.75]}` caps pixel ratio. WebGL is probed once (`useWebGLSupport`); without WebGL a fallback is shown and search/department pages still work. Errors are caught by `SceneErrorBoundary`; a failing GLB floor is caught per floor by `FloorModelBoundary`. See `docs/3d-model-guide.md`.

Exploded view is a visualisation offset only: `offset(floor) = rank × distance` (distance 0–14 m, default 6 m). It is added by `FloorGroup` on top of real elevations and never enters room coordinates or the navigation graph.

## Navigation

See `docs/navigation-guide.md`. The engine returns structured steps; Persian wording is isolated in `src/lib/navigation/directions-fa.ts`.

## Security model

- **Public**: anyone can read published/active data and search/navigate. No account.
- **Database (the real enforcement)**: RLS is enabled on every table in `database/schema.sql`. Table privileges are revoked from `anon`/`authenticated` and then re-granted narrowly (defence in depth). Roles come from `public.profiles` via `SECURITY DEFINER` helpers `is_staff()` / `is_admin()` with a pinned `search_path` that only look at `auth.uid()`.
  - `editor`: insert/update on `departments`, `department_services`, `rooms`; delete on `department_services`.
  - `admin`: everything, including buildings, floors, entrances, facilities, navigation nodes/edges, deletes and `profiles`.
  - Anonymous users have `SELECT` on published tables only; `profiles` are invisible to them.
- **Server**: every admin page and Server Action (`src/lib/admin/*`) calls `getStaffContext()`, which validates the session with `auth.getUser()` and reads the role from `public.profiles`. The browser never supplies a role. Inputs are whitelisted by resource and validated with Zod before any write (`prepareWrite`). `src/lib/admin/permissions.ts` mirrors the RLS rules so actions fail early; RLS remains authoritative.
- **Proxy** (`src/proxy.ts`): refreshes the Supabase session cookie for `/admin*` and optimistically redirects signed-out visitors to `/admin/login`. It is a convenience, not the security boundary.
- **No service-role key** is used anywhere. Writes run as the signed-in user.
- **Demo admin**: only when `NODE_ENV === "development"`, `NEXT_PUBLIC_DEMO_ADMIN=true` and Supabase is not used. No password, `localStorage` only, never in production.
- Errors shown to users are generic Persian messages (`friendlyDbError`); details are logged server-side with the error code only.

## Admin panel

`/admin` modes (`getAdminMode()`): `supabase` (real auth), `demo-local` (development only) or `setup-required`. One generic editor (`ResourceEditor`) renders every resource from the declarative table in `src/lib/admin/fields.ts`; the resource ↔ table mapping is in `src/lib/data/resources.ts`.

## Tests

`tests/` contains Vitest suites for demo data and Zod validation, the procedural model / exploded view / viewer state / route geometry / GLB name mapping (pure logic), navigation and search. See the README for how to run them.
