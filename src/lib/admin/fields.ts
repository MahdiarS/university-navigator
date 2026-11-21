import type { ResourceKey } from "@/lib/data/types";
import {
  EDGE_TYPES,
  NODE_TYPES,
  ROOM_TYPES,
} from "@/lib/data/schemas";

/**
 * Declarative description of the admin forms. One generic editor renders every resource from this table, so adding a
 * field means adding one line here (and a column in database/schema.sql).
 */
export type FieldKind = "text" | "textarea" | "number" | "boolean" | "select" | "keywords" | "ref";

export interface FieldDef {
  key: string;
  label: string;
  kind: FieldKind;
  hint?: string;
  /** direction-neutral technical values (ids, slugs, urls, phone) are shown left-to-right */
  ltr?: boolean;
  options?: readonly { value: string; label: string }[];
  /** for kind "ref": the resource whose records can be chosen */
  ref?: ResourceKey;
  /** immutable after creation (stable ids) */
  createOnly?: boolean;
  step?: string;
  /** for kind "ref": the value may be left empty (stored as null) */
  optional?: boolean;
}

export interface ResourceForm {
  /** label for one record, e.g. "واحد" */
  singular: string;
  fields: readonly FieldDef[];
  /** how a record is shown in lists and reference pickers */
  title: (record: Record<string, unknown>) => string;
  /** columns shown in the list table (keys of fields) */
  listColumns: readonly string[];
  /** prefilled values for the "new" form */
  defaults: Record<string, unknown>;
}

const opts = (values: readonly string[], labels: Record<string, string>) =>
  values.map((v) => ({ value: v, label: labels[v] ?? v }));

const ID: FieldDef = { key: "id", label: "شناسه ثابت", kind: "text", ltr: true, createOnly: true, hint: "فقط حروف انگلیسی، عدد، - و _ ؛ پس از ثبت قابل تغییر نیست." };
const DEMO: FieldDef = { key: "isDemo", label: "رکورد نمونه (دمو)", kind: "boolean", hint: "برای اطلاعات واقعی و تأیید‌شده این گزینه را خاموش کنید." };

const str = (v: unknown) => (typeof v === "string" ? v : "");

