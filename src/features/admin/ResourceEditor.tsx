"use client";
import { Pencil, Plus, Save, Trash2, X } from "lucide-react";
import { useMemo, useState, useTransition } from "react";
import { Badge, DemoBadge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Switch } from "@/components/ui/Switch";
import { canWrite } from "@/lib/admin/permissions";
import { RESOURCE_FORMS, parseKeywords, type FieldDef } from "@/lib/admin/fields";
import { RESOURCES } from "@/lib/data/resources";
import type { ResourceKey } from "@/lib/data/types";
import { normalizeText } from "@/lib/search/normalize";
import { cn } from "@/lib/utils/cn";
import type { AdminBackend } from "./types";

type Rec = Record<string, unknown>;
type Draft = Record<string, string | boolean>;

const inputClass =
  "w-full min-h-11 rounded-xl border border-gray-200 bg-white px-3 text-[15px] text-navy-900 focus:border-blue-600 disabled:bg-gray-100 disabled:text-gray-500";

function recordsOf(backend: AdminBackend, resource: ResourceKey): Rec[] {
  return backend.data[resource] as unknown as Rec[];
}

function toDraft(resource: ResourceKey, record: Rec | null): Draft {
  const form = RESOURCE_FORMS[resource];
  const source: Rec = record ?? form.defaults;
  const draft: Draft = {};
  for (const f of form.fields) {
    const v = source[f.key];
    if (f.kind === "boolean") draft[f.key] = Boolean(v);
    else if (f.kind === "keywords") draft[f.key] = Array.isArray(v) ? v.join("، ") : "";
    else draft[f.key] = v === null || v === undefined ? "" : String(v);
  }
  return draft;
}

/** Form values -> record. Empty optional refs become null; numbers are parsed here and re-validated by Zod. */
function toRecord(resource: ResourceKey, draft: Draft, backend: AdminBackend): Rec {
  const form = RESOURCE_FORMS[resource];
  const rec: Rec = {};
  for (const f of form.fields) {
    const raw = draft[f.key];
    switch (f.kind) {
      case "boolean":
        rec[f.key] = Boolean(raw);
        break;
      case "keywords":
        rec[f.key] = parseKeywords(String(raw ?? ""));
        break;
      case "number":
        rec[f.key] = String(raw).trim() === "" ? undefined : Number(raw);
        break;
      case "ref":
        rec[f.key] = String(raw) === "" ? (f.optional ? null : "") : String(raw);
        break;
      default:
        rec[f.key] = String(raw ?? "");
    }
  }
  if (resource === "nodes") {
    // The database derives the building from the floor; the domain schema keeps it for the router.
    const floor = backend.data.floors.find((f) => f.id === rec["floorId"]);
    rec["buildingId"] = floor?.buildingId ?? "";
  }
  return rec;
}

function cellText(backend: AdminBackend, resource: ResourceKey, record: Rec, key: string): string {
  const field = RESOURCE_FORMS[resource].fields.find((f) => f.key === key);
  const value = record[key];
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "boolean") return value ? "بله" : "خیر";
  if (field?.kind === "ref" && field.ref) {
    const target = recordsOf(backend, field.ref).find((r) => r["id"] === value);
    return target ? RESOURCE_FORMS[field.ref].title(target) : String(value);
  }
  if (field?.kind === "select") return field.options?.find((o) => o.value === value)?.label ?? String(value);
  return String(value);
}

