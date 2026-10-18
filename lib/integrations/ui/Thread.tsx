"use client";
// P3 owns. A WhatsApp conversation: header (contact, assignee, 24h window), messages with delivery
// status (I1.4), failed bubbles with Retry (I1.7), composer that explains opt-out blocks (I1.9).
import { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { retryMessageAction, sendMessageAction, setAssigneeAction } from "@/app/(app)/inbox/actions";
import type { Thread } from "../inbox";
import { Chip } from "./StatusChip";
import { Spinner } from "./Spinner";
import { useRun } from "./useRun";

type Json<T> = { [K in keyof T]: T[K] extends Date ? string : T[K] extends Date | null ? string | null : T[K] extends object ? Json<T[K]> : T[K] };
export type ThreadData = Json<Thread>;
type Msg = ThreadData["messages"][number];

const time = (s: string) => new Date(s).toLocaleString([], { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

function hoursLeft(end: string) {
  const h = (new Date(end).getTime() - Date.now()) / 3600_000;
  return h >= 1 ? `${Math.floor(h)} h` : `${Math.max(1, Math.round(h * 60))} min`;
}

function StatusLine({ m, onRetry, retrying }: { m: Msg; onRetry: () => void; retrying: boolean }) {
  if (m.direction === "IN") return <span>Received</span>;
  if (m.status === "FAILED")
    return (
      <span className="flex flex-wrap items-center gap-2 text-red-900">
        <span><span aria-hidden="true">⚠ </span><strong>Failed:</strong> {m.errorReason ?? "Not delivered."}</span>
        <button type="button" onClick={onRetry} disabled={retrying}
          className="inline-flex items-center gap-1 rounded border border-red-400 bg-white px-2 py-0.5 text-xs font-medium hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-red-700">
          {retrying && <Spinner />}Retry
        </button>
      </span>
    );
  if (m.status === "QUEUED")
    return <span className={m.errorReason ? "text-amber-900" : ""}><span aria-hidden="true">⏳ </span>{m.errorReason ?? "Sending…"}</span>;
  const label = { SENT: "✓ Sent", DELIVERED: "✓✓ Delivered", READ: "✓✓ Read", RECEIVED: "Received" }[m.status] ?? m.status;
  return <span>{label}</span>;
}

export function ThreadView({ thread, onChanged, compact }: { thread: ThreadData; onChanged: () => void; compact?: boolean }) {
  const end = useRef<HTMLLIElement>(null);
  const count = thread.messages.length;
  useEffect(() => { end.current?.scrollIntoView({ block: "nearest" }); }, [count]);
  const { pending, run } = useRun();
  const assignId = useId();

  return (
    <div className="flex min-h-0 min-w-0 flex-col rounded-lg border border-stone-200 bg-white">
      <header className="space-y-2 border-b border-stone-200 p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-0">
            <h2 className="truncate font-semibold">
              <Link href={`/contacts/${thread.contact.id}`} className="hover:underline">{thread.contact.name}</Link>
            </h2>
            <p className="text-xs text-stone-600">{thread.contact.phone ?? "No phone"} · WhatsApp</p>
          </div>
          <div className="flex flex-wrap gap-1">
            {thread.contact.optedOut && <Chip tone="bad">Opted out</Chip>}
            {thread.windowEndsAt ? (
              <Chip tone="ok" title="WhatsApp allows free-form replies for 24 hours after the customer's last message.">Reply window: {hoursLeft(thread.windowEndsAt)} left</Chip>
            ) : (
              <Chip tone="warn" title="WhatsApp only allows template messages more than 24 hours after the customer's last message.">Reply window closed</Chip>
            )}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span>
            Handled by <strong>{thread.assignee.name ?? "nobody yet"}</strong>
            {thread.assignee.id && <span className="text-stone-600"> ({thread.assignee.why})</span>}
          </span>
          {thread.canAssign && (
            <span className="flex min-w-0 items-center gap-1">
              <label htmlFor={assignId} className="sr-only">Change who handles this conversation</label>
              <select id={assignId} disabled={!!pending}
                value={thread.assignee.why === "set by manager" ? thread.assignee.id ?? "" : ""}
                onChange={(e) => run("assign", () => setAssigneeAction(thread.id, e.target.value), { onOk: onChanged })}
                className="max-w-[14rem] rounded border border-stone-300 bg-white px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-emerald-700">
                <option value="">Follow the lead owner (automatic)</option>
                {thread.team.map((u) => <option key={u.id} value={u.id}>{u.name}{u.status !== "AVAILABLE" ? ` (${u.status.replace("_", " ").toLowerCase()})` : ""}</option>)}
              </select>
              {pending === "assign" && <Spinner />}
            </span>
          )}
        </div>
      </header>

      <ol aria-label="Messages" className={`flex-1 space-y-2 overflow-y-auto p-3 ${compact ? "max-h-96" : "max-h-[60vh] md:max-h-[calc(100dvh-20rem)]"}`}>
        {thread.messages.length === 0 && <li className="text-center text-sm text-stone-600">No messages yet.</li>}
        {thread.messages.map((m) => (
          <li key={m.id} className={`flex ${m.direction === "OUT" ? "justify-end" : "justify-start"}`}>
            <div className={`max-w-[85%] rounded-lg border px-3 py-2 text-sm ${m.status === "FAILED" ? "border-2 border-red-500 bg-red-50" : m.direction === "OUT" ? "border-emerald-200 bg-emerald-50" : "border-stone-200 bg-stone-50"}`}>
              <p className="whitespace-pre-wrap break-words">{m.body}</p>
              <p className="mt-1 flex flex-wrap gap-x-2 text-xs text-stone-600">
                <span>{m.direction === "IN" ? thread.contact.name : m.sentBy}</span>
                <time dateTime={m.createdAt}>{time(m.createdAt)}</time>
              </p>
              <div className="mt-0.5 text-xs text-stone-700">
                <StatusLine m={m} retrying={pending === m.id} onRetry={() => run(m.id, () => retryMessageAction(m.id), { onOk: onChanged })} />
              </div>
            </div>
          </li>
        ))}
        <li ref={end} aria-hidden="true" />
      </ol>

      <Composer conversationId={thread.id} blocked={thread.blocked} windowOpen={!!thread.windowEndsAt} joinCode={thread.joinCode} onSent={onChanged} />
    </div>
  );
}

export function Composer(props: { conversationId?: string; contactId?: string; blocked: string | null; windowOpen: boolean; joinCode?: string | null; onSent: () => void }) {
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const id = useId();

  async function submit() {
    if (!body.trim() || sending) return;
    setSending(true);
    try {
      const r = await sendMessageAction({ conversationId: props.conversationId, contactId: props.contactId, body });
      if (r.ok) {
        if (r.data?.delayed) toast.warning(r.message ?? "Not sent yet. We will retry automatically.");
        else toast.success(r.message ?? "Message sent.");
        setBody("");
      }
      else toast.error(r.error);
      props.onSent(); // a failed send still shows as a red bubble with Retry
    } catch {
      toast.error("Could not reach the server. Check your internet connection and try again.");
    } finally {
      setSending(false);
    }
  }

  if (props.blocked) {
    return (
      <p role="note" className="border-t border-stone-200 bg-stone-50 p-3 text-sm text-stone-800">
        <span aria-hidden="true">🚫 </span>{props.blocked}
      </p>
    );
  }
  return (
    <form className="space-y-2 border-t border-stone-200 p-3" onSubmit={(e) => { e.preventDefault(); submit(); }}>
      {!props.windowOpen && (
        <p className="text-xs text-amber-900">
          <span aria-hidden="true">⚠ </span>The customer has not written in the last 24 hours, so WhatsApp may refuse this message.
          {props.joinCode ? ` Sandbox: they must first send “${props.joinCode}” to the sandbox number.` : ""}
        </p>
      )}
      <label htmlFor={id} className="block text-sm font-medium">Reply on WhatsApp</label>
      <textarea id={id} value={body} onChange={(e) => setBody(e.target.value)} rows={2} maxLength={1600}
        onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(); } }}
        placeholder="Type a message. Enter sends, Shift+Enter adds a line."
        className="w-full resize-y rounded border border-stone-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-700" />
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-stone-600">{body.length}/1600</span>
        <button type="submit" disabled={sending || !body.trim()}
          className="inline-flex items-center gap-2 rounded bg-emerald-800 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-900 focus:outline-none focus:ring-2 focus:ring-emerald-700 disabled:opacity-60">
          {sending && <Spinner />}{sending ? "Sending…" : "Send"}
        </button>
      </div>
    </form>
  );
}
