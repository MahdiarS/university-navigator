#!/usr/bin/env node
/**
 * Generates the DEMO dataset from one declarative layout, so that
 *   - data/demo/*.json            (used by the app in demo mode)
 *   - data/demo/model-manifest.json (procedural geometry + object-ID map)
 *   - database/seed.sql           (Supabase seed)
 * can never drift apart.
 *
 * Everything produced here is FICTIONAL demo content (isDemo: true).
 * Run:  node scripts/generate-demo-data.mjs
 *
 * Coordinate convention (shared by data, navigation graph and 3D model):
 *   X = horizontal axis one (east  +),
 *   Y = vertical elevation (up +),
 *   Z = horizontal axis two (south +; -Z is "north" in plan view).
 *   Unit = meter. Origin = centre of the building footprint at ground level.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, "data", "demo");
mkdirSync(outDir, { recursive: true });

const BUILDING_ID = "building-01";
const r2 = (n) => Math.round(n * 100) / 100;
const pad2 = (n) => String(n).padStart(2, "0");

// ---------------------------------------------------------------- building
const buildings = [
  {
    id: BUILDING_ID,
    name: "ساختمان نمونه ۰۱ (دمو)",
    slug: "building-01",
    description:
      "ساختمان فرضی برای نمایش قابلیت‌های سامانه. این ساختمان واقعی نیست و جایگزین نقشه‌های رسمی دانشگاه خواهد شد.",
    modelUrl: null,
    isActive: true,
    isDemo: true,
  },
];

// ---------------------------------------------------------------- floors
// elevation = Y of the walking surface (top of slab). Floor-to-floor height = 4 m.
const FLOOR_HEIGHT = 4;
const floorDefs = [
  { number: 0, displayName: "همکف" },
  { number: 1, displayName: "طبقه اول" },
  { number: 2, displayName: "طبقه دوم" },
];
const floors = floorDefs.map((f) => ({
  id: `floor-${pad2(f.number)}`,
  buildingId: BUILDING_ID,
  floorNumber: f.number,
  displayName: f.displayName,
  elevation: f.number * FLOOR_HEIGHT,
  modelUrl: null,
  isDemo: true,
}));

// ---------------------------------------------------------------- layout
// Footprint 40 x 24 m. Central corridor (3 m wide) along X at z in [-1.5, 1.5].
// North row rooms: z in [-12, -1.5]; south row rooms: z in [1.5, 12].
// West end: stair core (north) and elevator shaft (south). Main entrance: south wall, x = 0.
const FOOTPRINT = { minX: -20, maxX: 20, minZ: -12, maxZ: 12 };
const CORRIDOR = { minZ: -1.5, maxZ: 1.5 };
const STAIR_CORE = { minX: -20, maxX: -14, minZ: -12, maxZ: -1.5 };
const ELEVATOR_SHAFT = { minX: -19, maxX: -15, minZ: 1.5, maxZ: 5.5 };
const STAIR_NODE = { x: -17, z: -3 };
const ELEV_NODE = { x: -17, z: 3.5 };

/** slot key -> geometry. doorSide: which corridor wall the door is in. */
const slots = [
  { key: "r01", row: "N", x0: -14, x1: -5 },
  { key: "r02", row: "N", x0: -5, x1: 5 },
  { key: "r03", row: "N", x0: 5, x1: 12.5 },
  { key: "r04", row: "N", x0: 12.5, x1: 20 },
  { key: "r05", row: "S", x0: -14, x1: -5 },
  { key: "r06", row: "S", x0: -5, x1: 5 },
  { key: "r07", row: "S", x0: 5, x1: 20 },
].map((s) => ({
  ...s,
  z0: s.row === "N" ? -12 : 1.5,
  z1: s.row === "N" ? -1.5 : 12,
  doorSide: s.row === "N" ? "north" : "south",
  doorX: r2((s.x0 + s.x1) / 2),
  doorZ: s.row === "N" ? -1.5 : 1.5,
}));