function FieldInput({
  field,
  value,
  error,
  disabled,
  backend,
  onChange,
}: {
  field: FieldDef;
  value: string | boolean;
  error?: string;
  disabled: boolean;
  backend: AdminBackend;
  onChange: (v: string | boolean) => void;
}) {
  const id = `f-${field.key}`;
  const refOptions = useMemo(() => {
    if (field.kind !== "ref" || !field.ref) return [];
    const ref = field.ref;
    return recordsOf(backend, ref)
      .map((r) => ({ value: String(r["id"]), label: RESOURCE_FORMS[ref].title(r) }))
      .sort((a, b) => a.label.localeCompare(b.label, "fa"));
  }, [field, backend]);

  if (field.kind === "boolean") {
    return (
      <div className="rounded-xl border border-gray-200 bg-white px-3">
        <Switch checked={Boolean(value)} onChange={onChange} label={field.label} description={field.hint} />
      </div>
    );
  }
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-sm font-medium">{field.label}</label>
      {field.kind === "textarea" || field.kind === "keywords" ? (
        <textarea
          id={id}
          rows={field.kind === "textarea" ? 3 : 2}
          value={String(value)}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
          className={cn(inputClass, "py-2", field.ltr && "ltr")}
          aria-invalid={Boolean(error)}
        />
      ) : field.kind === "select" || field.kind === "ref" ? (
        <select
          id={id}
          value={String(value)}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
          className={inputClass}
          aria-invalid={Boolean(error)}
        >
          {(field.kind === "ref" ? field.optional : false) && <option value="">— بدون مقدار —</option>}
          {field.kind === "ref" && !field.optional && <option value="">انتخاب کنید…</option>}
          {(field.kind === "ref" ? refOptions : (field.options ?? [])).map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      ) : (
        <input
          id={id}
          type={field.kind === "number" ? "number" : "text"}
          step={field.step}
          inputMode={field.kind === "number" ? "decimal" : undefined}
          value={String(value)}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
          className={cn(inputClass, field.ltr && "ltr")}
          aria-invalid={Boolean(error)}
        />
      )}
      {field.hint && !error && <p className="mt-1 text-xs text-gray-500">{field.hint}</p>}
      {error && <p role="alert" className="mt-1 text-xs text-red-700">{error}</p>}
    </div>
  );
}

