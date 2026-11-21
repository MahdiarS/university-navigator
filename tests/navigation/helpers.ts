import { loadDemoData } from "@/lib/data/demo-source";
import { buildGraph } from "@/lib/navigation";

export const data = loadDemoData();
export const graph = buildGraph(data.nodes, data.edges);

export const roomDoor = (roomId: string): string => {
  const room = data.rooms.find((r) => r.id === roomId);
  if (!room?.doorNodeId) throw new Error(`room ${roomId} has no door node`);
  return room.doorNodeId;
};

export const ENTRANCE = "n-f00-entrance";
// Demo rooms (see scripts/generate-demo-data.mjs)
export const EDUCATION = "b01-f00-r01"; // floor 0, north row
export const STUDENT_AFFAIRS = "b01-f00-r02";
export const STUDY_HALL = "b01-f00-r03"; // demo: threshold NOT marked accessible
export const FINANCE = "b01-f01-r01";
export const SECRETARIAT = "b01-f02-r01";