// Per-floor room content. dept = department slug hosted (may be several).
const roomContent = {
  0: {
    r01: { name: "اداره آموزش", type: "office" },
    r02: { name: "امور دانشجویی", type: "office" },
    r03: { name: "سالن مطالعه نمونه", type: "study", stepFree: false },
    r04: { name: "سرویس بهداشتی", type: "restroom" },
    r05: { name: "کلاس نمونه", type: "classroom" },
    r06: { name: "لابی ورودی", type: "lobby" },
    r07: { name: "سالن همایش نمونه", type: "hall" },
  },
  1: {
    r01: { name: "امور مالی", type: "office" },
    r02: { name: "کتابخانه", type: "library" },
    r03: { name: "اتاق جلسات نمونه", type: "meeting" },
    r04: { name: "سرویس بهداشتی", type: "restroom" },
    r05: { name: "کلاس نمونه", type: "classroom" },
    r06: { name: "آزمایشگاه نمونه", type: "lab" },
    r07: { name: "کلاس نمونه", type: "classroom" },
  },
  2: {
    r01: { name: "دفتر دبیرخانه و بایگانی", type: "office" },
    r02: { name: "مرکز فناوری اطلاعات", type: "office" },
    r03: { name: "اتاق جلسات نمونه", type: "meeting" },
    r04: { name: "سرویس بهداشتی", type: "restroom" },
    r05: { name: "کلاس نمونه", type: "classroom" },
    r06: { name: "آزمایشگاه نمونه", type: "lab" },
    r07: { name: "اتاق اساتید نمونه", type: "office" },
  },
};

const roomId = (fn, key) => `b01-f${pad2(fn)}-${key}`;
const objectId = (fn, key) => `ROOM_B01_F${pad2(fn)}_${key.toUpperCase()}`;
const roomNumber = (fn, key) => `${fn}${pad2(Number(key.slice(1)))}`;
const nodeIdDoor = (fn, key) => `n-f${pad2(fn)}-door-${key}`;
const nodeIdCorr = (fn, i) => `n-f${pad2(fn)}-corr-${i}`;

// ---------------------------------------------------------------- nodes
const corridorXs = [-17, -9.5, 0, 8.75, 12.5, 16.25, 19];
const nodes = [];
const edges = [];

const pushNode = (n) => nodes.push({ buildingId: BUILDING_ID, label: null, isDemo: true, ...n });
const euclid = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
const nodeById = new Map();
const addNode = (n) => {
  pushNode(n);
  nodeById.set(n.id, nodes[nodes.length - 1]);
};
const addEdge = ({ from, to, edgeType, accessible = true, bidirectional = true, distance }) => {
  const a = nodeById.get(from);
  const b = nodeById.get(to);
  const d = distance ?? r2(euclid(a, b));
  edges.push({
    id: `e-${from.replace(/^n-/, "")}--${to.replace(/^n-/, "")}`,
    fromNode: from,
    toNode: to,
    distance: d,
    edgeType,
    accessible,
    bidirectional,
    isDemo: true,
  });
};

const doorXsUsed = new Set(slots.map((s) => s.doorX));
for (const fl of floors) {
  const fn = fl.floorNumber;
  const y = fl.elevation;
  const fName = fl.displayName;
  // corridor spine
  corridorXs.forEach((x, i) => {
    const isJunction = x === -17 || doorXsUsed.has(x);
    addNode({
      id: nodeIdCorr(fn, i),
      floorId: fl.id,
      x,
      y,
      z: 0,
      type: isJunction ? "junction" : "corridor",
      label: `راهرو ${fName} — نقطه ${i + 1} (نمونه)`,
    });
    if (i > 0) {
      addEdge({ from: nodeIdCorr(fn, i - 1), to: nodeIdCorr(fn, i), edgeType: "corridor" });
    }
  });
  // room doors
  for (const s of slots) {
    const content = roomContent[fn][s.key];
    const id = nodeIdDoor(fn, s.key);
    addNode({
      id,
      floorId: fl.id,
      x: s.doorX,
      y,
      z: s.doorZ,
      type: "room-door",
      label: `درِ ${content.name} (${fName})`,
    });
    addEdge({
      from: nodeIdCorr(fn, corridorXs.indexOf(s.doorX)),
      to: id,
      edgeType: "door",
      accessible: content.stepFree !== false,
    });
  }
  // stairs + elevator landings
  addNode({
    id: `n-f${pad2(fn)}-stair`,
    floorId: fl.id,
    x: STAIR_NODE.x,
    y,
    z: STAIR_NODE.z,
    type: "stair",
    label: `راه‌پله (${fName})`,
  });
  addEdge({ from: nodeIdCorr(fn, 0), to: `n-f${pad2(fn)}-stair`, edgeType: "door" });
  addNode({
    id: `n-f${pad2(fn)}-elev`,
    floorId: fl.id,
    x: ELEV_NODE.x,
    y,
    z: ELEV_NODE.z,
    type: "elevator",
    label: `آسانسور (${fName})`,
  });
  addEdge({ from: nodeIdCorr(fn, 0), to: `n-f${pad2(fn)}-elev`, edgeType: "door" });
}

