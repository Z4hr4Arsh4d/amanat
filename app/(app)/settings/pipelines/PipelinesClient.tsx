"use client";
// P1 owns.
import { useEffect, useRef, useState } from "react";
import { useAction } from "@/components/ui/useAction";
import { Spinner } from "@/components/ui/Spinner";
import { ui } from "@/components/ui/styles";
import { Icon } from "@/components/ui/Icon";
import { Badge } from "@/components/ui/Kit";
import type { PipelineView } from "@/lib/crm/pipelines";
import {
  addStage, createPipeline, deletePipeline, deleteStage, makeDefaultPipeline, moveStageOrder, renamePipeline, updateStage,
} from "./actions";

type Field = { id: string; label: string; pipelineId: string | null };
type Kind = "OPEN" | "WON" | "LOST";
type Stage = PipelineView["stages"][number];
const KIND: Record<Kind, string> = { OPEN: "Open", WON: "Won", LOST: "Lost" };

export function PipelinesClient({ pipelines, fields, counts }: { pipelines: PipelineView[]; fields: Field[]; counts: Record<string, number> }) {
  const { pending, run } = useAction();
  const [name, setName] = useState("");
  return (
    <div className="space-y-6">
      <form
        className={`${ui.card} flex flex-col gap-3 sm:flex-row sm:items-end`}
        onSubmit={(e) => {
          e.preventDefault();
          run(() => createPipeline({ name }), { success: `Pipeline "${name.trim()}" created with New, Won and Lost stages.`, onSuccess: () => setName("") });
        }}
      >
        <div className={`flex-1 ${ui.field}`}>
          <label htmlFor="np-name" className={ui.label}>New pipeline name</label>
          <input id="np-name" required value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Solar Installs" className={ui.input} />
        </div>
        <button disabled={pending} className={ui.btnPrimary}>{pending ? <Spinner /> : <Icon name="plus" className="h-4 w-4" />}Create pipeline</button>
      </form>
      {pipelines.map((p) => (
        <PipelineCard
          key={p.id}
          p={p}
          fields={fields.filter((f) => f.pipelineId === null || f.pipelineId === p.id)}
          counts={counts}
        />
      ))}
    </div>
  );
}

function PipelineCard({ p, fields, counts }: { p: PipelineView; fields: Field[]; counts: Record<string, number> }) {
  const { pending, run } = useAction();
  const [name, setName] = useState(p.name);
  const [stageName, setStageName] = useState("");
  const [kind, setKind] = useState<Kind>("OPEN");
  const total = p.stages.reduce((n, s) => n + (counts[s.id] ?? 0), 0);

  return (
    <section aria-labelledby={`pl-${p.id}`} className={`${ui.card} space-y-4`}>
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
        <form
          className="flex flex-1 flex-col gap-2 sm:flex-row sm:items-end"
          onSubmit={(e) => { e.preventDefault(); run(() => renamePipeline({ pipelineId: p.id, name }), { success: "Pipeline renamed." }); }}
        >
          <div className={`flex-1 ${ui.field}`}>
            <label htmlFor={`pn-${p.id}`} className={ui.label}>
              <span id={`pl-${p.id}`}>Pipeline</span> {p.isDefault && <Badge tone="brand" icon="check" className="ml-1">Default</Badge>}
            </label>
            <input id={`pn-${p.id}`} required value={name} onChange={(e) => setName(e.target.value)} className={ui.input} />
          </div>
          <button disabled={pending || name.trim() === p.name} className={ui.btn}>Rename</button>
        </form>
        <div className="flex flex-wrap gap-2">
          {!p.isDefault && <button type="button" disabled={pending} className={ui.btn} onClick={() => run(() => makeDefaultPipeline({ pipelineId: p.id }), { success: `"${p.name}" is now the default pipeline.` })}>Make default</button>}
          {!p.isDefault && (
            <button
              type="button"
              disabled={pending}
              className={ui.btnDanger}
              onClick={() => { if (window.confirm(`Delete the pipeline "${p.name}"?`)) run(() => deletePipeline({ pipelineId: p.id }), { success: "Pipeline deleted." }); }}
            >
              <Icon name="trash" className="h-4 w-4" />Delete pipeline
            </button>
          )}
        </div>
      </div>
      <p className="text-sm text-stone-600"><span className="font-semibold tabular-nums text-stone-900">{total}</span> opportunit{total === 1 ? "y" : "ies"} in this pipeline.</p>

      <ol className="space-y-2">
        {p.stages.map((s, i) => (
          <StageRow
            key={`${s.id}:${s.name}:${s.kind}:${s.requiredFieldIds.join(",")}`}
            s={s}
            index={i}
            count={p.stages.length}
            fields={fields}
            opps={counts[s.id] ?? 0}
            others={p.stages.filter((x) => x.id !== s.id)}
          />
        ))}
      </ol>

      <form
        className="grid gap-3 rounded-lg border border-dashed border-stone-300 bg-stone-50/50 p-4 sm:grid-cols-[1fr_auto_auto] sm:items-end"
        onSubmit={(e) => {
          e.preventDefault();
          run(() => addStage({ pipelineId: p.id, name: stageName, kind }), { success: `Stage "${stageName.trim()}" added.`, onSuccess: () => setStageName("") });
        }}
      >
        <div className={ui.field}>
          <label htmlFor={`ns-${p.id}`} className={ui.label}>New stage</label>
          <input id={`ns-${p.id}`} required value={stageName} onChange={(e) => setStageName(e.target.value)} placeholder="e.g. Site survey" className={ui.input} />
        </div>
        <div className={ui.field}>
          <label htmlFor={`nk-${p.id}`} className={ui.label}>Kind</label>
          <select id={`nk-${p.id}`} value={kind} onChange={(e) => setKind(e.target.value as Kind)} className={ui.input}>
            {(Object.keys(KIND) as Kind[]).map((k) => <option key={k} value={k}>{KIND[k]}</option>)}
          </select>
        </div>
        <button disabled={pending} className={ui.btnPrimary}>{pending ? <Spinner /> : <Icon name="plus" className="h-4 w-4" />}Add stage</button>
      </form>
    </section>
  );
}

