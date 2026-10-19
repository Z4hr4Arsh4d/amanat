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
    <div className="grid gap-4 sm:grid-cols-2">
      {defs.map((d) => {
        const id = `${idPrefix}-cf-${d.key}`;
        const v = values[d.key] as V;
        const req = required.includes(d.id);
        const label = (
          <label htmlFor={id} className={ui.label}>
            {d.label} {req && <span className="ml-1 inline-flex items-center rounded-full bg-amber-50 px-1.5 py-0.5 text-[11px] font-semibold text-amber-900 ring-1 ring-amber-200">Needed for this stage</span>}
          </label>
        );
        if (d.type === "CHECKBOX") {
          return (
            <div key={d.key} className="flex items-center gap-2.5 sm:pt-7">
              <input id={id} type="checkbox" checked={v === true} onChange={(e) => onChange(d.key, e.target.checked)} className={ui.check} />
              {label}
            </div>
          );
        }
        return (
          <div key={d.key} className={ui.field}>
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
    <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2 lg:grid-cols-4">
      {defs.map((d) => {
        const v = values[d.key];
        const text = v === null || v === undefined || v === "" ? "—" : v === true ? "Yes" : v === false ? "No" : String(v);
        return (
          <div key={d.key} className="min-w-0">
            <dt className="text-xs font-semibold uppercase tracking-wider text-stone-500">{d.label}</dt>
            <dd className="mt-1 break-words text-sm font-semibold text-stone-900">{text}</dd>
          </div>
        );
      })}
    </dl>
  );
}