// main entrance (ground floor, south wall) joined to the lobby door
addNode({
  id: "n-f00-entrance",
  floorId: "floor-00",
  x: 0,
  y: 0,
  z: 12,
  type: "entrance",
  label: "ورودی اصلی (نمونه)",
});
addEdge({ from: "n-f00-entrance", to: nodeIdDoor(0, "r06"), edgeType: "corridor" });

// vertical links. distance >= straight-line distance keeps the A* heuristic admissible.
// Stairs: 7 m of walking per 4 m rise. Elevator: 8 m equivalent (waiting + ride), step-free.
for (let fn = 0; fn < floors.length - 1; fn++) {
  addEdge({
    from: `n-f${pad2(fn)}-stair`,
    to: `n-f${pad2(fn + 1)}-stair`,
    edgeType: "stairs",
    accessible: false,
    distance: 7,
  });
  addEdge({
    from: `n-f${pad2(fn)}-elev`,
    to: `n-f${pad2(fn + 1)}-elev`,
    edgeType: "elevator",
    accessible: true,
    distance: 8,
  });
}

// ---------------------------------------------------------------- rooms
const rooms = [];
for (const fl of floors) {
  const fn = fl.floorNumber;
  for (const s of slots) {
    const c = roomContent[fn][s.key];
    rooms.push({
      id: roomId(fn, s.key),
      floorId: fl.id,
      roomNumber: roomNumber(fn, s.key),
      name: c.name,
      roomType: c.type,
      modelObjectId: objectId(fn, s.key),
      positionX: r2((s.x0 + s.x1) / 2),
      positionY: fl.elevation,
      positionZ: r2((s.z0 + s.z1) / 2),
      doorNodeId: nodeIdDoor(fn, s.key),
      isDemo: true,
    });
  }
}

// ---------------------------------------------------------------- departments
const dept = (slug, roomRef, name, description, keywords, services) => ({
  slug,
  roomRef,
  name,
  description,
  keywords,
  services,
});
const demoNote = "این توضیح نمونه است و اطلاعات رسمی دانشگاه نیست.";
const deptDefs = [
  dept(
    "education-office",
    [0, "r01"],
    "اداره آموزش",
    `واحد نمونه برای نمایش خدمات آموزشی. ${demoNote}`,
    ["education", "education office", "آموزش", "آموزشی"],
    [
      ["ثبت‌نام", ["ثبت نام", "ترم", "نام نویسی"]],
      ["انتخاب واحد و حذف و اضافه", ["انتخاب واحد", "حذف و اضافه", "واحد"]],
      ["کارنامه و ریزنمرات", ["نمره", "کارنامه", "ریز نمرات"]],
      ["گواهی و دانش‌آموختگی", ["گواهی اشتغال به تحصیل", "فارغ التحصیلی", "مدرک"]],
    ],
  ),
  dept(
    "student-affairs",
    [0, "r02"],
    "امور دانشجویی",
    `واحد نمونه برای نمایش خدمات رفاهی و فرهنگی دانشجویان. ${demoNote}`,
    ["student affairs", "student", "دانشجویی", "رفاه"],
    [
      ["خوابگاه", ["اسکان", "خوابگاه"]],
      ["وام و تسهیلات دانشجویی", ["وام", "رفاهی", "تسهیلات"]],
      ["فعالیت‌های فرهنگی و انجمن‌ها", ["انجمن", "فرهنگی", "تشکل"]],
    ],
  ),
  dept(
    "finance-office",
    [1, "r01"],
    "امور مالی",
    `واحد نمونه برای نمایش خدمات مالی و شهریه. ${demoNote}`,
    ["finance", "finance office", "مالی", "حسابداری"],
    [
      ["پرداخت شهریه", ["شهریه", "پرداخت", "فیش"]],
      ["تسویه حساب", ["تسویه", "تسویه حساب"]],
      ["استرداد وجه", ["بازپرداخت", "استرداد"]],
    ],
  ),
  dept(
    "library",
    [1, "r02"],
    "کتابخانه",
    `واحد نمونه برای نمایش خدمات کتابخانه. ${demoNote}`,
    ["library", "کتابخانه", "کتاب"],
    [
      ["امانت کتاب", ["کتاب", "امانت", "عضویت"]],
      ["جستجوی منابع", ["منابع", "پایان نامه", "مقاله"]],
    ],
  ),
  dept(
    "secretariat",
    [2, "r01"],
    "دبیرخانه",
    `واحد نمونه برای نمایش ثبت و ارجاع مکاتبات اداری. ${demoNote}`,
    ["secretariat", "دبیرخانه", "مکاتبات", "اداری"],
    [
      ["ثبت و ارجاع نامه‌ها", ["نامه", "مکاتبات", "ارجاع"]],
      ["تأیید اسناد", ["تایید", "مهر", "سند"]],
    ],
  ),
  dept(
    "archive",
    [2, "r01"],
    "بایگانی",
    `واحد نمونه که در همان اتاق دبیرخانه قرار دارد (نمونه‌ای از چند واحد در یک اتاق). ${demoNote}`,
    ["archive", "بایگانی", "سوابق"],
    [["درخواست سوابق", ["سوابق", "بایگانی", "پرونده"]]],
  ),
  dept(
    "it-center",
    [2, "r02"],
    "مرکز فناوری اطلاعات",
    `واحد نمونه برای نمایش خدمات شبکه و حساب کاربری. ${demoNote}`,
    ["it", "it center", "فناوری اطلاعات", "کامپیوتر"],
    [
      ["حساب کاربری و رمز عبور", ["رمز عبور", "ایمیل", "حساب کاربری"]],
      ["شبکه بی‌سیم و اینترنت", ["وای فای", "اینترنت", "wifi"]],
    ],
  ),
];

