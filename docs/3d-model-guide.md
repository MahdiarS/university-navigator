# 3D model guide

The viewer supports two modes and chooses per floor.

| Mode | When | Source |
| --- | --- | --- |
| **A — procedural demo** | the floor's manifest entry has `status: "unavailable"`, or its GLB failed to load | geometry generated from `procedural` in `data/demo/model-manifest.json` (`src/lib/model/procedural.ts`) |
| **B — GLB** | the floor's manifest entry has `status: "available"` | `public/models/...` loaded with drei `useGLTF` (`src/components/3d/GlbFloor.tsx`) |

All paths and metadata come from `data/demo/model-manifest.json` (validated by `ModelManifestSchema` in `src/lib/data/schemas.ts`); no model path is hard-coded in components. Currently every entry is `"unavailable"`, no GLB file exists in the repository, and none should be faked.

## Coordinate convention

Shared by room positions, navigation nodes, floor elevations, the procedural model and (required for) real GLB files:

| Axis | Meaning |
| --- | --- |
| X | horizontal axis one (east +) |
| Y | vertical elevation (up +) |
| Z | horizontal axis two (south +; −Z is "north" in plan view) |

- **Unit: meters.**
- **Origin:** centre of the building footprint at ground-floor walking level (as stated in the manifest `coordinateSystem`).
- Floor `elevation` (table `floors`) is the Y of the walking surface; demo floors are at 0, 4 and 8 m (`floorHeight` 4 m).
- Exported GLB floors must already contain their real elevation in Y. The viewer does **not** move a GLB floor to its `elevation`; it only adds the exploded-view offset (see below). Floor 01's GLB must therefore have its slab at Y ≈ 4.

glTF is natively Y-up, right-handed, in meters. Blender is Z-up: export with "+Y Up" (the exporter default) and verify that Blender's −Y maps to +Z south as described above. Document any other conversion you apply in `input-assets/blender/building-01/README.md` (see `docs/cad-import-guide.md`).

## Manifest

Per building (`buildings[]`):

```jsonc
{
  "buildingId": "building-01",
  "exterior": { "path": "/models/building-01/exterior.glb", "status": "unavailable" },
  "floors": [
    { "floorId": "floor-00", "floorNumber": 0, "path": "/models/building-01/floors/floor-00.glb", "status": "unavailable" }
    // ...
  ],
  "objectMap": { "ROOM_B01_F00_R01": "b01-f00-r01" /* object name -> room id */ },
  "procedural": { /* layout of the demo building: footprint, floorHeight, rooms, stair/elevator cores, mainEntrance ... */ }
}
```

Also at top level: `schemaVersion: 1`, `isDemo`, `units: "meters"`, `coordinateSystem` and the procedural `campus` (ground size, buildings, paths, trees).

Notes (accurate as of this code):

- `path` must start with `/` (files under `public/`, e.g. `public/models/building-01/floors/floor-00.glb` ⇒ `/models/building-01/floors/floor-00.glb`).
- `procedural` is required by the schema even for a building that has real GLB files; it is used as the fallback and for default framing.
- `exterior` is part of the manifest but the building viewer does not render it yet.
- `buildings.model_url` / `floors.model_url` (editable in the admin panel; must start with `/` or `https://` and contain no `..`) are stored metadata. The viewer currently loads models from the manifest, not from these columns.
- The manifest is local in both data modes; it is not read from Supabase.

## Room ↔ record mapping

Every room has a stable `id` (e.g. `b01-f01-r03`) and a unique `model_object_id` (e.g. `ROOM_B01_F01_R03`), which is the **name of the mesh/object** representing the room in the 3D model. `objectMap` maps those names to room ids. Convention: `ROOM_B<building>_F<floor>_R<room>` in upper case.

Resolution (`src/lib/model/glb.ts`): a click/hover hit walks up the parent chain and matches each object's name (with a trailing Blender `.001`-style suffix stripped) against `objectMap`. So the room object may be a single mesh or a group of meshes. `missingRooms`/`indexRoomObjects` report objects declared in the map but absent from a file; `GlbFloor` surfaces this as a warning in the UI.

Do not rename objects after publishing: the name is the link to the database record.

## Exploded view

`explodeOffsets()` in `src/lib/model/layout.ts`: `offset(floor) = rank × distance`, rank 0 being the lowest floor, distance clamped to 0–14 m (default 6). The ground floor stays at the base, floor order is preserved, and the value is a visualisation offset that is never written into room coordinates or the graph. `FloorGroup` animates it with exponential damping. A route is drawn per floor inside that floor's group, so it follows the explosion; vertical transfers are drawn as explicit connectors rather than lines through walls.

## Lazy loading, fallback and cleanup

- A floor that is hidden (isolated-floor mode with "hide other floors") mounts nothing, so its GLB is not requested. Floors load only when shown.
- `GlbFloor` clones materials per instance (so highlighting one room never leaks to another floor), applies ghost/highlight as material changes (geometry is never modified), and on unmount disposes the cloned materials and geometries and calls `useGLTF.clear(path)`.
- `FloorModelBoundary` catches a missing/corrupt file for that floor only and renders the procedural floor in its place; the explorer shows a notice that demo geometry is displayed.
- Selecting rooms/ hovering is disabled on ghosted floors.

## Draco and textures

Draco-compressed GLB is supported. The decoder is copied from `node_modules/three/examples/jsm/libs/draco/gltf` to `public/draco/` by `scripts/copy-draco.mjs` (runs before `dev` and `build`) and is loaded from `/draco/`, so no CDN is needed. KTX2 textures are not wired into the loader in this MVP; use plain textures (or none — the demo style is flat-coloured).

## Preparing a GLB for this viewer

1. One GLB per floor, in building coordinates (see above), real elevation in Y.
2. Name room objects `ROOM_B01_F01_R03` etc.; keep them as separate objects so they can be highlighted.
3. Use `MeshStandardMaterial`-compatible materials (the highlight uses the emissive channel).
4. Remove hidden/unused geometry, merge repeated geometry, reuse materials, apply transforms, and apply Draco compression.
5. Place files under `public/models/building-01/floors/` and set the manifest `status` to `"available"`.
6. Fill `objectMap` and check that no room is reported missing.

## Replacing the demo model

1. Export floor GLBs as above and copy them to `public/models/<building>/floors/floor-XX.glb`.
2. Edit `data/demo/model-manifest.json`: set `status: "available"` for each floor, complete `objectMap`.
3. Make sure the room records' `model_object_id` and the `objectMap` agree (a test, `tests/data/demo-data.test.ts`, checks this for the demo data).
4. Replace demo rooms/nodes/edges with verified data (`docs/navigation-guide.md`), and turn off the `isDemo` flag on real records.
5. Run `npm run dev`, open `/buildings/<slug>` and confirm: floors load, exploded view works, room hover/click map to the right records, and routes land inside the rooms.
