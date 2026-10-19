"use client";
// P1 owns. Create and edit form for a contact (custom fields included, F2.2).
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAction } from "@/components/ui/useAction";
import { Spinner } from "@/components/ui/Spinner";
import { DynamicFields, type FieldDefView } from "@/components/ui/DynamicFields";
import { ui } from "@/components/ui/styles";
import { createContact, updateContact } from "./actions";

type Opt = { id: string; name: string };
export type ContactFormValues = {
  id?: string; version?: number; name: string; email: string; phone: string; companyId: string; ownerId: string;
  tags: string; customFields: Record<string, unknown>;
};

export function ContactForm({ initial, defs, companies, team, onDone }: {
  initial?: ContactFormValues; defs: FieldDefView[]; companies: Opt[]; team: Opt[]; onDone?: () => void;
}) {
  const router = useRouter();
  const { pending, run } = useAction();
  const editing = !!initial?.id;
  const [v, setV] = useState<ContactFormValues>(
    initial ?? { name: "", email: "", phone: "", companyId: "", ownerId: "", tags: "", customFields: {} },
  );
  const [version, setVersion] = useState(initial?.version ?? 0);
  const pre = initial?.id ?? "new";
  const set = (k: keyof ContactFormValues) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setV((p) => ({ ...p, [k]: e.target.value }));

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const payload = {
      name: v.name, email: v.email, phone: v.phone, companyId: v.companyId || null, ownerId: v.ownerId || null,
      tags: v.tags.split(",").map((t) => t.trim()).filter(Boolean), customFields: v.customFields,
    };
    if (editing) {
      run(() => updateContact({ ...payload, contactId: initial!.id!, version }), {
        success: "Contact saved.",
        onSuccess: (d) => { setVersion(d.version); onDone?.(); },
      });
    } else {
      run(() => createContact(payload), {
        success: `Contact "${v.name.trim()}" created.`,
        onSuccess: (d) => router.push(`/contacts/${d.id}`),
      });
    }
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className={ui.field}>
          <label htmlFor={`${pre}-name`} className={ui.label}>Name</label>
          <input id={`${pre}-name`} required value={v.name} onChange={set("name")} placeholder="e.g. Ahmed Raza" className={ui.input} autoComplete="off" />
        </div>
        <div className={ui.field}>
          <label htmlFor={`${pre}-phone`} className={ui.label}>Phone (WhatsApp)</label>
          <input id={`${pre}-phone`} value={v.phone} onChange={set("phone")} placeholder="0300 1234567 or +92 300 1234567" className={ui.input} inputMode="tel" type="tel" />
        </div>
        <div className={ui.field}>
          <label htmlFor={`${pre}-email`} className={ui.label}>Email <span className="font-normal text-stone-500">(optional)</span></label>
          <input id={`${pre}-email`} type="email" value={v.email} onChange={set("email")} placeholder="name@example.com" className={ui.input} />
        </div>
        <div className={ui.field}>
          <label htmlFor={`${pre}-company`} className={ui.label}>Company</label>
          <select id={`${pre}-company`} value={v.companyId} onChange={set("companyId")} className={ui.input}>
            <option value="">— No company —</option>
            {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div className={ui.field}>
          <label htmlFor={`${pre}-owner`} className={ui.label}>Owner</label>
          <select id={`${pre}-owner`} value={v.ownerId} onChange={set("ownerId")} className={ui.input}>
            <option value="">{editing ? "— Nobody —" : "— Me —"}</option>
            {team.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
        </div>
        <div className={ui.field}>
          <label htmlFor={`${pre}-tags`} className={ui.label}>Tags (comma separated)</label>
          <input id={`${pre}-tags`} value={v.tags} onChange={set("tags")} placeholder="vip, rooftop" className={ui.input} />
        </div>
      </div>
      <DynamicFields
        defs={defs}
        values={v.customFields}
        onChange={(k, val) => setV((p) => ({ ...p, customFields: { ...p.customFields, [k]: val } }))}
        idPrefix={pre}
      />
      <div className="flex flex-wrap gap-2 border-t border-stone-100 pt-4">
        <button disabled={pending} className={ui.btnPrimary}>{pending && <Spinner />}{pending ? "Saving…" : editing ? "Save contact" : "Create contact"}</button>
        {onDone && <button type="button" className={ui.btn} onClick={onDone}>Cancel</button>}
      </div>
    </form>
  );
}
