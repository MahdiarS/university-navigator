# 3D scene guide

There is **one** 3D scene: the campus (`/campus`, `src/components/3d/CampusScene.tsx`). The first floors of buildings 1-3 and the sky bridges between them are drawn inside it (`CampusInterior.tsx`) when a building is opened. There are no per-building GLB models and no manifest of model files; everything is generated from data.

## Coordinate system

Shared by the campus plan, room positions, navigation nodes and floor elevations:

- **Units:** meters.
- **X** east, **Y** up, **Z** south (Z = −northing). Right-handed with Y up.
- **Origin:** the middle of the site plan drawing (the UTM georeference of the DWG is dropped).
- A floor's `elevation` (table `floors`) is the Y of its walking surface. The ground floor is 0 and the first floor is **3.6 m**.
- A footprint ring is a list of `{x, z}` points. Three.js shapes use `(x, −z)` and the mesh is rotated −90° about X, which puts a shape point back at world `(x, z)` (`footprintShapePoints` in `src/lib/model/campus.ts`).

## What is drawn

| Layer | Source | Notes |
| --- | --- | --- |
| Ground, park, beds, lawns, pitch | `data/campus/campus-layout.json` (from the DWG) | green only where the plan says so |
| Buildings | `footprint` + `trim` per building | heights = floors × 3.6 m, **estimated** (`heightIsEstimate`) |
| Doors | `doors[{x, z, angle}]` per building | marked by the owner (yellow crosses), snapped onto the outline |
| Gazebos | plan and owner marks | round and square |
| Pond, trees | generated | **decorative**, seeded so every load looks the same |
| First floors of buildings 1-3 | `data/indoor/interiors.json` | **designed** from the hand-drawn sketches, not surveyed |
| Sky bridges | `interiors.bridges` | `bridge-3-2` and `bridge-2-1`, first-floor level |

A building with no closed outline in the plan (12, 13, 15) is a pin, never an invented shape.

## Opening a building (cutaway)

When a building with an indoor map is selected, is part of a route, or the "interior view" toggle is on, `CampusScene` draws it as a low ground-floor mass (no upper storeys, cornice or roof) and `CampusInterior` draws its first floor on top of it: corridor floor, room floors (one selectable mesh per room, named `interior-room:<roomId>`), instanced walls with a door gap at every room door, and the bridges. Hover and click report the room id; the indoor route is a ribbon over the corridor and bridge at their real elevations. Room-number labels are shown only for a single selected building, the destination and the hovered room (three buildings of labels overlap at the zoom of a whole-campus walk).

## Rendering notes

- Orthographic isometric camera with drei `OrbitControls`; demand frameloop (the scene invalidates only while something changes). `dpr` is capped. See `src/lib/model/camera.ts` for the camera pose maths.
- Walls and trees are instanced meshes; geometries and materials are created once and disposed on unmount.
- Labels are DOM (`SceneLabel` over drei `Html`) so Persian text uses the page font; they never capture the pointer.
- WebGL is probed once; without it the page shows a fallback and search still works. `SceneErrorBoundary` catches scene errors.

## Honesty rules

- Names and room numbers were read from hand-written, low-resolution photos: they are `confidence: "low"` in `scripts/cad/campus-offices.json` (only office 430 was confirmed) and must be proofread.
- Interior geometry is designed from the sketches and the shape of each footprint; it is not a survey.
- Heights, the pond and the trees are visualisation only.

## Testing

`tests/3d/scene.test.tsx` renders the real scene headlessly with `@react-three/test-renderer` (no GPU) and checks the scene graph: buildings, first floors, bridges, selectable rooms and the indoor route. Pixel output and GPU behaviour are not covered.
