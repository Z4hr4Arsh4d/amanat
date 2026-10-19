"use client";
// P1 owns. Edit / delete on the contact page.
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAction } from "@/components/ui/useAction";
import { Spinner } from "@/components/ui/Spinner";
import { ui } from "@/components/ui/styles";
import { Icon } from "@/components/ui/Icon";
import type { FieldDefView } from "@/components/ui/DynamicFields";
import { ContactForm, type ContactFormValues } from "../ContactForm";
import { deleteContact } from "../actions";

type Opt = { id: string; name: string };

export function ContactActions({ initial, defs, companies, team, canEdit, canDelete, opportunities }: {
  initial: ContactFormValues & { id: string; version: number }; defs: FieldDefView[]; companies: Opt[]; team: Opt[];
  canEdit: boolean; canDelete: boolean; opportunities: number;
}) {
  const router = useRouter();
  const { pending, run } = useAction();
  const [editing, setEditing] = useState(false);
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {canEdit && !editing && <button type="button" className={ui.btn} onClick={() => setEditing(true)}><Icon name="pencil" className="h-4 w-4" />Edit contact</button>}
        {canDelete && (
          <button
            type="button"
            disabled={pending}
            className={ui.btnDanger}
            onClick={() => {
              const extra = opportunities ? ` This also deletes ${opportunities} opportunit${opportunities === 1 ? "y" : "ies"}.` : "";
              if (!window.confirm(`Delete ${initial.name}?${extra}`)) return;
              run(() => deleteContact({ contactId: initial.id, version: initial.version }), {
                success: `${initial.name} deleted.`,
                onSuccess: () => router.push("/contacts"),
              });
            }}
          >
            {pending ? <Spinner /> : <Icon name="trash" className="h-4 w-4" />}Delete
          </button>
        )}
      </div>
      {editing && (
        <div className="animate-fade-in rounded-xl border border-stone-200 bg-stone-50/60 p-4 sm:p-5">
          <h2 className={`${ui.h2} mb-4`}>Edit contact</h2>
          <ContactForm initial={initial} defs={defs} companies={companies} team={team} onDone={() => setEditing(false)} />
        </div>
      )}
    </div>
  );
}
