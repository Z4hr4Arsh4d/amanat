"use client";
// P2 owns this slot. P1 places <FilterBar entity="contact"/> on the contacts and opportunities lists.
// It keeps the filter in the page address as ?f=<json>. The list page reads it with
//   filters.buildWhere(entity, filters.parseFilterParam(searchParams.f), { userId, canSeeValues })   (lib/shared/contracts.ts)
import { useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import useSWR from "swr";
import { useAction } from "@/components/ui/useAction";
import { ui } from "@/components/ui/styles";
import { fieldOptions, parseFilterParam, supportsCustomFields, type Filter, type FilterEntity, type FilterOp } from "@/lib/filters";
import { createSavedList, getFilterChoices } from "@/app/(app)/lists/actions";

type Row = { field: string; cfKey: string; op: FilterOp; value: string | string[] };

const CF = "__cf";
const CF_OPS: FilterOp[] = ["eq", "neq", "contains", "gt", "lt", "between", "in"];

const opLabel = (op: FilterOp, kind: string): string => {
  if (kind === "date") return ({ gt: "is after", lt: "is before", between: "is between" } as Record<string, string>)[op] ?? op;
  return ({ eq: "is", neq: "is not", in: "is any of", has: "has", gt: "is more than", lt: "is less than", between: "is between", contains: "contains" } as Record<FilterOp, string>)[op];
};

function toRows(filters: Filter[]): Row[] {
  return filters.map((f) => {
    const cf = f.field.startsWith("cf.");
    const v = f.value;
    return {
      field: cf ? CF : f.field, cfKey: cf ? f.field.slice(3) : "", op: f.op,
      value: Array.isArray(v) ? v.map(String) : v == null ? "" : String(v),
    };
  });
}

export function FilterBar({ entity }: { entity: FilterEntity }) {
  const router = useRouter();
  const path = usePathname();
  const search = useSearchParams();
  const fields = useMemo(() => fieldOptions(entity), [entity]);
  const allowCf = supportsCustomFields(entity);
  const { data: choices } = useSWR("filter-choices", async () => {
    const r = await getFilterChoices();
    if (!r.ok) throw new Error(r.error);
    return r.data;
  });
  const { pending, run } = useAction();
  const [rows, setRows] = useState<Row[]>(() => toRows(parseFilterParam(search.get("f"))));
  const [listName, setListName] = useState("");

  const spec = (field: string) => fields.find((f) => f.field === field);
  const kindOf = (r: Row) => (r.field === CF ? "cf" : (spec(r.field)?.kind ?? "string"));
  const opsOf = (r: Row): FilterOp[] => (r.field === CF ? CF_OPS : (spec(r.field)?.ops ?? ["eq"]));
  const visible = fields.filter((f) => !f.needs || choices?.canSeeValues);

  const update = (i: number, patch: Partial<Row>) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const addRow = () => {
    const f = visible[0];
    if (f) setRows((rs) => [...rs, { field: f.field, cfKey: "", op: f.ops[0], value: "" }]);
  };

  // Build the filter list from the rows, skipping rows that are still empty.
  const filters = (): Filter[] => {
    const out: Filter[] = [];
    for (const r of rows) {
      const field = r.field === CF ? `cf.${r.cfKey.trim()}` : r.field;
      if (r.field === CF && !r.cfKey.trim()) continue;
      let value: unknown = r.value;
      if (r.op === "between") {
        const [a, b] = Array.isArray(r.value) ? r.value : [r.value, ""];
        if (!a || !b) continue;
        value = [a, kindOf(r) === "date" && !String(b).includes("T") ? `${b}T23:59:59` : b];
      } else if (r.op === "in") {
        const list = Array.isArray(r.value) ? r.value : String(r.value).split(",").map((x) => x.trim()).filter(Boolean);
        if (list.length === 0) continue;
        value = list;
      } else if (Array.isArray(r.value) || String(r.value).trim() === "") {
        continue;
      }
      out.push({ field, op: r.op, value });
    }
    return out;
  };

  const apply = (list: Filter[]) => {
    const p = new URLSearchParams(search.toString());
    p.delete("page");
    if (list.length) p.set("f", JSON.stringify(list)); else p.delete("f");
    router.push(`${path}?${p.toString()}`);
  };

  const valueInput = (r: Row, i: number) => {
    const id = `fv-${i}`;
    const kind = kindOf(r);
    const s = spec(r.field);
    if (r.op === "between") {
      const [a, b] = Array.isArray(r.value) ? r.value : [r.value, ""];
      const t = kind === "date" ? "date" : "number";
      return (
        <span className="flex gap-2">
          <input aria-label="From" type={t} className={ui.input} value={a} onChange={(e) => update(i, { value: [e.target.value, b] })} />
          <input aria-label="To" type={t} className={ui.input} value={b} onChange={(e) => update(i, { value: [a, e.target.value] })} />
        </span>
      );
    }
    const options: { value: string; label: string }[] | null =
      r.field === "owner" ? [{ value: "me", label: "Me" }, ...(choices?.users ?? []).map((u) => ({ value: u.id, label: u.name }))]
      : r.field === "stage" ? (choices?.stages ?? []).map((x) => ({ value: x.id, label: x.name }))
      : r.field === "pipeline" ? (choices?.pipelines ?? []).map((x) => ({ value: x.id, label: x.name }))
      : s?.options ? s.options.map((o) => ({ value: o, label: o.replace("_", " ").toLowerCase() }))
      : null;
    if (options && r.op === "in") {
      return (
        <select id={id} aria-label="Values" multiple className={ui.input} value={Array.isArray(r.value) ? r.value : []}
          onChange={(e) => update(i, { value: Array.from(e.target.selectedOptions).map((o) => o.value) })}>
          {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      );
    }
    if (options) {
      return (
        <select id={id} aria-label="Value" className={ui.input} value={typeof r.value === "string" ? r.value : ""} onChange={(e) => update(i, { value: e.target.value })}>
          <option value="">Choose…</option>
          {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      );
    }
    const t = kind === "date" ? "date" : kind === "number" ? "number" : "text";
    const text = Array.isArray(r.value) ? r.value.join(", ") : r.value;
    return <input id={id} aria-label="Value" type={t} className={ui.input} value={text} placeholder={r.op === "in" ? "a, b, c" : ""} onChange={(e) => update(i, { value: e.target.value })} />;
  };

  return (
    <section className={`${ui.card} space-y-3`} aria-label="Filters">
      <h2 className="font-semibold text-stone-900">Filters</h2>
      {rows.length === 0 && <p className={ui.muted}>No filters yet. Add a criterion to narrow the list.</p>}
      <ul className="space-y-3">
        {rows.map((r, i) => (
          <li key={i} className="grid gap-2 sm:grid-cols-[1fr_1fr_2fr_auto] sm:items-end">
            <div>
              <label htmlFor={`ff-${i}`} className="block text-xs font-medium text-stone-700">Field</label>
              <select id={`ff-${i}`} className={ui.input} value={r.field}
                onChange={(e) => { const f = spec(e.target.value); update(i, { field: e.target.value, op: e.target.value === CF ? "eq" : (f?.ops[0] ?? "eq"), value: "" }); }}>
                {visible.map((f) => <option key={f.field} value={f.field}>{f.label}</option>)}
                {allowCf && <option value={CF}>Custom field…</option>}
              </select>
              {r.field === CF && (
                <input aria-label="Custom field key" className={`${ui.input} mt-1`} placeholder="field key, e.g. budget" value={r.cfKey} onChange={(e) => update(i, { cfKey: e.target.value })} />
              )}
            </div>
            <div>
              <label htmlFor={`fo-${i}`} className="block text-xs font-medium text-stone-700">Is</label>
              <select id={`fo-${i}`} className={ui.input} value={r.op} onChange={(e) => update(i, { op: e.target.value as FilterOp, value: "" })}>
                {opsOf(r).map((o) => <option key={o} value={o}>{opLabel(o, kindOf(r))}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor={`fv-${i}`} className="block text-xs font-medium text-stone-700">Value</label>
              {valueInput(r, i)}
            </div>
            <button type="button" className={ui.btnDanger} onClick={() => setRows((rs) => rs.filter((_, j) => j !== i))} aria-label={`Remove criterion ${i + 1}`}>Remove</button>
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap items-end gap-2">
        <button type="button" className={ui.btn} onClick={addRow} disabled={rows.length >= 12}>Add criterion</button>
        <button type="button" className={ui.btnPrimary} onClick={() => apply(filters())}>Apply filters</button>
        <button type="button" className={ui.btn} onClick={() => { setRows([]); apply([]); }} disabled={rows.length === 0 && !search.get("f")}>Clear</button>
      </div>
      <form
        className="flex flex-wrap items-end gap-2 border-t border-stone-200 pt-3"
        onSubmit={(e) => {
          e.preventDefault();
          const list = filters();
          run(() => createSavedList({ name: listName, entity, filters: list }), { success: "List saved. Find it under Saved lists.", onSuccess: () => setListName("") });
        }}
      >
        <div>
          <label htmlFor="list-name" className="block text-xs font-medium text-stone-700">List name</label>
          <input id="list-name" className={ui.input} value={listName} onChange={(e) => setListName(e.target.value)} maxLength={80} placeholder="Hot leads in Lahore" />
        </div>
        <button type="submit" className={ui.btn} disabled={pending || listName.trim().length < 2 || rows.length === 0}>{pending ? "Saving…" : "Save as list"}</button>
      </form>
    </section>
  );
}
