"use client";
// P3 owns. A WhatsApp conversation: header (contact, assignee, 24h window), messages with delivery
// status (I1.4), failed bubbles with Retry (I1.7), composer that explains opt-out blocks (I1.9).
import { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { retryMessageAction, sendMessageAction, setAssigneeAction } from "@/app/(app)/inbox/actions";
import type { Thread } from "../inbox";
import { Icon } from "@/components/ui/Icon";
import { Avatar } from "@/components/ui/Kit";
import { ui } from "@/components/ui/styles";
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

function StatusLine({ m, onRetry, retrying, web }: { m: Msg; onRetry: () => void; retrying: boolean; web: boolean }) {
  if (m.direction === "IN") return <span>Received</span>;
  if (m.status === "FAILED")
    return (
      <span className="flex flex-wrap items-center gap-2 text-red-800">
        <span className="inline-flex items-center gap-1"><Icon name="alertCircle" className="h-3.5 w-3.5" /><strong>Failed:</strong> {m.errorReason ?? "Not delivered."}</span>
        <button type="button" onClick={onRetry} disabled={retrying} className={`${ui.btnDangerSm} !h-7`}>
          {retrying ? <Spinner /> : <Icon name="refresh" className="h-3.5 w-3.5" />}Retry
        </button>
      </span>
    );
  if (m.status === "QUEUED")
    return <span className={`inline-flex items-center gap-1 ${m.errorReason ? "text-amber-900" : ""}`}><Icon name="clock" className="h-3.5 w-3.5" />{m.errorReason ?? "Sending…"}</span>;
  const label = web
    ? { SENT: "✓ Sent", DELIVERED: "✓ Sent to the customer's chat", READ: "✓✓ Seen by the customer", RECEIVED: "Received" }[m.status] ?? m.status
    : { SENT: "✓ Sent", DELIVERED: "✓✓ Delivered", READ: "✓✓ Read", RECEIVED: "Received" }[m.status] ?? m.status;
  return <span>{label}</span>;
}

export function ThreadView({ thread, onChanged, compact }: { thread: ThreadData; onChanged: () => void; compact?: boolean }) {
  const end = useRef<HTMLLIElement>(null);
  const count = thread.messages.length;
  useEffect(() => { end.current?.scrollIntoView({ block: "nearest" }); }, [count]);
  const { pending, run } = useRun();
  const assignId = useId();
  const web = thread.kind === "WEBCHAT";

  return (
    <div className={`flex min-h-0 min-w-0 flex-col bg-white ${compact ? "" : "overflow-hidden rounded-xl border border-stone-200 shadow-xs"}`}>
      <header className={`space-y-3 border-b border-stone-200 ${compact ? "px-5 pb-4" : "p-4"}`}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-3">
            {!compact && <Avatar name={thread.contact.name} />}
            <div className="min-w-0">
              <h2 className="truncate font-bold text-stone-900">
                <Link href={`/contacts/${thread.contact.id}`} className="hover:text-emerald-800 hover:underline">{thread.contact.name}</Link>
              </h2>
              <p className="flex items-center gap-1 text-xs text-stone-600"><Icon name={web ? "globe" : "whatsapp"} className="h-3 w-3" />{thread.contact.phone ?? "No phone"} · {web ? "Website chat" : "WhatsApp"}</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-1">
            {thread.contact.optedOut && <Chip tone="bad">Opted out</Chip>}
            {web ? (
              <Chip tone="info" title="The customer is chatting on your website. Replies appear in their chat window at once.">Live website chat</Chip>
            ) : thread.windowEndsAt ? (
              <Chip tone="ok" title="WhatsApp allows free-form replies for 24 hours after the customer's last message.">Reply window: {hoursLeft(thread.windowEndsAt)} left</Chip>
            ) : (
              <Chip tone="warn" title="WhatsApp only allows template messages more than 24 hours after the customer's last message.">Reply window closed</Chip>
            )}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-stone-600">
            Handled by <strong className="text-stone-900">{thread.assignee.name ?? "nobody yet"}</strong>
            {thread.assignee.id && <span className="text-stone-600"> ({thread.assignee.why})</span>}
          </span>
          {thread.canAssign && (
            <span className="flex min-w-0 items-center gap-1">
              <label htmlFor={assignId} className="sr-only">Change who handles this conversation</label>
              <select id={assignId} disabled={!!pending}
                value={thread.assignee.why === "set by manager" ? thread.assignee.id ?? "" : ""}
                onChange={(e) => run("assign", () => setAssigneeAction(thread.id, e.target.value), { onOk: onChanged })}
                className={`${ui.inputSm} max-w-[15rem]`}>
                <option value="">Follow the lead owner (automatic)</option>
                {thread.team.map((u) => <option key={u.id} value={u.id}>{u.name}{u.status !== "AVAILABLE" ? ` (${u.status.replace("_", " ").toLowerCase()})` : ""}</option>)}
              </select>
              {pending === "assign" && <Spinner />}
            </span>
          )}
        </div>
      </header>

      <ol aria-label="Messages" className={`flex-1 space-y-3 overflow-y-auto bg-stone-50/70 p-4 ${compact ? "max-h-96" : "max-h-[60vh] md:max-h-[calc(100dvh-22rem)] md:min-h-[20rem]"}`}>
        {thread.messages.length === 0 && <li className="py-6 text-center text-sm text-stone-600">No messages yet.</li>}
        {thread.messages.map((m) => (
          <li key={m.id} className={`flex ${m.direction === "OUT" ? "justify-end" : "justify-start"}`}>
            <div className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm shadow-xs ${m.status === "FAILED" ? "border-2 border-red-400 bg-red-50" : m.direction === "OUT" ? "rounded-br-md border border-emerald-200 bg-emerald-50 text-stone-900" : "rounded-bl-md border border-stone-200 bg-white text-stone-900"}`}>
              <p className="whitespace-pre-wrap break-words leading-6">{m.body}</p>
              <p className="mt-1 flex flex-wrap gap-x-2 text-[11px] text-stone-500">
                <span className="font-semibold">{m.direction === "IN" ? thread.contact.name : m.sentBy}</span>
                <time dateTime={m.createdAt}>{time(m.createdAt)}</time>
              </p>
              <div className="mt-0.5 text-[11px] text-stone-600">
                <StatusLine m={m} web={web} retrying={pending === m.id} onRetry={() => run(m.id, () => retryMessageAction(m.id), { onOk: onChanged })} />
              </div>
            </div>
          </li>
        ))}
        <li ref={end} aria-hidden="true" />
      </ol>

      <Composer conversationId={thread.id} blocked={thread.blocked} windowOpen={web || !!thread.windowEndsAt} joinCode={thread.joinCode} onSent={onChanged} label={web ? "Reply in the customer's chat" : "Reply on WhatsApp"} />
    </div>
  );
}

export function Composer(props: { conversationId?: string; contactId?: string; blocked: string | null; windowOpen: boolean; joinCode?: string | null; onSent: () => void; label?: string }) {
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
      <p role="note" className="flex items-start gap-2 border-t border-stone-200 bg-stone-50 p-4 text-sm text-stone-800">
        <Icon name="ban" className="mt-0.5 h-4 w-4 text-stone-500" />{props.blocked}
      </p>
    );
  }
  return (
    <form className="space-y-2 border-t border-stone-200 p-4" onSubmit={(e) => { e.preventDefault(); submit(); }}>
      {!props.windowOpen && (
        <p className="flex items-start gap-1.5 text-xs text-amber-900">
          <Icon name="alert" className="mt-px h-3.5 w-3.5" />The customer has not written in the last 24 hours, so WhatsApp may refuse this message.
          {props.joinCode ? ` Sandbox: they must first send “${props.joinCode}” to the sandbox number.` : ""}
        </p>
      )}
      <label htmlFor={id} className={ui.labelSm}>{props.label ?? "Reply on WhatsApp"}</label>
      <textarea id={id} value={body} onChange={(e) => setBody(e.target.value)} rows={2} maxLength={1600}
        onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(); } }}
        placeholder="Type a message. Enter sends, Shift+Enter adds a line."
        className={`${ui.input} resize-y`} />
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs tabular-nums text-stone-500">{body.length}/1600</span>
        <button type="submit" disabled={sending || !body.trim()} className={ui.btnPrimary}>
          {sending ? <Spinner /> : <Icon name="send" className="h-4 w-4" />}{sending ? "Sending…" : "Send"}
        </button>
      </div>
    </form>
  );
}
