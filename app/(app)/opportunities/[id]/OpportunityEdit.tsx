"use client";
// P1 owns. Edit / delete an opportunity. Q4: saves with the version you started editing from.
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAction } from "@/components/ui/useAction";
import { Spinner } from "@/components/ui/Spinner";
import { DynamicFields, type FieldDefView } from "@/components/ui/DynamicFields";
import { ui } from "@/components/ui/styles";
import { Icon } from "@/components/ui/Icon";
import { deleteOpportunity, updateOpportunity } from "../actions";

type Opt = { id: string; name: string };
type Init = { id: string; version: number; title: string; value: number | null; valueMasked: boolean; currency: string; ownerId: string; customFields: Record<string, unknown> };

export function OpportunityEdit({ initial, defs, required, team, canEdit, canDelete }: {
  initial: Init; defs: FieldDefView[]; required: string[]; team: Opt[]; canEdit: boolean; canDelete: boolean;
}) {
  const router = useRouter();
  const { pending, run } = useAction();
  const [editing, setEditing] = useState(false);
  const [v, setV] = useState(initial);

  function open() {
    setV(initial); // start from the latest saved version
    setEditing(true);
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap gap-2">
        {canEdit && !editing && <button type="button" className={ui.btn} onClick={open}><Icon name="pencil" className="h-4 w-4" />Edit opportunity</button>}
        {canDelete && (
          <button
            type="button"
            disabled={pending}
            className={ui.btnDanger}
            onClick={() => {
              if (!window.confirm(`Delete "${initial.title}"?`)) return;
              run(() => deleteOpportunity({ opportunityId: initial.id, version: initial.version }), {
                success: "Opportunity deleted.",
                onSuccess: () => router.push("/opportunities"),
              });
            }}
          >
            {pending ? <Spinner /> : <Icon name="trash" className="h-4 w-4" />}Delete
          </button>
        )}
      </div>
      {editing && (
        <form
          className="animate-fade-in space-y-5 rounded-xl border border-stone-200 bg-stone-50/60 p-4 sm:p-5"
          onSubmit={(e) => {
            e.preventDefault();
            run(
              () => updateOpportunity({
                opportunityId: v.id, version: v.version, title: v.title, currency: v.currency, ownerId: v.ownerId || null,
                customFields: v.customFields, ...(v.valueMasked ? {} : { value: v.value ?? 0 }),
              }),
              { success: "Opportunity saved.", onSuccess: () => setEditing(false) },
            );
          }}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <div className={`${ui.field} sm:col-span-2`}>
              <label htmlFor="oe-title" className={ui.label}>Title</label>
              <input id="oe-title" required value={v.title} onChange={(e) => setV({ ...v, title: e.target.value })} className={ui.input} />
            </div>
            <div className={ui.field}>
              <label htmlFor="oe-value" className={ui.label}>Value</label>
              {v.valueMasked ? (
                <p id="oe-value" className="py-2 text-sm text-stone-600">••••• (hidden for your role)</p>
              ) : (
                <input id="oe-value" type="number" min="0" step="any" value={v.value ?? 0} onChange={(e) => setV({ ...v, value: e.target.value === "" ? 0 : Number(e.target.value) })} className={ui.input} />
              )}
            </div>
            <div className={ui.field}>
              <label htmlFor="oe-currency" className={ui.label}>Currency</label>
              <select id="oe-currency" value={v.currency} onChange={(e) => setV({ ...v, currency: e.target.value })} className={ui.input}>
                <option value="PKR">PKR</option>
                <option value="USD">USD</option>
              </select>
            </div>
            <div className={ui.field}>
              <label htmlFor="oe-owner" className={ui.label}>Owner</label>
              <select id="oe-owner" value={v.ownerId} onChange={(e) => setV({ ...v, ownerId: e.target.value })} className={ui.input}>
                <option value="">— Nobody —</option>
                {team.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
            </div>
          </div>
          <DynamicFields
            defs={defs}
            values={v.customFields}
            onChange={(k, val) => setV((p) => ({ ...p, customFields: { ...p.customFields, [k]: val } }))}
            idPrefix={`oe-${v.id}`}
            required={required}
          />
          <div className="flex gap-2">
            <button disabled={pending} className={ui.btnPrimary}>{pending && <Spinner />}{pending ? "Saving…" : "Save"}</button>
            <button type="button" className={ui.btn} onClick={() => setEditing(false)}>Cancel</button>
          </div>
        </form>
      )}
    </div>
  );
}
