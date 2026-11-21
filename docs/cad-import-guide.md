# CAD import guide (AutoCAD → web)

Target pipeline:

```
AutoCAD DWG → DXF (per floor) → Blender → GLB (per floor) → Three.js (this app)
```

No real drawings are in this repository yet; the app runs on a procedural demo building. This guide describes how real drawings are brought in. Never guess dimensions, floor heights or room identities: take them from the drawings or from the drawing owner.

**Confidentiality.** DWG/DXF/.blend files are architectural source material. They are git-ignored by default (`input-assets/cad/**/*.dwg|*.dxf|*.bak`, `input-assets/blender/**/*.blend|*.blend1`). Do not commit or push them — even to a private repository — without explicit approval from the owner of the drawings. Never modify originals; work on copies.

## 0. Audit the drawings first

Put the files in `input-assets/cad/building-01/` and run (needs Python 3 and `ezdxf`: `pip install ezdxf`):

```bash
python3 scripts/audit_dxf.py input-assets/cad/building-01 -o docs/cad-audit-report.md
```

The audit reports layer names, entity counts, extents and units, and opens files read-only. Use it to check the items below before modelling. (`scripts/audit_dxf.py` is the audit script of this project; see its `--help` for options.) The generated report is a plain Markdown file that describes the drawings; review it before committing it, because it can reveal building details.

## 1. Export DWG to DXF

In AutoCAD: *Save As → AutoCAD DXF*, preferably *AutoCAD 2018 DXF* (or R2013/R2010 ASCII DXF); ASCII DXF is the most widely readable. Keep the DWG untouched. Export one DXF **per floor** (next item) and, if wanted, a combined reference DXF.

## 2. Separate floors

- One drawing/DXF per floor: `floor-00.dxf` (ground), `floor-01.dxf`, `floor-02.dxf`, … matching the floor ids in the database/manifest.
- Remove unrelated content: title blocks, dimensions, furniture, hatches, xrefs, sections/elevations. Use `PURGE` and `OVERKILL`, and bind or explode xrefs.
- Record the verified **floor-to-floor height** and the **walking-surface elevation** of every floor (this becomes `floors.elevation`). Do not infer them.

## 3. Required and recommended layers

Use consistent layer names in every floor file:

| Layer | Content | Status |
| --- | --- | --- |
| `WALL` | wall outlines/centre lines (closed polylines where possible) | required |
| `ROOM` | one closed polyline per room (the room boundary) | required |
| `DOOR` | door openings/blocks | required |
| `CORRIDOR` | corridor boundaries / centre lines | required |
| `STAIR` | stair outlines | required |
| `ELEVATOR` | elevator shafts/cabins | required |
| `ENTRANCE` | main/secondary entrances | recommended |
| `TEXT` | room numbers/names as text/MTEXT placed inside the room polygon | recommended |
| `WINDOW` | windows | optional |
| `COLUMN` | columns | optional |

## 4. Verify units and scale

- Check `$INSUNITS` in the audit report (4 = millimeters, 5 = centimeters, 6 = meters). If it is 0 (unitless) confirm the unit with the drawing owner.
- Measure a known dimension (e.g. a door ≈ 0.9–1.0 m, a corridor width given on the plan) and compare. Fix the scale **in the drawing/Blender**, never by eyeballing.
- The web app uses **meters**. Convert at Blender import (e.g. millimeters → scale 0.001) and record the factor you applied in `input-assets/blender/building-01/README.md`.
- Check extents: stray entities far from the building inflate bounds and shift the origin.

## 5. Align the coordinate origin across floors

All floors must share one origin and orientation, otherwise stairs, lifts and routes will not line up.

- Choose a fixed reference (e.g. a structural column or the stair-core corner) that exists on every floor, and place it at the same drawing coordinates in every DXF. Alternatively use the building footprint centre, as the demo does.
- App convention (`docs/3d-model-guide.md`): X east, Y up, Z south, meters, origin at the footprint centre at ground-floor walking level. Plan-view drawing axes are X/Y; they map to the app's X/Z (watch the sign of north/south).
- Floor `n` is shifted vertically by its verified elevation; the plan origin must not move between floors.
- Validate by overlaying all floors: stair cores and lift shafts must coincide.

