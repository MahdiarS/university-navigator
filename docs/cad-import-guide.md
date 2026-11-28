# CAD import guide

Two data sources feed the one campus map:

```
site plan DWG ──► scripts/cad/dwg-dump.mjs ──► scripts/cad/build_campus.py ──► data/campus/campus-layout.json
hand-drawn floor sketches ──► scripts/cad/floorplans.py + campus-offices.json ──┐
                                                                ├► scripts/cad/build_interiors.py ──► data/indoor/*.json ──► (scripts/generate-seed-sql.mjs ──► database/seed.sql)
data/campus/campus-layout.json ─────────────────────────────────┘
```

Never guess dimensions, floor heights or room identities: take them from the drawings or from the drawing owner, and mark what you could not read.

**Confidentiality.** DWG/DXF/.blend files and the parsed JSON of a DWG are architectural source material. They are git-ignored (`input-assets/cad/**/*.dwg|*.dxf|*.bak`, `input-assets/blender/**/*.blend|*.blend1`) and the parsed dump must stay **outside** the repository. Do not commit or push them — even to a private repository — without explicit approval from the owner of the drawings. Never modify originals; work on copies. What is committed is only derived data: `campus-layout.json` (outlines, doors, areas) and the interiors.

## First floors of buildings 1, 2 and 3 (`build_interiors.py`)

The owner supplied hand-drawn sketches of the first floor of each of the three buildings: a list of rooms per building with the professors' names and fields. The three buildings are joined at first-floor level by **two sky bridges** (3 ↔ 2 and 2 ↔ 1). The owner marked the entrances on a screenshot: yellow = entrance of building 3 (from the yard), red = exit of building 3 onto the bridge towards building 2, blue = exit of building 2 onto the bridge towards building 1, brown = entrance of building 1 (from the yard). Building 2 has no door to the yard.

