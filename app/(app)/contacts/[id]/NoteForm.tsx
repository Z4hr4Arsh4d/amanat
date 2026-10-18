"use client";
// P1 owns. F2.7 notes.
import { useState } from "react";
import { useAction } from "@/components/ui/useAction";
import { Spinner } from "@/components/ui/Spinner";
import { ui } from "@/components/ui/styles";
import { addNote } from "../actions";

export function NoteForm({ contactId, opportunityId }: { contactId: string; opportunityId?: string }) {
  const { pending, run } = useAction();
  const [body, setBody] = useState("");
  const id = `note-${opportunityId ?? contactId}`;
  return (
    <form
      className="space-y-2"
      onSubmit={(e) => {
        e.preventDefault();
        run(() => addNote({ contactId, opportunityId: opportunityId ?? null, body }), { success: "Note added.", onSuccess: () => setBody("") });
      }}
    >
      <label htmlFor={id} className={ui.label}>Add a note</label>
      <textarea id={id} required rows={3} value={body} onChange={(e) => setBody(e.target.value)} className={ui.input} placeholder="What happened? e.g. Called, customer wants a site visit on Friday." />
      <button disabled={pending} className={ui.btnPrimary}>{pending && <Spinner />} Add note</button>
    </form>
  );
}