## 6. Identify walls, doors, corridors, rooms, stairs and elevators

- Walls from `WALL` (extrude to the wall height).
- Doors from `DOOR`: each door gives a room door node for navigation.
- Corridors from `CORRIDOR`: centre lines drive the corridor/junction nodes.
- Rooms from `ROOM` polygons; match each polygon with its label text from `TEXT` (point-in-polygon). Room identity (number, name) comes from the drawing text or the owner, never invented.
- Stairs from `STAIR`, elevators from `ELEVATOR`: these produce the `stair`/`elevator` nodes and the vertical edges (`docs/navigation-guide.md`).
- Any room that cannot be matched unambiguously is listed for manual review.

## 7. Prepare geometry in Blender

1. Import the DXF (Blender's DXF importer or a converted SVG/OBJ), scale to meters, set the world origin as chosen in (5).
2. Per floor: build a floor slab and extrude walls; cut door openings; model stair and elevator volumes simply (they do not need detail).
3. Make each room a **separate object** (a floor-plane/box mesh from the room polygon). Name it `ROOM_B01_F01_R03` (building 01, floor 01, room 03) — this is the `model_object_id`.
4. Apply all transforms (rotation 0, scale 1), recalculate normals, delete loose geometry and duplicate vertices, keep the poly count low, reuse materials.
5. Use simple PBR materials (the viewer highlights rooms through the emissive channel). Colours follow `src/lib/theme/tokens.ts`; the style is flat and calm.
6. Keep one `.blend` per building under `input-assets/blender/building-01/` (git-ignored).

## 8. Export optimised GLB files

- One GLB per floor: `floor-00.glb`, `floor-01.glb`, … (and optionally `exterior.glb`).
- Blender → *File → Export → glTF 2.0 (.glb)*: format GLB, `+Y Up`, *Apply Modifiers*, only the selected collection for that floor; include materials; no cameras/lights.
- Compress with Draco (Blender's exporter option, or `gltf-transform`). The app ships the Draco decoder (`public/draco/`). KTX2 textures are not wired up in the loader in this MVP.
- Check size and keep it small enough for mid-range mobile devices; floors are loaded lazily, so smaller per-floor files are better.

## 9. Preserve stable room and object IDs

- The object name is the link between the model and the database. Use the exact `model_object_id` stored for the room (`rooms.model_object_id`, unique) and list it in `objectMap` in `data/demo/model-manifest.json` (object name → room id).
- Never rename or renumber objects after publishing; add new ids for new rooms.
- Blender may append `.001` to duplicates; the loader strips a trailing `.NNN`, but avoid duplicates anyway.
- After export, open the GLB in a viewer (or load it in the app) and confirm every object in `objectMap` exists (the viewer logs a warning for missing ones).

## 10. Replace the demo model in the web app

1. Copy the GLBs to `public/models/building-01/floors/` (and `exterior.glb` to `public/models/building-01/`).
2. In `data/demo/model-manifest.json`, set `status` to `"available"` for each file and complete `objectMap`.
3. Replace demo data with verified rooms, departments, navigation nodes and edges (nodes from step 6 in the real coordinate system). Clear `is_demo` on real records.
4. `npm run dev` → open `/buildings/building-01`; check floors, exploded view, hover/click on rooms, and routes (`docs/3d-model-guide.md`, `docs/navigation-guide.md`).
5. If a GLB fails to load, that floor automatically falls back to the procedural demo geometry; fix the file rather than relying on the fallback.

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

The indoor demo building (`building-01`) is **independent of the campus**; no real campus building has an indoor map until its floor plans are imported (sections 1–10 above), after which its campus entry gets `slug`/`buildingId`.

## Checklist

- [ ] DWG originals untouched and **not committed**
- [ ] DXF per floor, layers as above
- [ ] Units, scale and floor elevations verified with the owner
- [ ] Common origin across floors verified by overlay
- [ ] Rooms matched to drawing text; unmatched list reviewed
- [ ] Room objects named `ROOM_B01_F0N_R0M` and mapped in `objectMap`
- [ ] GLBs exported (Y up, meters, applied transforms, Draco)
- [ ] Manifest set to `available`; app verified in the browser