function StageRow({ s, index, count, fields, opps, others }: {
  s: Stage; index: number; count: number; fields: Field[]; opps: number; others: Stage[];
}) {
  const { pending, run } = useAction();
  const [name, setName] = useState(s.name);
  const [kind, setKind] = useState<Kind>(s.kind);
  const [required, setRequired] = useState<string[]>(s.requiredFieldIds.filter((id) => fields.some((f) => f.id === id)));
  const [deleting, setDeleting] = useState(false);
  const dirty = name.trim() !== s.name || kind !== s.kind ||
    required.length !== s.requiredFieldIds.filter((id) => fields.some((f) => f.id === id)).length ||
    required.some((id) => !s.requiredFieldIds.includes(id));
  const labels = fields.filter((f) => required.includes(f.id)).map((f) => f.label);

  return (
    <li className={`rounded-lg border p-3 sm:p-4 ${s.kind === "WON" ? "border-emerald-200 bg-emerald-50/30" : s.kind === "LOST" ? "border-red-200 bg-red-50/30" : "border-stone-200"}`}>
      <div className="grid gap-3 md:grid-cols-[auto_1fr_auto_auto] md:items-end">
        <div className="flex gap-1">
          <button type="button" disabled={pending || index === 0} aria-label={`Move ${s.name} up`} className={ui.iconBtn} onClick={() => run(() => moveStageOrder({ stageId: s.id, direction: "up" }))}><Icon name="arrowUp" className="h-4 w-4" /></button>
          <button type="button" disabled={pending || index === count - 1} aria-label={`Move ${s.name} down`} className={ui.iconBtn} onClick={() => run(() => moveStageOrder({ stageId: s.id, direction: "down" }))}><Icon name="arrowDown" className="h-4 w-4" /></button>
        </div>
        <div className={ui.field}>
          <label htmlFor={`sn-${s.id}`} className={ui.label}>{index + 1}. Stage name <span className="font-normal text-stone-600">· {opps} opportunit{opps === 1 ? "y" : "ies"}</span></label>
          <input id={`sn-${s.id}`} required value={name} onChange={(e) => setName(e.target.value)} className={ui.input} />
        </div>
        <div className={ui.field}>
          <label htmlFor={`sk-${s.id}`} className={ui.label}>Kind</label>
          <select id={`sk-${s.id}`} value={kind} onChange={(e) => setKind(e.target.value as Kind)} className={ui.input}>
            {(Object.keys(KIND) as Kind[]).map((k) => <option key={k} value={k}>{KIND[k]}</option>)}
          </select>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            disabled={pending || !dirty}
            className={ui.btnPrimary}
            onClick={() => run(() => updateStage({ stageId: s.id, name, kind, requiredFieldIds: required }), { success: `Stage "${name.trim()}" saved.` })}
          >
            {pending && <Spinner />}Save
          </button>
          <button
            type="button"
            disabled={pending}
            className={ui.btnDanger}
            onClick={() => {
              if (opps > 0) setDeleting(true);
              else if (window.confirm(`Delete the stage "${s.name}"?`)) run(() => deleteStage({ stageId: s.id }), { success: `Stage "${s.name}" deleted.`, onError: (r) => { if (r.status === 409) setDeleting(true); } });
            }}
          >
            <Icon name="trash" className="h-4 w-4" /><span className="sr-only sm:not-sr-only">Delete</span>
          </button>
        </div>
      </div>

      <details className="mt-3">
        <summary className="inline-flex list-none items-center gap-1.5 rounded text-sm text-stone-600 hover:text-stone-900">
          <Icon name="chevronDown" className="chevron h-4 w-4 transition-transform" />
          Required to enter this stage: {labels.length ? <strong className="text-stone-900">{labels.join(", ")}</strong> : "nothing"}
        </summary>
        {fields.length === 0 ? (
          <p className="mt-2 text-sm text-stone-600">No opportunity fields for this pipeline yet. Add them in Settings → Custom fields.</p>
        ) : (
          <fieldset className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            <legend className="sr-only">Required fields for {s.name}</legend>
            {fields.map((f) => {
              const id = `rq-${s.id}-${f.id}`;
              return (
                <div key={f.id} className="flex items-center gap-2">
                  <input
                    id={id} type="checkbox" checked={required.includes(f.id)} className={ui.check}
                    onChange={(e) => setRequired((r) => (e.target.checked ? [...r, f.id] : r.filter((x) => x !== f.id)))}
                  />
                  <label htmlFor={id} className="text-sm">{f.label}</label>
                </div>
              );
            })}
          </fieldset>
        )}
        {dirty && <p className="mt-2 text-xs font-semibold text-amber-800">Unsaved changes. Press Save.</p>}
      </details>

      {deleting && <MoveAndDelete stage={s} opps={opps} others={others} onClose={() => setDeleting(false)} />}
    </li>
  );
}

