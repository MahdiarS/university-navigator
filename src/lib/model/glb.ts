import type { Object3D } from "three";
import type { BuildingModel } from "@/lib/data/types";

/**
 * GLB / glTF support helpers (pure: they only walk an Object3D tree).
 *
 * Contract for real models (see docs/3d-model-guide.md): every selectable room mesh is named exactly like
 * its `model_object_id` (e.g. ROOM_B01_F01_R03). Blender/glTF may add suffixes such as ".001" or wrap meshes
 * in groups, so we resolve a hit by walking up the parents and trimming a trailing ".NNN".
 */
export function stripBlenderSuffix(name: string): string {
  return name.replace(/\.\d{3}$/, "");
}

/** Resolve the room id for any object inside a loaded model, or null if it is not a mapped room. */
export function resolveRoomId(object: Object3D | null, objectMap: BuildingModel["objectMap"]): string | null {
  let cursor: Object3D | null = object;
  while (cursor) {
    const id = objectMap[stripBlenderSuffix(cursor.name)];
    if (id) return id;
    cursor = cursor.parent;
  }
  return null;
}

/** Collect every mesh (by room id) found in a loaded model. Useful for highlighting and diagnostics. */
export function indexRoomObjects(root: Object3D, objectMap: BuildingModel["objectMap"]): Map<string, Object3D[]> {
  const found = new Map<string, Object3D[]>();
  root.traverse((obj) => {
    const id = objectMap[stripBlenderSuffix(obj.name)];
    if (!id) return;
    const list = found.get(id) ?? [];
    list.push(obj);
    found.set(id, list);
  });
  return found;
}

/** Room ids declared in the object map that are missing from a loaded model (for a console warning). */
export function missingRooms(root: Object3D, objectMap: BuildingModel["objectMap"], roomIds: readonly string[]): string[] {
  const found = indexRoomObjects(root, objectMap);
  return roomIds.filter((id) => !found.has(id));
}