export const RESOURCE_FORMS: Record<Exclude<ResourceKey, never>, ResourceForm> = {
  departments: {
    singular: "واحد",
    title: (r) => str(r["name"]),
    listColumns: ["name", "roomId", "phone", "isActive"],
    defaults: { isActive: true, isDemo: false, keywords: [] },
    fields: [
      ID,
      { key: "name", label: "نام واحد", kind: "text" },
      { key: "slug", label: "slug (نشانی صفحه)", kind: "text", ltr: true, hint: "حروف کوچک انگلیسی و - ، مثلاً education-office" },
      { key: "roomId", label: "اتاق", kind: "ref", ref: "rooms", hint: "چند واحد می‌توانند در یک اتاق باشند." },
      { key: "description", label: "توضیحات", kind: "textarea" },
      { key: "phone", label: "تلفن", kind: "text", ltr: true, hint: "خالی بگذارید اگر تأیید نشده است." },
      { key: "workingHours", label: "ساعت کاری", kind: "text", hint: "خالی بگذارید اگر تأیید نشده است." },
      { key: "keywords", label: "کلیدواژه‌های جستجو", kind: "keywords", hint: "با ویرگول یا خط جدید جدا کنید." },
      { key: "isActive", label: "فعال (نمایش عمومی)", kind: "boolean" },
      DEMO,
    ],
  },
  services: {
    singular: "خدمت",
    title: (r) => str(r["serviceName"]),
    listColumns: ["serviceName", "departmentId"],
    defaults: { isDemo: false, keywords: [] },
    fields: [
      ID,
      { key: "departmentId", label: "واحد", kind: "ref", ref: "departments" },
      { key: "serviceName", label: "نام خدمت", kind: "text" },
      { key: "keywords", label: "کلیدواژه‌ها", kind: "keywords", hint: "با ویرگول یا خط جدید جدا کنید." },
      DEMO,
    ],
  },
  rooms: {
    singular: "اتاق",
    title: (r) => `${str(r["roomNumber"])} · ${str(r["name"])}`,
    listColumns: ["roomNumber", "name", "floorId", "roomType"],
    defaults: { roomType: "office", positionX: 0, positionY: 0, positionZ: 0, isDemo: false },
    fields: [
      ID,
      { key: "floorId", label: "طبقه", kind: "ref", ref: "floors" },
      { key: "roomNumber", label: "شماره اتاق", kind: "text" },
      { key: "name", label: "نام اتاق", kind: "text" },
      {
        key: "roomType",
        label: "نوع اتاق",
        kind: "select",
        options: opts(ROOM_TYPES, {
          office: "دفتر", classroom: "کلاس", lab: "آزمایشگاه", meeting: "اتاق جلسات", study: "سالن مطالعه",
          library: "کتابخانه", lobby: "لابی", restroom: "سرویس بهداشتی", hall: "سالن", other: "سایر",
        }),
      },
      { key: "modelObjectId", label: "شناسه آبجکت در مدل سه‌بعدی", kind: "text", ltr: true, hint: "باید با نام mesh در GLB یکی باشد." },
      { key: "positionX", label: "موقعیت X (متر)", kind: "number", step: "0.01" },
      { key: "positionY", label: "موقعیت Y (متر)", kind: "number", step: "0.01" },
      { key: "positionZ", label: "موقعیت Z (متر)", kind: "number", step: "0.01" },
      { key: "doorNodeId", label: "گره درِ اتاق", kind: "ref", ref: "nodes", optional: true, hint: "گره‌ی مسیریابی از نوع room-door." },
      DEMO,
    ],
  },
  floors: {
    singular: "طبقه",
    title: (r) => str(r["displayName"]),
    listColumns: ["displayName", "buildingId", "floorNumber", "elevation"],
    defaults: { floorNumber: 0, elevation: 0, isDemo: false },
    fields: [
      ID,
      { key: "buildingId", label: "ساختمان", kind: "ref", ref: "buildings" },
      { key: "floorNumber", label: "شماره طبقه", kind: "number", step: "1" },
      { key: "displayName", label: "نام نمایشی", kind: "text" },
      { key: "elevation", label: "ارتفاع کف (متر)", kind: "number", step: "0.01" },
      { key: "modelUrl", label: "مسیر مدل GLB این طبقه", kind: "text", ltr: true, hint: "مثلاً /models/building-01/floors/floor-00.glb ؛ خالی = مدل نمایشی/مانیفست." },
      DEMO,
    ],
  },
  buildings: {
    singular: "ساختمان",
    title: (r) => str(r["name"]),
    listColumns: ["name", "slug", "isActive"],
    defaults: { isActive: true, isDemo: false },
    fields: [
      ID,
      { key: "name", label: "نام ساختمان", kind: "text" },
      { key: "slug", label: "slug (نشانی صفحه)", kind: "text", ltr: true },
      { key: "description", label: "توضیحات", kind: "textarea" },
      { key: "modelUrl", label: "مسیر مدل GLB بیرونی", kind: "text", ltr: true, hint: "مثلاً /models/building-01/exterior.glb" },
      { key: "isActive", label: "فعال", kind: "boolean" },
      DEMO,
    ],
  },
  entrances: {
    singular: "ورودی",
    title: (r) => str(r["name"]),
    listColumns: ["name", "buildingId", "floorId", "nodeId"],
    defaults: { positionX: 0, positionY: 0, positionZ: 0, isDemo: false },
    fields: [
      ID,
      { key: "buildingId", label: "ساختمان", kind: "ref", ref: "buildings" },
      { key: "floorId", label: "طبقه", kind: "ref", ref: "floors" },
      { key: "name", label: "نام ورودی", kind: "text" },
      { key: "positionX", label: "موقعیت X (متر)", kind: "number", step: "0.01" },
      { key: "positionY", label: "موقعیت Y (متر)", kind: "number", step: "0.01" },
      { key: "positionZ", label: "موقعیت Z (متر)", kind: "number", step: "0.01" },
      { key: "nodeId", label: "گره‌ی مسیریابی ورودی", kind: "ref", ref: "nodes", optional: true },
      DEMO,
    ],
  },
  nodes: {
    singular: "گره",
    title: (r) => `${str(r["id"])}${r["label"] ? ` — ${str(r["label"])}` : ""}`,
    listColumns: ["id", "type", "floorId", "label"],
    defaults: { type: "corridor", x: 0, y: 0, z: 0, isDemo: false },
    fields: [
      ID,
      { key: "floorId", label: "طبقه", kind: "ref", ref: "floors" },
      {
        key: "type",
        label: "نوع گره",
        kind: "select",
        options: opts(NODE_TYPES, {
          entrance: "ورودی", corridor: "راهرو", junction: "تقاطع", "room-door": "درِ اتاق", stair: "راه‌پله", elevator: "آسانسور",
        }),
      },
      { key: "x", label: "X (متر)", kind: "number", step: "0.01" },
      { key: "y", label: "Y (متر)", kind: "number", step: "0.01" },
      { key: "z", label: "Z (متر)", kind: "number", step: "0.01" },
      { key: "label", label: "برچسب", kind: "text" },
      DEMO,
    ],
  },
  edges: {
    singular: "یال",
    title: (r) => `${str(r["fromNode"])} → ${str(r["toNode"])}`,
    listColumns: ["fromNode", "toNode", "edgeType", "distance", "accessible"],
    defaults: { edgeType: "corridor", distance: 1, accessible: false, bidirectional: true, isDemo: false },
    fields: [
      ID,
      { key: "fromNode", label: "از گره", kind: "ref", ref: "nodes" },
      { key: "toNode", label: "به گره", kind: "ref", ref: "nodes" },
      { key: "distance", label: "فاصله (متر)", kind: "number", step: "0.01" },
      {
        key: "edgeType",
        label: "نوع اتصال",
        kind: "select",
        options: opts(EDGE_TYPES, { corridor: "راهرو", door: "در", stairs: "پله", elevator: "آسانسور" }),
      },
      { key: "accessible", label: "بدون پله (قابل‌دسترس)", kind: "boolean", hint: "فقط وقتی اتصال واقعاً بدون پله و تأیید شده است روشن کنید." },
      { key: "bidirectional", label: "دوطرفه", kind: "boolean" },
      DEMO,
    ],
  },
};

/** Parse the textarea/comma value of a keywords field. */
export function parseKeywords(raw: string): string[] {
  return raw
    .split(/[\n,،;؛]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}
