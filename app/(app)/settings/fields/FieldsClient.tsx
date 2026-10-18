"use client";
// P1 owns.
import { useState } from "react";
import { useAction } from "@/components/ui/useAction";
import { Spinner } from "@/components/ui/Spinner";
import { ui } from "@/components/ui/styles";
import { createField, deleteField, moveField, updateField } from "./actions";

type Entity = "CONTACT" | "COMPANY" | "OPPORTUNITY";
type FType = "TEXT" | "NUMBER" | "DATE" | "DROPDOWN" | "CHECKBOX";
type Field = { id: string; entity: Entity; label: string; key: string; type: FType; options: string[]; pipelineId: string | null };
type P = { id: string; name: string };

const TYPE_LABEL: Record<FType, string> = { TEXT: "Text", NUMBER: "Number", DATE: "Date", DROPDOWN: "Dropdown", CHECKBOX: "Checkbox" };
const ENTITY_LABEL: Record<Entity, string> = { CONTACT: "Contacts", COMPANY: "Companies", OPPORTUNITY: "Opportunities" };

export function FieldsClient({ fields, pipelines }: { fields: Field[]; pipelines: P[] }) {
  const groups: { title: string; entity: Entity; pipelineId: string | null }[] = [
    { title: "Contacts", entity: "CONTACT", pipelineId: null },
    { title: "Companies", entity: "COMPANY", pipelineId: null },
    { title: "Opportunities · all pipelines", entity: "OPPORTUNITY", pipelineId: null },
    ...pipelines.map((p) => ({ title: `Opportunities · only “${p.name}”`, entity: "OPPORTUNITY" as Entity, pipelineId: p.id })),
  ];
  return (
    <div className="space-y-6">
      <NewField pipelines={pipelines} />
      {groups.map((g) => {
        const list = fields.filter((f) => f.entity === g.entity && f.pipelineId === g.pipelineId);
        return (
          <section key={`${g.entity}-${g.pipelineId}`} aria-label={g.title} className={ui.card}>
            <h2 className="text-lg font-semibold">{g.title} <span className="text-sm font-normal text-stone-600">({list.length})</span></h2>
            {list.length === 0 ? <p className="mt-2 text-sm text-stone-600">No fields yet.</p> : (
              <ul className="mt-3 divide-y divide-stone-200">
                {list.map((f, i) => <FieldRow key={`${f.id}:${f.label}:${f.options.join("|")}`} f={f} first={i === 0} last={i === list.length - 1} />)}
              </ul>
            )}
          </section>
        );
      })}
    </div>
  );
}

function NewField({ pipelines }: { pipelines: P[] }) {
  const { pending, run } = useAction();
  const [entity, setEntity] = useState<Entity>("CONTACT");
  const [label, setLabel] = useState("");
  const [type, setType] = useState<FType>("TEXT");
  const [options, setOptions] = useState("");
  const [pipelineId, setPipelineId] = useState("");
  return (
    <form
      className={`${ui.card} space-y-3`}
      onSubmit={(e) => {
        e.preventDefault();
        run(
          () => createField({ entity, label, type, options: options.split(",").map((o) => o.trim()).filter(Boolean), pipelineId: entity === "OPPORTUNITY" ? pipelineId || null : null }),
          { success: `Field "${label.trim()}" added. It now appears on ${ENTITY_LABEL[entity].toLowerCase()} forms.`, onSuccess: () => { setLabel(""); setOptions(""); } },
        );
      }}
    >
      <h2 className="text-lg font-semibold">Add a field</h2>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="space-y-1">
          <label htmlFor="nf-entity" className={ui.label}>Belongs to</label>
          <select id="nf-entity" value={entity} onChange={(e) => setEntity(e.target.value as Entity)} className={ui.input}>
            <option value="CONTACT">Contacts</option>
            <option value="COMPANY">Companies</option>
            <option value="OPPORTUNITY">Opportunities</option>
          </select>
        </div>
        {entity === "OPPORTUNITY" && (
          <div className="space-y-1">
            <label htmlFor="nf-pipeline" className={ui.label}>Pipeline</label>
            <select id="nf-pipeline" value={pipelineId} onChange={(e) => setPipelineId(e.target.value)} className={ui.input}>
              <option value="">All pipelines</option>
              {pipelines.map((p) => <option key={p.id} value={p.id}>Only {p.name}</option>)}
            </select>
          </div>
        )}
        <div className="space-y-1">
          <label htmlFor="nf-label" className={ui.label}>Label</label>
          <input id="nf-label" required value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. Roof size" className={ui.input} />
        </div>
        <div className="space-y-1">
          <label htmlFor="nf-type" className={ui.label}>Type</label>
          <select id="nf-type" value={type} onChange={(e) => setType(e.target.value as FType)} className={ui.input}>
            {(Object.keys(TYPE_LABEL) as FType[]).map((t) => <option key={t} value={t}>{TYPE_LABEL[t]}</option>)}
          </select>
        </div>
        {type === "DROPDOWN" && (
          <div className="space-y-1 sm:col-span-2">
            <label htmlFor="nf-options" className={ui.label}>Options (comma separated)</label>
            <input id="nf-options" required value={options} onChange={(e) => setOptions(e.target.value)} placeholder="Small, Medium, Large" className={ui.input} />
          </div>
        )}
      </div>
      <button disabled={pending} className={ui.btnPrimary}>{pending && <Spinner />} Add field</button>
    </form>
  );
}