const departments = [];
const services = [];
for (const d of deptDefs) {
  const id = `dept-${d.slug}`;
  departments.push({
    id,
    roomId: roomId(d.roomRef[0], d.roomRef[1]),
    name: d.name,
    slug: d.slug,
    description: d.description,
    phone: null,
    workingHours: null,
    keywords: d.keywords,
    isActive: true,
    isDemo: true,
  });
  d.services.forEach(([serviceName, keywords], i) => {
    services.push({
      id: `svc-${d.slug}-${pad2(i + 1)}`,
      departmentId: id,
      serviceName,
      keywords,
      isDemo: true,
    });
  });
}

// ---------------------------------------------------------------- entrances / facilities
const entrances = [
  {
    id: "entrance-b01-main",
    buildingId: BUILDING_ID,
    floorId: "floor-00",
    name: "ورودی اصلی (نمونه)",
    positionX: 0,
    positionY: 0,
    positionZ: 12,
    nodeId: "n-f00-entrance",
    isDemo: true,
  },
];

const facilities = [];
for (const fl of floors) {
  const fn = fl.floorNumber;
  facilities.push(
    {
      id: `fac-f${pad2(fn)}-stairs`,
      floorId: fl.id,
      facilityType: "stairs",
      name: `راه‌پله (${fl.displayName})`,
      positionX: STAIR_NODE.x,
      positionY: fl.elevation,
      positionZ: STAIR_NODE.z,
      isDemo: true,
    },
    {
      id: `fac-f${pad2(fn)}-elevator`,
      floorId: fl.id,
      facilityType: "elevator",
      name: `آسانسور (${fl.displayName})`,
      positionX: ELEV_NODE.x,
      positionY: fl.elevation,
      positionZ: ELEV_NODE.z,
      isDemo: true,
    },
  );
  const restroom = slots.find((s) => roomContent[fn][s.key].type === "restroom");
  facilities.push({
    id: `fac-f${pad2(fn)}-restroom`,
    floorId: fl.id,
    facilityType: "restroom",
    name: `سرویس بهداشتی (${fl.displayName})`,
    positionX: r2((restroom.x0 + restroom.x1) / 2),
    positionY: fl.elevation,
    positionZ: r2((restroom.z0 + restroom.z1) / 2),
    isDemo: true,
  });
}

