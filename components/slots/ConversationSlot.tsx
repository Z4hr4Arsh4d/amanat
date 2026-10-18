"use client";
// P3 owns this slot. P1 places it on the contact / opportunity pages. Keep the props stable.
// Shows the contact's WhatsApp conversation (live) with a reply box, or lets you start one.
import useSWR from "swr";
import { Spinner } from "@/lib/integrations/ui/Spinner";
import { Composer, ThreadView, type ThreadData } from "@/lib/integrations/ui/Thread";

type Resp =
  | { conversationId: string; hidden: false; thread: ThreadData }
  | { conversationId: null; hidden: boolean; contact: { id: string; name: string; phone: string | null; optedOut: boolean } };

const fetcher = async (url: string): Promise<Resp> => {
  const r = await fetch(url);
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error ?? "Could not load the conversation.");
  return j as Resp;
};

export function ConversationSlot(props: { contactId: string }) {
  const { data, error, mutate } = useSWR<Resp>(`/inbox/data/contact/${encodeURIComponent(props.contactId)}`, fetcher, { refreshInterval: 3000 });
  const empty = data && data.conversationId === null ? data : null;
  const full = data && data.conversationId !== null ? data : null;
  return (
    <section aria-labelledby="wa-conv" className="space-y-2">
      <h2 id="wa-conv" className="text-lg font-semibold">WhatsApp conversation</h2>
      {error && <p role="alert" className="text-sm text-red-900"><span aria-hidden="true">⚠ </span>{(error as Error).message}</p>}
      {!data && !error && <p className="text-sm text-stone-600"><Spinner /> Loading…</p>}
      {full && <ThreadView thread={full.thread} onChanged={() => mutate()} compact />}
      {empty?.hidden && (
        <p className="rounded border border-stone-200 bg-stone-50 p-3 text-sm text-stone-700">
          This contact has a WhatsApp conversation handled by someone else. You can see it if it is assigned to you.
        </p>
      )}
      {empty && !empty.hidden && (
        <div className="rounded-lg border border-stone-200 bg-white">
          <p className="p-3 text-sm text-stone-700">No WhatsApp messages with {empty.contact.name} yet.</p>
          <Composer contactId={empty.contact.id} windowOpen={false} onSent={() => mutate()}
            blocked={empty.contact.optedOut ? `${empty.contact.name} opted out. Messages are blocked to respect their choice.`
              : !empty.contact.phone ? `${empty.contact.name} has no phone number. Add one to send WhatsApp messages.` : null} />
        </div>
      )}
    </section>
  );
}
