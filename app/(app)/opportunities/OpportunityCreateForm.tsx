"use client";
// P1 owns. New opportunity (from the opportunities page or a contact page). Fields follow the chosen pipeline (F2.3).
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useAction } from "@/components/ui/useAction";
import { Spinner } from "@/components/ui/Spinner";
import { DynamicFields, type FieldDefView } from "@/components/ui/DynamicFields";
import { ui } from "@/components/ui/styles";
import type { PipelineView } from "@/lib/crm/pipelines";
import { createOpportunity } from "./actions";

type Opt = { id: string; name: string };
type Def = FieldDefView & { pipelineId: string | null };

export function OpportunityCreateForm({ contactId, contacts, pipelines, defs, team, goToNew = true }: {
  contactId?: string; contacts?: Opt[]; pipelines: PipelineView[]; defs: Def[]; team: Opt[]; goToNew?: boolean;
}) {
  const router = useRouter();
  const { pending, run } = useAction();
  const [pipelineId, setPipelineId] = useState(pipelines.find((p) => p.isDefault)?.id ?? pipelines[0]?.id ?? "");
  const [contact, setContact] = useState(contactId ?? "");
  const [title, setTitle] = useState("");
  const [value, setValue] = useState("");
  const [currency, setCurrency] = useState("PKR");
  const [ownerId, setOwnerId] = useState("");
  const [cf, setCf] = useState<Record<string, unknown>>({});
  const pipeline = pipelines.find((p) => p.id === pipelineId);
  const fieldDefs = useMemo(() => defs.filter((d) => d.pipelineId === null || d.pipelineId === pipelineId), [defs, pipelineId]);
  const firstStage = pipeline?.stages[0];

  if (pipelines.length === 0) return <p className={ui.muted}>Create a pipeline first in Settings → Pipelines.</p>;

  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        run(() => createOpportunity({ contactId: contact, pipelineId, title, value: value || 0, currency, ownerId: ownerId || null, customFields: cf }), {
          success: `Opportunity "${title.trim()}" created.`,
          onSuccess: (d) => {
            setTitle(""); setValue(""); setCf({});
            if (goToNew) router.push(`/opportunities/${d.id}`);
          },
        });
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        {!contactId && (
          <div className="space-y-1 sm:col-span-2">
            <label htmlFor="op-contact" className={ui.label}>Contact</label>
            <select id="op-contact" required value={contact} onChange={(e) => setContact(e.target.value)} className={ui.input}>
              <option value="">— Choose a contact —</option>
              {(contacts ?? []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
        )}
        <div className="space-y-1 sm:col-span-2">
          <label htmlFor="op-title" className={ui.label}>Title</label>
          <input id="op-title" required value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. 10kW rooftop system" className={ui.input} />
        </div>
        <div className="space-y-1">
          <label htmlFor="op-pipeline" className={ui.label}>Pipeline</label>
          <select id="op-pipeline" value={pipelineId} onChange={(e) => { setPipelineId(e.target.value); setCf({}); }} className={ui.input}>
            {pipelines.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          {firstStage && <p className="text-xs text-stone-600">Starts in “{firstStage.name}”.</p>}
        </div>
        <div className="space-y-1">
          <label htmlFor="op-owner" className={ui.label}>Owner</label>
          <select id="op-owner" value={ownerId} onChange={(e) => setOwnerId(e.target.value)} className={ui.input}>
            <option value="">— Me —</option>
            {team.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
        </div>
        <div className="space-y-1">
          <label htmlFor="op-value" className={ui.label}>Value</label>
          <input id="op-value" type="number" min="0" step="any" value={value} onChange={(e) => setValue(e.target.value)} className={ui.input} />
        </div>
        <div className="space-y-1">
          <label htmlFor="op-currency" className={ui.label}>Currency</label>
          <select id="op-currency" value={currency} onChange={(e) => setCurrency(e.target.value)} className={ui.input}>
            <option value="PKR">PKR</option>
            <option value="USD">USD</option>
          </select>
        </div>
      </div>
      <DynamicFields defs={fieldDefs} values={cf} onChange={(k, v) => setCf((p) => ({ ...p, [k]: v }))} idPrefix="op-new" required={firstStage?.requiredFieldIds ?? []} />
      <button disabled={pending} className={ui.btnPrimary}>{pending && <Spinner />} Create opportunity</button>
    </form>
  );
}