function MoveAndDelete({ stage, opps, others, onClose }: { stage: Stage; opps: number; others: Stage[]; onClose: () => void }) {
  const { pending, run } = useAction();
  const [to, setTo] = useState(others[0]?.id ?? "");
  const ref = useRef<HTMLSelectElement>(null);
  useEffect(() => {
    ref.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-stone-950/40 p-4 backdrop-blur-[2px]" onClick={onClose}>
      <div
        role="dialog" aria-modal="true" aria-labelledby={`dlg-${stage.id}`}
        className="w-full max-w-md animate-fade-in space-y-4 rounded-2xl bg-white p-6 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id={`dlg-${stage.id}`} className="text-lg font-bold text-stone-900">Delete “{stage.name}”</h2>
        <p className="text-sm text-stone-700">
          This stage has <strong>{opps} opportunit{opps === 1 ? "y" : "ies"}</strong>. Move them to:
        </p>
        <div className={ui.field}>
          <label htmlFor={`mt-${stage.id}`} className={ui.label}>Move to stage</label>
          <select ref={ref} id={`mt-${stage.id}`} value={to} onChange={(e) => setTo(e.target.value)} className={ui.input}>
            {others.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
          </select>
        </div>
        <div className="flex justify-end gap-2">
          <button type="button" className={ui.btn} onClick={onClose}>Cancel</button>
          <button
            type="button"
            disabled={pending || !to}
            className={ui.btnDanger}
            onClick={() => run(() => deleteStage({ stageId: stage.id, moveToStageId: to }), {
              success: (d) => `Moved ${d.moved} opportunit${d.moved === 1 ? "y" : "ies"} and deleted "${stage.name}".`,
              onSuccess: onClose,
            })}
          >
            {pending && <Spinner />}Move and delete
          </button>
        </div>
      </div>
    </div>
  );
}