// ---------------------------------------------------------------- manifest
const objectMap = Object.fromEntries(rooms.map((r) => [r.modelObjectId, r.id]));
const roomLayout = {};
for (const fl of floors) {
  const fn = fl.floorNumber;
  for (const s of slots) {
    roomLayout[roomId(fn, s.key)] = {
      minX: s.x0,
      maxX: s.x1,
      minZ: s.z0,
      maxZ: s.z1,
      doorSide: s.doorSide,
      doorX: s.doorX,
    };
  }
}

const glbBase = `/models/${BUILDING_ID}`;
const manifest = {
  schemaVersion: 1,
  isDemo: true,
  note: "DEMO manifest. status 'unavailable' means no GLB file exists yet, so the procedural demo model is used. Set status to 'available' once the real file is placed under public/models/.",
  units: "meters",
  coordinateSystem: {
    x: "horizontal axis one (east +)",
    y: "vertical elevation (up +)",
    z: "horizontal axis two (south +, i.e. -Z is north in plan view)",
    origin: "centre of the building footprint at ground-floor walking level",
  },
  buildings: [
    {
      buildingId: BUILDING_ID,
      exterior: { path: `${glbBase}/exterior.glb`, status: "unavailable" },
      floors: floors.map((f) => ({
        floorId: f.id,
        floorNumber: f.floorNumber,
        path: `${glbBase}/floors/floor-${pad2(f.floorNumber)}.glb`,
        status: "unavailable",
      })),
      objectMap,
      procedural: {
        footprint: FOOTPRINT,
        floorHeight: FLOOR_HEIGHT,
        slabThickness: 0.3,
        wallHeight: 3.7,
        wallThickness: 0.25,
        doorWidth: 1.6,
        corridor: CORRIDOR,
        stairCore: STAIR_CORE,
        elevatorShaft: ELEVATOR_SHAFT,
        stairNode: STAIR_NODE,
        elevatorNode: ELEV_NODE,
        mainEntrance: { x: 0, z: 12, width: 3, side: "south" },
        rooms: roomLayout,
      },
    },
  ],
  campus: {
    isDemo: true,
    ground: { width: 120, depth: 90 },
    buildings: [
      {
        buildingId: BUILDING_ID,
        slug: "building-01",
        label: "ساختمان نمونه ۰۱ (دمو)",
        position: { x: 0, z: 0 },
        size: { width: 40, depth: 24, height: 12 },
        clickable: true,
        entrance: { x: 0, z: 12 },
      },
      {
        buildingId: null,
        slug: null,
        label: "ساختمان‌های دیگر (به‌زودی)",
        position: { x: -42, z: -22 },
        size: { width: 22, depth: 16, height: 8 },
        clickable: false,
        entrance: null,
      },
      {
        buildingId: null,
        slug: null,
        label: "ساختمان‌های دیگر (به‌زودی)",
        position: { x: 40, z: -24 },
        size: { width: 20, depth: 14, height: 7 },
        clickable: false,
        entrance: null,
      },
    ],
    paths: [
      { id: "path-main", points: [{ x: 0, z: 44 }, { x: 0, z: 12 }], width: 3 },
      { id: "path-cross", points: [{ x: -52, z: 22 }, { x: 52, z: 22 }], width: 2.4 },
      { id: "path-west", points: [{ x: -30, z: 22 }, { x: -30, z: -10 }, { x: -34, z: -10 }], width: 2 },
      { id: "path-east", points: [{ x: 30, z: 22 }, { x: 30, z: -12 }, { x: 34, z: -12 }], width: 2 },
    ],
    trees: [
      { x: -12, z: 28 }, { x: -18, z: 30 }, { x: 12, z: 28 }, { x: 18, z: 30 },
      { x: -8, z: 36 }, { x: 8, z: 36 }, { x: -24, z: 18 }, { x: 24, z: 18 },
      { x: -48, z: 32 }, { x: 48, z: 32 }, { x: -22, z: -20 }, { x: 22, z: -22 },
      { x: -4, z: -26 }, { x: 6, z: -28 },
    ],
  },
};

// ---------------------------------------------------------------- write JSON
const write = (name, data) =>
  writeFileSync(join(outDir, name), JSON.stringify(data, null, 2) + "\n", "utf8");

write("buildings.json", buildings);
write("floors.json", floors);
write("rooms.json", rooms);
write("departments.json", departments);
write("department-services.json", services);
write("entrances.json", entrances);
write("facilities.json", facilities);
write("navigation-nodes.json", nodes);
write("navigation-edges.json", edges);
write("model-manifest.json", manifest);

