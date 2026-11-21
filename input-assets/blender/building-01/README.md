# input-assets/blender/building-01

Place the **Blender working files** for the pilot building here (e.g. `building-01.blend`), converted from the DXF floor plans in `input-assets/cad/building-01/`.

Workflow: `AutoCAD DWG → DXF → Blender → GLB → Three.js` — see `docs/cad-import-guide.md` and `docs/3d-model-guide.md`.

## Conventions to follow

- Unit: meters. Record here the scale factor you applied at import (for example millimeters → 0.001).
- Coordinate convention of the app: X east, Y up, Z south, origin at the building footprint centre at ground-floor walking level. glTF export with `+Y Up`. Record any axis conversion you made.
- One floor per export: `floor-00.glb`, `floor-01.glb`, … Each floor keeps its real elevation in Y.
- Every room is a separate object named exactly like its `model_object_id` (e.g. `ROOM_B01_F01_R03`).
- Apply transforms, remove unused geometry, reuse materials, Draco-compress the export.

Exported GLB files go to `public/models/building-01/floors/` (not here) and are registered in `data/demo/model-manifest.json`.

## Confidentiality

`*.blend` and `*.blend1` files are **git-ignored by default** because they derive from private architectural drawings. Do not commit or push them without explicit approval from the drawing owner. Only this README is tracked.

Currently this folder contains no Blender files.