1. **Transcribe** the sketch twice. (a) The *shape* goes into `scripts/cad/floorplans.py`: per building, rectangles in metres (building-local frame, origin at the footprint's bounding-box corner) for each corridor and each room, plus the stair lobby at the yard door. The sketches are schematic and not to scale, so keep the topology (which rooms face which corridor, where the corridors bend, where the bridges meet) and fit the sizes inside the real footprint; the builder clips everything to the footprint. (b) The *content* goes into `scripts/cad/campus-offices.json`: per room the `names`, `field` and `confidence`. Use `"confidence": "ok"` only for what was read clearly; handwriting in a phone photo is usually `"low"`. Rooms drawn without a name keep their number and have no person.
2. **Generate**: `python3 -I scripts/cad/build_interiors.py` (needs `shapely`). The sketches are schematic, so the geometry is **designed**: each building keeps its real footprint from the site plan, gets a central corridor (an L for building 3), rooms are cut along it in the order of the sketch, the stair lobby sits at the owner-marked outdoor door and the bridge vestibules at the bridges (`bridge-3-2`, `bridge-2-1`, running north-south along x = −24.5). The first-floor walking surface is 3.6 m.
3. **Outputs** in `data/indoor/`: `buildings`, `floors`, `rooms`, `departments` (one per professor, slug `office-<room>-<i>`), `department-services` (empty), `entrances`, `facilities`, `navigation-nodes`, `navigation-edges` (types `corridor`, `door`, `stairs`, `bridge`) and `interiors.json` (room/corridor polygons and bridge geometry for the 3D scene). Identifiers: building `campus-bN`, room `campus-bN-r<number>`, door node `campus-bN-d-<token>`.
4. **Check**: `npx vitest run` (`tests/data/indoor-data.test.ts` validates every file against the Zod schemas, the graph and the references). Then `node scripts/generate-seed-sql.mjs` if the Supabase seed should follow.

The green area on the campus plan (between buildings 11 and 13, with the pond) is an open park with no professors, so it has no rooms.

To add another building's floor, give the building an entry in `campus-offices.json` and in the script's building table; its outdoor door comes from `doors` in `scripts/cad/campus-legend.json`.

## Campus site plan (DWG → `data/campus/campus-layout.json`)

The 3D campus (`/campus`, home-page preview) is built from a **site plan**, not from the per-floor workflow above. The first plan (a 2013–2017 AutoCAD DWG, units = meters, UTM coordinates, ~237 × 262 m) is already imported. To import a new or corrected plan:

1. Keep the DWG **outside the repository** (`*.dwg`, `*.dxf` are git-ignored; it is private architectural data).
2. Dump it to JSON. DWG cannot be read by `ezdxf`; LibreDWG compiled to WebAssembly is used and is *not* a project dependency:
   ```bash
   npm install --no-save @mlightcad/libredwg-web
   node scripts/cad/dwg-dump.mjs /path/to/campus.dwg /path/outside/repo/campus-parsed.json
   ```
3. Put the owner-supplied legend in `scripts/cad/campus-legend.json` (number → name, description, number of floors; `"footprint": true` forces a building to be built from its drawn outline even if that outline is open, and `"footprint": false` keeps a number as a pin). The `features` block anchors the green area (park), the sports pitch and the small court on the plan.
4. Build the layout (`pip install shapely` once):
   ```bash
   python3 scripts/cad/build_campus.py /path/outside/repo/campus-parsed.json
   ```

What the script does, and what it deliberately does not do:

- **Footprints** are the *outlines drawn in the DWG*. The smallest closed face containing the building's number is used; small gaps (0.3 / 1 / 2.5 m) are closed by a buffer-and-shrink step. If an outline is **open** (the prayer room, 7, was drawn this way), the script closes the polyline by joining its end back to its start (only when the gap is ≤ 25 m and the result has a plausible area). A number with no outline at all becomes a **pin marker**; no shape is ever guessed. Each building also gets a `trim` outline 0.25 m outside its walls (used for the glazing bands, plinth and cornice).
- **Ground**: `ground.outline` is the **property boundary drawn in the plan** (the long closed polyline on layer `C-HYDR-CTCH-HDPT`), not a convex hull: the campus is L-shaped, and the empty notch in the north-east plus the strip beyond the east gate are not campus land. Land inside the old convex hull but outside the boundary becomes non-walkable routing obstacles (`outside-N`). Drawing symbols outside the boundary (the gate arrows) are dropped. `areas` holds the park («محوطه سبز», the large green space between buildings 11 and 13 with the pond), the sports pitch, the small court, the planting beds (`bed`) and grass patches (`lawn`, a bed that holds a gazebo).
- **Green only where the plan says so**: the ground is paved by default; grass and trees appear only in the park, the planting beds, lawns and the sports pitch (everything the plan draws as vegetation). The grey plots in the north (labels 12/13) and open yards stay paved and tree-free.
- **Coordinates** are re-centred on the middle of the drawing; the UTM georeference is dropped. The shared convention applies: meters, X east, **Z south** (Z = −northing), Y up.
- **Heights are not in a site plan.** `size.height` = floors from the legend × 3.6 m, flagged `heightIsEstimate: true`. Unknown floor counts are drawn as one storey and shown as "ثبت نشده".
- **Context lines** (vegetation, sports pitch, site/parcel lines) are simplified to 0.25 m and stored as flat polylines; building edges are skipped because the extrusion already draws them.
- **Entrances** come from the "درب ورود" text in the drawing; they are the start of every campus walking route. The owner removed the north-east gate (`features.removeEntrances` in the legend); the remaining gate text sits just outside the boundary and is moved 1.5 m inside it.
- **Gazebos** come from the plan: the hexagon on layer `C-SSWR-PROF` is a **round** gazebo and the rotated square is a **square** gazebo; a third square one (south-west corner) was marked by the owner on a screenshot and is listed in `features.gazebos` (it is not in the DWG). Props carry `source: "plan" | "owner"`.
- **Decorative, not surveyed** (flagged `decorative: true` or described in `source.note`): the **pond** (placed in the middle of the park, long axis along the park, symbolic size) and the **trees** (seeded, so the scene is identical on every load; only inside the park, beds and lawns; kept out of buildings, courts, the pond and gazebos).
- **Routing obstacles** (`nav.obstacles`): every building, the pitch, the court and the pond, the gazebos and the non-walkable pockets outside the boundary; all but the pockets are inflated by 1.5 m (`WALK_CLEARANCE`). The campus router (`src/lib/navigation/campus-route.ts`) finds the shortest path around them.

Numbers 12, 13 and 15 have no outline and no name in the legend, so they remain unnamed, unclickable pins. Building 14 is «سالن شهید چمران» (owner-supplied). Run `npx vitest run tests/model/campus.test.ts tests/navigation/campus-route.test.ts` after regenerating.

Buildings 1, 2 and 3 have an indoor first floor (previous section); the other buildings have none yet, and a route to them ends at their door or nearest side. Building ids in the campus layout are `campus-bN` and tie each building to its indoor data (`campusKey(b) = b.id ?? b.slug ?? b.label`).

## Checklist

- [ ] DWG originals untouched and **not committed**; the parsed dump kept outside the repo
- [ ] Units, scale and the owner's legend verified
- [ ] Doors and gates marked by the owner and snapped onto the outlines
- [ ] Sketch transcription proofread (every `confidence: "low"` room checked with the owner)
- [ ] `build_campus.py` and `build_interiors.py` re-run, `npx vitest run` green
- [ ] App checked in the browser: search a room, follow the route from the gate, open the interior view
