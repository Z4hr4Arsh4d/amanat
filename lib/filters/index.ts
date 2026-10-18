// P2 owns. Filter JSON → Prisma where (F2.6, Q9). Fields are whitelisted per entity (no injection):
// anything not listed below, or an operator not allowed for that field, is rejected with a plain message.
import { z } from "zod";
import { HttpError } from "@/lib/core/errors";

export type FilterOp = "eq" | "neq" | "in" | "has" | "gt" | "lt" | "between" | "contains";
export type Filter = { field: string; op: FilterOp; value: unknown };
export type FilterEntity = "contact" | "opportunity" | "lead";

type Kind = "string" | "id" | "date" | "number" | "tags" | "enum";
type Spec = { label: string; column: string; kind: Kind; ops: FilterOp[]; options?: string[]; needs?: "opportunity.value.view" };

const ID_OPS: FilterOp[] = ["eq", "neq", "in"];
const DATE_OPS: FilterOp[] = ["gt", "lt", "between"];
const STR_OPS: FilterOp[] = ["eq", "contains"];

const FIELDS: Record<FilterEntity, Record<string, Spec>> = {
  contact: {
    name: { label: "Name", column: "name", kind: "string", ops: STR_OPS },
    email: { label: "Email", column: "email", kind: "string", ops: STR_OPS },
    phone: { label: "Phone", column: "phone", kind: "string", ops: STR_OPS },
    owner: { label: "Owner", column: "ownerId", kind: "id", ops: ID_OPS },
    company: { label: "Company", column: "companyId", kind: "id", ops: ID_OPS },
    tag: { label: "Tag", column: "tags", kind: "tags", ops: ["has", "in"] },
    createdAt: { label: "Created", column: "createdAt", kind: "date", ops: DATE_OPS },
  },
  opportunity: {
    title: { label: "Title", column: "title", kind: "string", ops: STR_OPS },
    stage: { label: "Stage", column: "stageId", kind: "id", ops: ID_OPS },
    pipeline: { label: "Pipeline", column: "pipelineId", kind: "id", ops: ["eq", "in"] },
    owner: { label: "Owner", column: "ownerId", kind: "id", ops: ID_OPS },
    value: { label: "Value", column: "value", kind: "number", ops: ["gt", "lt", "between", "eq"], needs: "opportunity.value.view" },
    createdAt: { label: "Created", column: "createdAt", kind: "date", ops: DATE_OPS },
  },
  lead: {
    source: { label: "Source", column: "source", kind: "enum", ops: ["eq", "in"], options: ["WEB_FORM", "WHATSAPP", "MANUAL"] },
    status: { label: "Status", column: "status", kind: "enum", ops: ["eq", "in"], options: ["NEW", "ASSIGNED", "ACKNOWLEDGED", "UNASSIGNED", "CLOSED"] },
    owner: { label: "Owner", column: "ownerId", kind: "id", ops: ID_OPS },
    createdAt: { label: "Created", column: "createdAt", kind: "date", ops: DATE_OPS },
  },
};

/** Custom fields ("cf.budget") exist on contacts and opportunities only. */
const CF_ENTITIES: FilterEntity[] = ["contact", "opportunity"];
const CF_OPS: FilterOp[] = ["eq", "neq", "contains", "gt", "lt", "between", "in"];
const CF_KEY = /^[A-Za-z0-9_]{1,40}$/;

/** What the filter bar can offer (safe to send to the browser). */
export function fieldOptions(entity: FilterEntity) {
  return Object.entries(FIELDS[entity]).map(([field, s]) => ({ field, label: s.label, kind: s.kind, ops: s.ops, options: s.options, needs: s.needs }));
}
export const supportsCustomFields = (entity: FilterEntity) => CF_ENTITIES.includes(entity);

export const FilterSchema = z.array(z.object({
  field: z.string().trim().min(1).max(60),
  op: z.enum(["eq", "neq", "in", "has", "gt", "lt", "between", "contains"]),
  value: z.unknown(),
})).max(12, "Use 12 criteria or fewer.");

const bad = (msg: string) => new HttpError(422, msg);

function asString(v: unknown, label: string): string {
  if (typeof v !== "string" || v.trim() === "" || v.length > 200) throw bad(`Enter a value for ${label}.`);
  return v.trim();
}
function asList(v: unknown, label: string): string[] {
  const arr = Array.isArray(v) ? v : [v];
  const out = arr.map((x) => asString(x, label));
  if (out.length === 0 || out.length > 100) throw bad(`Pick between 1 and 100 values for ${label}.`);
  return out;
}
function asDate(v: unknown, label: string): Date {
  const d = new Date(typeof v === "string" ? v : NaN);
  if (Number.isNaN(d.getTime())) throw bad(`Enter a valid date for ${label}.`);
  return d;
}
function asNumber(v: unknown, label: string): number {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : NaN;
  if (!Number.isFinite(n)) throw bad(`Enter a number for ${label}.`);
  return n;
}
function asPair<T>(v: unknown, label: string, one: (x: unknown, l: string) => T): [T, T] {
  if (!Array.isArray(v) || v.length !== 2) throw bad(`Enter a start and an end for ${label}.`);
  return [one(v[0], label), one(v[1], label)];
}

