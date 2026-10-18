// P1 owns. F2.2/F2.3 custom fields: definitions are read at request time, so a new field
// is validated and shown immediately. Values live in the record's customFields JSON, keyed by FieldDef.key.
// Deleted fields keep their stored values (hidden, not lost).
import type { FieldEntity, FieldType } from "@prisma/client";
import { HttpError } from "@/lib/core/errors";
import type { scoped } from "@/lib/core/scoped";

export type FieldDefLite = { id: string; key: string; label: string; type: FieldType; options: string[]; pipelineId: string | null };
export type FieldValue = string | number | boolean | null;

type Db = ReturnType<typeof scoped>;

/** Active fields for an entity. Opportunity fields: shared ones + the ones for this pipeline (F2.3). */
export async function activeFields(db: Db, entity: FieldEntity, pipelineId?: string | null): Promise<FieldDefLite[]> {
  return db.fieldDef.findMany({
    where: {
      entity, deletedAt: null,
      ...(entity === "OPPORTUNITY" ? { OR: [{ pipelineId: null }, ...(pipelineId ? [{ pipelineId }] : [])] } : {}),
    },
    orderBy: [{ order: "asc" }, { label: "asc" }],
    select: { id: true, key: true, label: true, type: true, options: true, pipelineId: true },
  });
}

export function isFilled(v: unknown) {
  return !(v === undefined || v === null || v === "" || v === false);
}

/** Validate submitted values against the definitions. Unknown keys are ignored. Throws 422 with a plain message. */
export function validateCustomFields(defs: FieldDefLite[], input: Record<string, unknown> | undefined): Record<string, FieldValue> {
  const out: Record<string, FieldValue> = {};
  const src = input ?? {};
  for (const d of defs) {
    if (!(d.key in src)) continue;
    const v = src[d.key];
    if (v === undefined || v === null || v === "") { out[d.key] = d.type === "CHECKBOX" ? false : null; continue; }
    switch (d.type) {
      case "TEXT":
        if (typeof v !== "string" || v.length > 1000) throw new HttpError(422, `"${d.label}" must be text (up to 1000 characters).`);
        out[d.key] = v.trim();
        break;
      case "NUMBER": {
        const n = typeof v === "number" ? v : Number(String(v).trim());
        if (!Number.isFinite(n)) throw new HttpError(422, `"${d.label}" must be a number.`);
        out[d.key] = n;
        break;
      }
      case "DATE":
        if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v) || Number.isNaN(Date.parse(v))) {
          throw new HttpError(422, `"${d.label}" must be a valid date.`);
        }
        out[d.key] = v;
        break;
      case "DROPDOWN":
        if (typeof v !== "string" || !d.options.includes(v)) throw new HttpError(422, `"${d.label}" must be one of: ${d.options.join(", ")}.`);
        out[d.key] = v;
        break;
      case "CHECKBOX":
        if (typeof v !== "boolean") throw new HttpError(422, `"${d.label}" must be ticked or unticked.`);
        out[d.key] = v;
        break;
    }
  }
  return out;
}

/** Labels of required fields that are still empty (F2.5). */
export function missingRequired(defs: FieldDefLite[], requiredIds: string[], values: Record<string, unknown>) {
  return defs.filter((d) => requiredIds.includes(d.id) && !isFilled(values[d.key])).map((d) => d.label);
}

/** For the timeline's field_edit entry (F2.7). */
export function diffValues(labels: Record<string, string>, before: Record<string, unknown>, after: Record<string, unknown>) {
  const changes: { field: string; from: string; to: string }[] = [];
  for (const [key, label] of Object.entries(labels)) {
    if (!(key in after)) continue;
    const a = before[key] ?? null;
    const b = after[key] ?? null;
    if (JSON.stringify(a) !== JSON.stringify(b)) changes.push({ field: label, from: show(a), to: show(b) });
  }
  return changes;
}
const show = (v: unknown) => (v === null || v === undefined || v === "" ? "(empty)" : v === true ? "Yes" : v === false ? "No" : String(v));
