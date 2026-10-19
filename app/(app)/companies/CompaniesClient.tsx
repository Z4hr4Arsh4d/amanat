"use client";
// P1 owns.
import Link from "next/link";
import { useState } from "react";
import { useAction } from "@/components/ui/useAction";
import { Spinner } from "@/components/ui/Spinner";
import { DynamicFields, type FieldDefView } from "@/components/ui/DynamicFields";
import { ui } from "@/components/ui/styles";
import { Icon } from "@/components/ui/Icon";
import { AddSummary, EmptyState } from "@/components/ui/Kit";
import { createCompany, deleteCompany, updateCompany } from "./actions";

type Row = { id: string; name: string; version: number; contacts: number; customFields: Record<string, unknown> };
type Perms = { create: boolean; edit: boolean; del: boolean };

export function CompaniesClient({ rows, defs, perms, search, q }: { rows: Row[]; defs: FieldDefView[]; perms: Perms; search?: React.ReactNode; q?: string }) {
  return (
    <div className="space-y-6">
      {perms.create && <NewCompany defs={defs} />}
      {search}
      {rows.length === 0 ? (
        <EmptyState icon="building" title={q ? `No companies match “${q}”` : "No companies yet"}>
          {q ? "Try a shorter part of the name." : "Add the businesses your contacts work for, then link contacts to them."}
        </EmptyState>
      ) : (
        <ul className={`${ui.cardFlush} divide-y divide-stone-100`}>
          {rows.map((r) => <CompanyRow key={r.id} row={r} defs={defs} perms={perms} />)}
        </ul>
      )}
    </div>
  );
}

function NewCompany({ defs }: { defs: FieldDefView[] }) {
  const { pending, run } = useAction();
  const [name, setName] = useState("");
  const [cf, setCf] = useState<Record<string, unknown>>({});
  return (
    <details className={ui.cardFlush}>
      <AddSummary>New company</AddSummary>
      <form
        className="space-y-4 border-t border-stone-200 p-5"
        onSubmit={(e) => {
          e.preventDefault();
          run(() => createCompany({ name, customFields: cf }), {
            success: `Company "${name.trim()}" created.`,
            onSuccess: () => { setName(""); setCf({}); },
          });
        }}
      >
        <div className={`${ui.field} sm:max-w-md`}>
          <label htmlFor="co-name" className={ui.label}>Company name</label>
          <input id="co-name" required value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Unique Traders" className={ui.input} />
        </div>
        <DynamicFields defs={defs} values={cf} onChange={(k, v) => setCf((p) => ({ ...p, [k]: v }))} idPrefix="co-new" />
        <button disabled={pending} className={ui.btnPrimary}>{pending && <Spinner />}{pending ? "Creating…" : "Create company"}</button>
      </form>
    </details>
  );
}

function CompanyRow({ row, defs, perms }: { row: Row; defs: FieldDefView[]; perms: Perms }) {
  const { pending, run } = useAction();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(row.name);
  const [cf, setCf] = useState<Record<string, unknown>>(row.customFields);
  const [version, setVersion] = useState(row.version);

  function remove(unlinkContacts = false) {
    run(() => deleteCompany({ companyId: row.id, version: row.version, unlinkContacts }), {
      success: `Company "${row.name}" deleted.`,
      onError: (r) => {
        const linked = (r.data as { linkedContacts?: number } | undefined)?.linkedContacts;
        if (r.status === 409 && linked && window.confirm(`${row.name} has ${linked} contact(s). Unlink them from this company and delete it? The contacts are kept.`)) {
          remove(true);
        }
      },
    });
  }

  return (
    <li className={`px-5 py-4 ${editing ? "bg-stone-50/60" : "transition-colors hover:bg-stone-50/60"}`}>
      {!editing ? (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-stone-100 text-stone-500"><Icon name="building" className="h-4 w-4" /></span>
            <div className="min-w-0">
              <p className="break-words font-bold text-stone-900">{row.name}</p>
              <Link href={`/contacts?company=${row.id}`} className="inline-flex items-center gap-1 text-sm font-semibold text-emerald-800 hover:underline">
                {row.contacts} contact{row.contacts === 1 ? "" : "s"}<Icon name="arrowRight" className="h-3.5 w-3.5" />
              </Link>
            </div>
          </div>
          <div className="flex gap-2">
            {perms.edit && <button type="button" className={ui.btnSm} onClick={() => { setEditing(true); setVersion(row.version); setName(row.name); setCf(row.customFields); }}><Icon name="pencil" className="h-3.5 w-3.5" />Edit</button>}
            {perms.del && <button type="button" disabled={pending} className={ui.btnDangerSm} onClick={() => { if (window.confirm(`Delete ${row.name}?`)) remove(); }}>{pending ? <Spinner className="h-3.5 w-3.5" /> : <Icon name="trash" className="h-3.5 w-3.5" />}Delete</button>}
          </div>
        </div>
      ) : (
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            run(() => updateCompany({ companyId: row.id, version, name, customFields: cf }), {
              success: "Company saved.",
              onSuccess: (d) => { setVersion(d.version); setEditing(false); },
            });
          }}
        >
          <div className={`${ui.field} sm:max-w-md`}>
            <label htmlFor={`co-${row.id}`} className={ui.label}>Company name</label>
            <input id={`co-${row.id}`} required value={name} onChange={(e) => setName(e.target.value)} className={ui.input} />
          </div>
          <DynamicFields defs={defs} values={cf} onChange={(k, v) => setCf((p) => ({ ...p, [k]: v }))} idPrefix={`co-${row.id}`} />
          <div className="flex gap-2">
            <button disabled={pending} className={ui.btnPrimary}>{pending && <Spinner />}{pending ? "Saving…" : "Save"}</button>
            <button type="button" className={ui.btn} onClick={() => setEditing(false)}>Cancel</button>
          </div>
        </form>
      )}
    </li>
  );
}
