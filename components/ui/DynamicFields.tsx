"use client";
// P1 owns. F2.2: renders the right input for each custom field. Used on every create/edit form,
// so a newly added field appears immediately.
import { ui } from "./styles";

export type FieldDefView = { id: string; key: string; label: string; type: "TEXT" | "NUMBER" | "DATE" | "DROPDOWN" | "CHECKBOX"; options: string[] };
type V = string | number | boolean | null | undefined;

export function DynamicFields({ defs, values, onChange, idPrefix, required = [] }: {
  defs: FieldDefView[]; values: Record<string, unknown>; onChange: (key: string, value: V) => void; idPrefix: string; required?: string[];
}) {
  if (defs.length === 0) return null;
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {defs.map((d) => {
        const id = `${idPrefix}-cf-${d.key}`;
        const v = values[d.key] as V;
        const req = required.includes(d.id);
        const label = (
          <label htmlFor={id} className={ui.label}>
            {d.label} {req && <span className="text-xs font-normal text-amber-800">(needed for this stage)</span>}
          </label>
        );
        if (d.type === "CHECKBOX") {
          return (
            <div key={d.key} className="flex items-center gap-2 pt-6">
              <input id={id} type="checkbox" checked={v === true} onChange={(e) => onChange(d.key, e.target.checked)} className="h-4 w-4 accent-emerald-800" />
              {label}
            </div>
          );
        }
        return (
          <div key={d.key} className="space-y-1">
            {label}
            {d.type === "DROPDOWN" ? (
              <select id={id} value={typeof v === "string" ? v : ""} onChange={(e) => onChange(d.key, e.target.value || null)} className={ui.input}>
                <option value="">— Not set —</option>
                {d.options.map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
            ) : (
              <input
                id={id}
                type={d.type === "NUMBER" ? "number" : d.type === "DATE" ? "date" : "text"}
                step={d.type === "NUMBER" ? "any" : undefined}
                value={v === null || v === undefined ? "" : String(v)}
                onChange={(e) => onChange(d.key, e.target.value)}
                className={ui.input}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

/** Read-only display of custom field values on detail pages. */
export function FieldValues({ defs, values }: { defs: FieldDefView[]; values: Record<string, unknown> }) {
  if (defs.length === 0) return null;
  return (
    <dl className="grid gap-x-4 gap-y-2 text-sm sm:grid-cols-2">
      {defs.map((d) => {
        const v = values[d.key];
        const text = v === null || v === undefined || v === "" ? "—" : v === true ? "✓ Yes" : v === false ? "✗ No" : String(v);
        return (
          <div key={d.key} className="min-w-0">
            <dt className="text-stone-600">{d.label}</dt>
            <dd className="break-words font-medium">{text}</dd>
          </div>
        );
      })}
    </dl>
  );
}
