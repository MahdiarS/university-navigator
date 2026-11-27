# Architecture

## Layers

```
 data/campus/*.json  data/indoor/*.json ──┐         ┌── Supabase (RLS)
                                          ▼         ▼
        src/lib/data  (Zod schemas, demo-source, supabase-source, repository)
                    │  NavigatorData (server → DataProvider)
                    ▼
        src/components/DataProvider.tsx  → lookups, indoor graph, search index
        ┌───────────┼────────────────────────────┐
        ▼           ▼                            ▼
 src/lib/navigation  src/lib/search        src/lib/model
 (graph, A*, routes) (normalise + rank)    (campus, journey, camera, viewerState)
        │                                        │
        └──────────────► src/components/3d ◄─────┘   (React Three Fiber, rendering only)
                                  │
                         src/features/*  (UI composition)  →  src/app/* (routes)
```

Rules that keep the code maintainable:

- `src/lib/navigation` has no React, Three.js or data-layer imports: it routes anything that matches `GraphNode`/`GraphEdge`, and finds outdoor walks around obstacles.
- `src/lib/model` is pure TypeScript (campus geometry, the journey planner, camera maths, reducer). `src/components/3d` only turns that state into meshes, which is why the logic is unit-testable without a GPU.
- Content lives only in `data/campus/` and `data/indoor/` and is loaded through `src/lib/data`. UI components never import JSON directly.
- Stable identifiers (`idSchema`: `^[A-Za-z0-9][A-Za-z0-9_-]*$`) link database rows, graph nodes and 3D objects.

## Data flow

`src/app/layout.tsx` calls `getNavigatorData()` (`src/lib/data/repository.ts`, cached per request, `revalidate = 300`).

- **Local mode** (default): `loadDemoData()` parses `data/campus/campus-layout.json` and `data/indoor/*.json` with Zod (the function keeps its historical name).
- **Supabase mode**: only when `NEXT_PUBLIC_DATA_MODE=supabase` *and* both Supabase variables exist (`useSupabaseData` in `src/lib/config.ts`). Rows are read with the anonymous client, so RLS limits them to published/active data. Rows that fail Zod validation are dropped and logged. On any load error the app falls back to the local data and logs a short message only.

The campus plan and the sky bridges (`interiors.json`) are **not** stored in the database in either mode; they always come from the local files.

The result is passed to `DataProvider` (client), which derives lookup maps, the navigation graph (`buildGraph`) and the search index once.

## Routes

| Route | Purpose |
| --- | --- |
| `/` | home: search, categories, campus preview, building list |
| `/campus` | **the** map: campus, first floors of buildings 1-3, search and the route from the gate to a room (deep links: `?room=<room id>`, `?dept=<department slug>`, `?building=<slug or id>`) |
| `/search` | search page |
| `/departments/[slug]` | person/unit details with "show on map" (links to `/campus?dept=`) |
| `/buildings/[slug]`, `/directions` | redirects to `/campus` with the same intent |
| `/admin/login`, `/admin` | restricted admin (see below) |

## One journey

`src/lib/model/journey.ts` (`planJourney`) joins the two engines into one walk from a university gate to a room: the outdoor leg (`routeFromEntrance`, visibility graph + Dijkstra) to the door of an entrance building, then the indoor leg (`computeRoute`, A\* over the indoor graph with `door`, `stairs` and `bridge` edges). A room whose building has a street door is entered there; a room in a building without one (building 2) is reached through whichever entrance building gives the shortest total, over a sky bridge. The result carries ordered steps (outdoor first, then indoor), total meters and time, the outdoor polyline and the indoor 3D points, which `CampusExplorer` draws as one route.

## 3D scene

See `docs/3d-model-guide.md`. Orthographic isometric camera, demand-driven rendering, WebGL probe with fallback, `SceneErrorBoundary`.

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
- **Local admin mode**: only when `NODE_ENV === "development"`, `NEXT_PUBLIC_DEMO_ADMIN=true` and Supabase is not used. No password, `localStorage` only, never in production.
- Errors shown to users are generic Persian messages (`friendlyDbError`); details are logged server-side with the error code only.

## Admin panel

`/admin` modes (`getAdminMode()`): `supabase` (real auth), `demo-local` (development only, local state) or `setup-required`. One generic editor (`ResourceEditor`) renders every resource from the declarative table in `src/lib/admin/fields.ts`; the resource ↔ table mapping is in `src/lib/data/resources.ts`.

## Tests

`tests/` contains Vitest suites for the indoor data and Zod validation, the campus plan, the journey planner, viewer state and camera (pure logic), navigation (indoor, bridges, outdoor), search, security, and a headless render of the real 3D scene. See the README for how to run them.
