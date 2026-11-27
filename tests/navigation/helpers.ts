import { loadDemoData } from "@/lib/data/demo-source";
import { buildGraph } from "@/lib/navigation";

/** The bundled campus data: site plan + the designed first floors of buildings 1, 2 and 3 (data/indoor). */
export const data = loadDemoData();
export const graph = buildGraph(data.nodes, data.edges);

export const roomDoor = (roomId: string): string => {
  const room = data.rooms.find((r) => r.id === roomId);
  if (!room?.doorNodeId) throw new Error(`room ${roomId} has no door node`);
  return room.doorNodeId;
};

// Outdoor entrances (owner-marked doors): building 3 and building 1. Building 2 has none, it is reached by sky bridge.
export const ENTRANCE_B3 = "campus-b3-entrance";
export const ENTRANCE_B1 = "campus-b1-entrance";
export const ENTRANCE = ENTRANCE_B3;
// First-floor offices on each building (see scripts/cad/campus-offices.json)
export const B3_OFFICE_440 = "campus-b3-r440";
export const B2_OFFICE_430 = "campus-b2-r430"; // علیرضا حریری ایرج
export const B1_OFFICE_400 = "campus-b1-r400";