type Ctx = { userId?: string; canSeeValues?: boolean };

/** One whitelisted column condition. `me` is replaced by the current user for owner filters. */
function columnCondition(spec: Spec, f: Filter, ctx: Ctx): Record<string, unknown> {
  const col = spec.column;
  const mine = (id: string) => (id === "me" && ctx.userId ? ctx.userId : id);
  switch (spec.kind) {
    case "string": {
      const v = asString(f.value, spec.label);
      return { [col]: f.op === "eq" ? { equals: v, mode: "insensitive" } : { contains: v, mode: "insensitive" } };
    }
    case "id": {
      if (f.op === "in") return { [col]: { in: asList(f.value, spec.label).map(mine) } };
      const v = mine(asString(f.value, spec.label));
      return { [col]: f.op === "neq" ? { not: v } : v };
    }
    case "enum": {
      const list = f.op === "in" ? asList(f.value, spec.label) : [asString(f.value, spec.label)];
      if (list.some((x) => !spec.options?.includes(x))) throw bad(`${spec.label} must be one of: ${spec.options?.join(", ")}.`);
      return { [col]: f.op === "in" ? { in: list } : list[0] };
    }
    case "tags":
      return { [col]: f.op === "in" ? { hasSome: asList(f.value, spec.label) } : { has: asString(f.value, spec.label) } };
    case "date": {
      if (f.op === "between") { const [a, b] = asPair(f.value, spec.label, asDate); return { [col]: { gte: a, lte: b } }; }
      return { [col]: { [f.op]: asDate(f.value, spec.label) } };
    }
    case "number": {
      if (f.op === "between") { const [a, b] = asPair(f.value, spec.label, asNumber); return { [col]: { gte: a, lte: b } }; }
      return { [col]: f.op === "eq" ? asNumber(f.value, spec.label) : { [f.op]: asNumber(f.value, spec.label) } };
    }
  }
}

/** Custom-field condition through a Postgres JSON path on `customFields`. */
function customFieldCondition(key: string, f: Filter): Record<string, unknown> {
  if (!CF_OPS.includes(f.op)) throw bad(`That comparison is not available for custom fields.`);
  const json = (extra: Record<string, unknown>) => ({ customFields: { path: [key], ...extra } });
  const scalar = (v: unknown) => (typeof v === "number" || typeof v === "boolean" ? v : asString(v, `custom field ${key}`));
  switch (f.op) {
    case "eq": return json({ equals: scalar(f.value) });
    case "neq": return { NOT: json({ equals: scalar(f.value) }) };
    case "contains": return json({ string_contains: asString(f.value, `custom field ${key}`) });
    case "gt": return json({ gt: asNumber(f.value, `custom field ${key}`) });
    case "lt": return json({ lt: asNumber(f.value, `custom field ${key}`) });
    case "between": { const [a, b] = asPair(f.value, `custom field ${key}`, asNumber); return { AND: [json({ gte: a }), json({ lte: b })] }; }
    case "in": return { OR: asList(f.value, `custom field ${key}`).map((v) => json({ equals: v })) };
    default: throw bad("That comparison is not available for custom fields.");
  }
}

/** Turn a filter list into a Prisma `where`. Throws a 422 HttpError with a plain message on anything not allowed. */
export function buildWhere(entity: FilterEntity, filters: unknown, ctx: Ctx = {}): Record<string, unknown> {
  const list = FilterSchema.parse(filters ?? []) as Filter[];
  const conditions = list.map((f) => {
    if (f.field.startsWith("cf.")) {
      const key = f.field.slice(3);
      if (!CF_ENTITIES.includes(entity) || !CF_KEY.test(key)) throw bad(`"${f.field}" is not a field you can filter on.`);
      return customFieldCondition(key, f);
    }
    const spec = FIELDS[entity][f.field];
    if (!spec) throw bad(`"${f.field}" is not a field you can filter on.`);
    if (!spec.ops.includes(f.op)) throw bad(`${spec.label} can't be filtered with "${f.op}".`);
    if (spec.needs && !ctx.canSeeValues) throw bad(`You don't have permission to filter on ${spec.label.toLowerCase()}.`);
    return columnCondition(spec, f, ctx);
  });
  return conditions.length ? { AND: conditions } : {};
}

/** Parse the `f` query-string parameter used by the filter bar. Bad input gives an empty list, never an error page. */
export function parseFilterParam(raw: string | string[] | undefined | null): Filter[] {
  const s = Array.isArray(raw) ? raw[0] : raw;
  if (!s) return [];
  try {
    const parsed = FilterSchema.safeParse(JSON.parse(s));
    return parsed.success ? (parsed.data as Filter[]) : [];
  } catch {
    return [];
  }
}
