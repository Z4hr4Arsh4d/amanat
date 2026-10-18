"use client";
// P1 owns.
import Link from "next/link";
import { useState } from "react";
import { useAction } from "@/components/ui/useAction";
import { Spinner } from "@/components/ui/Spinner";
import { DynamicFields, type FieldDefView } from "@/components/ui/DynamicFields";
import { ui } from "@/components/ui/styles";
import { createCompany, deleteCompany, updateCompany } from "./actions";

type Row = { id: string; name: string; version: number; contacts: number; customFields: Record<string, unknown> };
type Perms = { create: boolean; edit: boolean; del: boolean };

export function CompaniesClient({ rows, defs, perms }: { rows: Row[]; defs: FieldDefView[]; perms: Perms }) {
  return (
    <div className="space-y-4">
      {perms.create && <NewCompany defs={defs} />}
      {rows.length === 0 ? (
        <p className={ui.muted}>No companies found.</p>
      ) : (
        <ul className="space-y-2">
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
    <details className={ui.card}>
      <summary className="cursor-pointer font-medium">＋ New company</summary>
      <form
        className="mt-3 space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          run(() => createCompany({ name, customFields: cf }), {
            success: `Company "${name.trim()}" created.`,
            onSuccess: () => { setName(""); setCf({}); },
          });
        }}
      >
        <div className="space-y-1">
          <label htmlFor="co-name" className={ui.label}>Company name</label>
          <input id="co-name" required value={name} onChange={(e) => setName(e.target.value)} className={ui.input} />
        </div>
        <DynamicFields defs={defs} values={cf} onChange={(k, v) => setCf((p) => ({ ...p, [k]: v }))} idPrefix="co-new" />
        <button disabled={pending} className={ui.btnPrimary}>{pending && <Spinner />} Create company</button>
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
    <li className={ui.card}>
      {!editing ? (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="break-words font-medium">{row.name}</p>
            <Link href={`/contacts?company=${row.id}`} className="text-sm text-emerald-800 underline">
              {row.contacts} contact{row.contacts === 1 ? "" : "s"}
            </Link>
          </div>
          <div className="flex gap-2">
            {perms.edit && <button type="button" className={ui.btn} onClick={() => { setEditing(true); setVersion(row.version); setName(row.name); setCf(row.customFields); }}>Edit</button>}
            {perms.del && <button type="button" disabled={pending} className={ui.btnDanger} onClick={() => { if (window.confirm(`Delete ${row.name}?`)) remove(); }}>{pending && <Spinner />} Delete</button>}
          </div>
        </div>
      ) : (
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            run(() => updateCompany({ companyId: row.id, version, name, customFields: cf }), {
              success: "Company saved.",
              onSuccess: (d) => { setVersion(d.version); setEditing(false); },
            });
          }}
        >
          <div className="space-y-1">
            <label htmlFor={`co-${row.id}`} className={ui.label}>Company name</label>
            <input id={`co-${row.id}`} required value={name} onChange={(e) => setName(e.target.value)} className={ui.input} />
          </div>
          <DynamicFields defs={defs} values={cf} onChange={(k, v) => setCf((p) => ({ ...p, [k]: v }))} idPrefix={`co-${row.id}`} />
          <div className="flex gap-2">
            <button disabled={pending} className={ui.btnPrimary}>{pending && <Spinner />} Save</button>
            <button type="button" className={ui.btn} onClick={() => setEditing(false)}>Cancel</button>
          </div>
        </form>
      )}
    </li>
  );
}