/** List + form for one resource. Works against any AdminBackend (Supabase via Server Actions, or local demo storage). */
export function ResourceEditor({ resource, backend }: { resource: ResourceKey; backend: AdminBackend }) {
  const form = RESOURCE_FORMS[resource];
  const records = recordsOf(backend, resource);
  const [filter, setFilter] = useState("");
  // editing: null = nothing open, "new" = creating, otherwise the id being edited
  const [editing, setEditing] = useState<string | "new" | null>(null);
  const [draft, setDraft] = useState<Draft>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  const canCreate = canWrite(backend.role ?? "admin", resource, "create");
  const canUpdate = canWrite(backend.role ?? "admin", resource, "update");
  const canDelete = canWrite(backend.role ?? "admin", resource, "delete");

  const rows = useMemo(() => {
    const q = normalizeText(filter);
    const list = q
      ? records.filter((r) => normalizeText(`${form.title(r)} ${Object.values(r).filter((v) => typeof v === "string").join(" ")}`).includes(q))
      : records;
    return [...list].sort((a, b) => form.title(a).localeCompare(form.title(b), "fa"));
  }, [records, filter, form]);

  const open = (id: string | "new") => {
    const record = id === "new" ? null : (records.find((r) => r["id"] === id) ?? null);
    setDraft(toDraft(resource, record));
    setEditing(id);
    setErrors({});
    setMessage(null);
  };

  const submit = () => {
    if (editing === null) return;
    const mode = editing === "new" ? "create" : "update";
    const record = toRecord(resource, draft, backend);
    // required references: a friendlier message than a schema error
    const missing: Record<string, string> = {};
    for (const f of form.fields) if (f.kind === "ref" && !f.optional && !record[f.key]) missing[f.key] = "یک مورد را انتخاب کنید.";
    if (Object.keys(missing).length > 0) {
      setErrors(missing);
      return;
    }
    startTransition(async () => {
      const result = await backend.save(resource, mode, record);
      if (result.ok) {
        setErrors({});
        setMessage({ tone: "ok", text: mode === "create" ? "رکورد ایجاد شد." : "تغییرات ذخیره شد." });
        if (mode === "create") setEditing(String(record["id"]));
      } else {
        setErrors(result.fieldErrors ?? {});
        setMessage({ tone: "error", text: result.error });
      }
    });
  };

  const remove = () => {
    if (editing === null || editing === "new") return;
    if (!window.confirm("این رکورد حذف شود؟ این کار قابل بازگشت نیست.")) return;
    startTransition(async () => {
      const result = await backend.remove(resource, editing);
      if (result.ok) {
        setEditing(null);
        setMessage({ tone: "ok", text: "رکورد حذف شد." });
      } else {
        setMessage({ tone: "error", text: result.error });
      }
    });
  };

  const readOnly = editing !== "new" && !canUpdate;

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,26rem)]">
      <section aria-label={`فهرست ${RESOURCES[resource].label}`} className="min-w-0 rounded-2xl border border-gray-200 bg-white">
        <div className="flex flex-wrap items-center gap-2 border-b border-gray-100 p-3">
          <input
            type="search"
            aria-label="فیلتر فهرست"
            placeholder="فیلتر…"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className={cn(inputClass, "max-w-xs flex-1")}
          />
          <span className="text-xs text-gray-500">{rows.length} مورد</span>
          <Button size="sm" className="ms-auto" disabled={!canCreate} onClick={() => open("new")}>
            <Plus className="size-4" aria-hidden />
            {form.singular} جدید
          </Button>
        </div>
        <div className="un-scroll max-h-[60dvh] overflow-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-gray-50 text-xs text-gray-500">
              <tr>
                {form.listColumns.map((k) => (
                  <th key={k} scope="col" className="px-3 py-2 text-start font-medium">
                    {form.fields.find((f) => f.key === k)?.label ?? k}
                  </th>
                ))}
                <th scope="col" className="w-10 px-2"><span className="sr-only">ویرایش</span></th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr><td colSpan={form.listColumns.length + 1} className="px-3 py-8 text-center text-gray-500">موردی وجود ندارد.</td></tr>
              )}
              {rows.map((r) => {
                const id = String(r["id"]);
                return (
                  <tr key={id} className={cn("border-t border-gray-100 hover:bg-gray-50", editing === id && "bg-blue-100/50")}>
                    {form.listColumns.map((k, i) => {
                      const field = form.fields.find((f) => f.key === k);
                      return (
                        <td key={k} className={cn("max-w-56 truncate px-3 py-2", field?.ltr && "ltr")}>
                          {i === 0 && r["isDemo"] === true ? <span className="me-2 inline-block"><DemoBadge /></span> : null}
                          {cellText(backend, resource, r, k)}
                        </td>
                      );
                    })}
                    <td className="px-2">
                      <button
                        type="button"
                        onClick={() => open(id)}
                        aria-label={`ویرایش ${form.title(r)}`}
                        className="grid size-9 place-items-center rounded-lg text-gray-500 hover:bg-gray-100"
                      >
                        <Pencil className="size-4" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section aria-label="ویرایشگر رکورد" className="min-w-0 rounded-2xl border border-gray-200 bg-white p-4">
        {editing === null ? (
          <p className="py-10 text-center text-sm text-gray-500">یک رکورد را برای ویرایش انتخاب کنید یا «{form.singular} جدید» بزنید.</p>
        ) : (
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              submit();
            }}
          >
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-base font-bold">{editing === "new" ? `${form.singular} جدید` : `ویرایش ${form.singular}`}</h2>
              <button type="button" aria-label="بستن" onClick={() => setEditing(null)} className="grid size-9 place-items-center rounded-lg text-gray-500 hover:bg-gray-100">
                <X className="size-4" />
              </button>
            </div>
            {readOnly && <Badge tone="neutral">فقط‌خواندنی برای نقش شما</Badge>}
            {form.fields.map((f) => (
              <FieldInput
                key={f.key}
                field={f}
                value={draft[f.key] ?? ""}
                error={errors[f.key]}
                disabled={readOnly || pending || (f.createOnly === true && editing !== "new")}
                backend={backend}
                onChange={(v) => setDraft((d) => ({ ...d, [f.key]: v }))}
              />
            ))}
            {message && (
              <p role={message.tone === "error" ? "alert" : "status"} className={cn("rounded-xl px-3 py-2 text-sm", message.tone === "error" ? "bg-red-50 text-red-700" : "bg-teal-100 text-teal-600")}>
                {message.text}
              </p>
            )}
            <div className="flex flex-wrap gap-2 pt-1">
              <Button type="submit" disabled={readOnly || pending}>
                <Save className="size-4" aria-hidden />
                {pending ? "در حال ذخیره…" : "ذخیره"}
              </Button>
              {editing !== "new" && canDelete && (
                <Button variant="danger" disabled={pending} onClick={remove}>
                  <Trash2 className="size-4" aria-hidden />
                  حذف
                </Button>
              )}
            </div>
          </form>
        )}
      </section>
    </div>
  );
}