// ---------------------------------------------------------------- seed.sql
const q = (v) => {
  if (v === null || v === undefined) return "null";
  if (typeof v === "boolean") return v ? "true" : "false";
  if (typeof v === "number") return String(v);
  if (Array.isArray(v)) return `array[${v.map(q).join(", ")}]::text[]`;
  return `'${String(v).replace(/'/g, "''")}'`;
};
const insert = (table, cols, rows) =>
  `insert into public.${table} (${cols.join(", ")}) values\n` +
  rows.map((r) => `  (${r.map(q).join(", ")})`).join(",\n") +
  "\non conflict (id) do nothing;\n";

const sql = [];
sql.push(`-- DEMO SEED DATA — generated by scripts/generate-demo-data.mjs. DO NOT EDIT BY HAND.
-- Every row is fictional (is_demo = true). Replace with verified university data before production.
-- Run after database/schema.sql.
`);
sql.push(
  insert(
    "buildings",
    ["id", "name", "slug", "description", "model_url", "is_active", "is_demo"],
    buildings.map((b) => [b.id, b.name, b.slug, b.description, b.modelUrl, b.isActive, b.isDemo]),
  ),
);
sql.push(
  insert(
    "floors",
    ["id", "building_id", "floor_number", "display_name", "elevation", "model_url", "is_demo"],
    floors.map((f) => [f.id, f.buildingId, f.floorNumber, f.displayName, f.elevation, f.modelUrl, f.isDemo]),
  ),
);
sql.push(
  insert(
    "navigation_nodes",
    ["id", "floor_id", "node_type", "position_x", "position_y", "position_z", "label", "is_demo"],
    nodes.map((n) => [n.id, n.floorId, n.type, n.x, n.y, n.z, n.label, n.isDemo]),
  ),
);
sql.push(
  insert(
    "rooms",
    [
      "id", "floor_id", "room_number", "name", "room_type", "model_object_id",
      "position_x", "position_y", "position_z", "door_node_id", "is_demo",
    ],
    rooms.map((r) => [
      r.id, r.floorId, r.roomNumber, r.name, r.roomType, r.modelObjectId,
      r.positionX, r.positionY, r.positionZ, r.doorNodeId, r.isDemo,
    ]),
  ),
);
sql.push(
  insert(
    "departments",
    ["id", "room_id", "name", "slug", "description", "phone", "working_hours", "keywords", "is_active", "is_demo"],
    departments.map((d) => [
      d.id, d.roomId, d.name, d.slug, d.description, d.phone, d.workingHours, d.keywords, d.isActive, d.isDemo,
    ]),
  ),
);
sql.push(
  insert(
    "department_services",
    ["id", "department_id", "service_name", "keywords", "is_demo"],
    services.map((s) => [s.id, s.departmentId, s.serviceName, s.keywords, s.isDemo]),
  ),
);
sql.push(
  insert(
    "entrances",
    ["id", "building_id", "floor_id", "name", "position_x", "position_y", "position_z", "node_id", "is_demo"],
    entrances.map((e) => [
      e.id, e.buildingId, e.floorId, e.name, e.positionX, e.positionY, e.positionZ, e.nodeId, e.isDemo,
    ]),
  ),
);
sql.push(
  insert(
    "navigation_edges",
    ["id", "from_node_id", "to_node_id", "distance", "edge_type", "accessible", "bidirectional", "is_demo"],
    edges.map((e) => [e.id, e.fromNode, e.toNode, e.distance, e.edgeType, e.accessible, e.bidirectional, e.isDemo]),
  ),
);
sql.push(
  insert(
    "facilities",
    ["id", "floor_id", "facility_type", "name", "position_x", "position_y", "position_z", "is_demo"],
    facilities.map((f) => [f.id, f.floorId, f.facilityType, f.name, f.positionX, f.positionY, f.positionZ, f.isDemo]),
  ),
);
writeFileSync(join(root, "database", "seed.sql"), sql.join("\n"), "utf8");

console.log(
  `Generated demo data: ${buildings.length} building, ${floors.length} floors, ${rooms.length} rooms, ` +
    `${departments.length} departments, ${services.length} services, ${nodes.length} nodes, ${edges.length} edges.`,
);