function FieldRow({ f, first, last }: { f: Field; first: boolean; last: boolean }) {
  const { pending, run } = useAction();
  const [editing, setEditing] = useState(false);
  const [label, setLabel] = useState(f.label);
  const [options, setOptions] = useState(f.options.join(", "));
  return (
    <li className="space-y-2 py-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="min-w-0 break-words text-sm">
          <span className="font-medium">{f.label}</span>{" "}
          <span className="text-stone-600">· {TYPE_LABEL[f.type]}{f.type === "DROPDOWN" ? ` (${f.options.join(", ")})` : ""}</span>
        </p>
        <div className="flex flex-wrap gap-2">
          <button type="button" disabled={pending || first} aria-label={`Move ${f.label} up`} className={ui.btn} onClick={() => run(() => moveField({ fieldId: f.id, direction: "up" }))}>↑</button>
          <button type="button" disabled={pending || last} aria-label={`Move ${f.label} down`} className={ui.btn} onClick={() => run(() => moveField({ fieldId: f.id, direction: "down" }))}>↓</button>
          <button type="button" className={ui.btn} onClick={() => setEditing((x) => !x)}>{editing ? "Close" : "Edit"}</button>
          <button
            type="button"
            disabled={pending}
            className={ui.btnDanger}
            onClick={() => {
              if (!window.confirm(`Delete the field "${f.label}"? Values already saved are kept but hidden.`)) return;
              run(() => deleteField({ fieldId: f.id }), { success: `Field "${f.label}" deleted.` });
            }}
          >
            Delete
          </button>
        </div>
      </div>
      {editing && (
        <form
          className="grid gap-3 rounded-md border border-stone-200 p-3 sm:grid-cols-3 sm:items-end"
          onSubmit={(e) => {
            e.preventDefault();
            run(() => updateField({ fieldId: f.id, label, options: options.split(",").map((o) => o.trim()).filter(Boolean) }), {
              success: "Field saved.", onSuccess: () => setEditing(false),
            });
          }}
        >
          <div className="space-y-1">
            <label htmlFor={`fl-${f.id}`} className={ui.label}>Label</label>
            <input id={`fl-${f.id}`} required value={label} onChange={(e) => setLabel(e.target.value)} className={ui.input} />
          </div>
          {f.type === "DROPDOWN" && (
            <div className="space-y-1">
              <label htmlFor={`fo-${f.id}`} className={ui.label}>Options (comma separated)</label>
              <input id={`fo-${f.id}`} required value={options} onChange={(e) => setOptions(e.target.value)} className={ui.input} />
            </div>
          )}
          <button disabled={pending} className={ui.btnPrimary}>{pending && <Spinner />} Save</button>
          <p className="text-xs text-stone-600 sm:col-span-3">The type can&apos;t be changed after creation, so saved values stay valid.</p>
        </form>
      )}
    </li>
  );
}
