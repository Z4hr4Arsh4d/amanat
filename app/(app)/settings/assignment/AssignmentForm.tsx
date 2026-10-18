"use client";
// P2 owns. Assignment settings form (PLAN.md §3.3).
import { useState } from "react";
import { useAction } from "@/components/ui/useAction";
import { ui } from "@/components/ui/styles";
import { saveAssignmentSettings, type AssignmentSettings } from "./actions";

const LEVEL_LABEL = { NEXT_ELIGIBLE: "Next available person", BACKUP: "Backup person", MANAGER: "Manager" } as const;

export function AssignmentForm({ initial, users }: { initial: AssignmentSettings; users: { id: string; name: string }[] }) {
  const { pending, run } = useAction();
  const [s, setS] = useState(initial);
  const set = <K extends keyof AssignmentSettings>(k: K, v: AssignmentSettings[K]) => setS((p) => ({ ...p, [k]: v }));
  const num = (v: string) => (v === "" ? NaN : Number(v));

  const setLevel = (i: number, patch: Partial<AssignmentSettings["levels"][number]>) =>
    set("levels", s.levels.map((l, j) => (j === i ? { ...l, ...patch } : l)));

  return (
    <form
      className="max-w-2xl space-y-5"
      onSubmit={(e) => {
        e.preventDefault();
        run(() => saveAssignmentSettings(s), { success: "Assignment settings saved." });
      }}
    >
      <h1 className={ui.h1}>Assignment</h1>
      <p className={ui.muted}>Choose how new leads are handed out and what happens when nobody replies. All times are in seconds.</p>

      <section className={`${ui.card} grid gap-4 sm:grid-cols-3`}>
        <div>
          <label htmlFor="max" className={ui.label}>Max open leads per person</label>
          <input id="max" type="number" min={1} className={ui.input} value={Number.isNaN(s.maxOpenLeads) ? "" : s.maxOpenLeads} onChange={(e) => set("maxOpenLeads", num(e.target.value))} />
        </div>
        <div>
          <label htmlFor="ack" className={ui.label}>Acknowledge window (seconds)</label>
          <input id="ack" type="number" min={5} className={ui.input} value={Number.isNaN(s.ackWindowSeconds) ? "" : s.ackWindowSeconds} onChange={(e) => set("ackWindowSeconds", num(e.target.value))} />
        </div>
        <div>
          <label htmlFor="idle" className={ui.label}>Idle period (seconds)</label>
          <input id="idle" type="number" min={5} className={ui.input} value={Number.isNaN(s.idleSeconds) ? "" : s.idleSeconds} onChange={(e) => set("idleSeconds", num(e.target.value))} />
        </div>
      </section>

      <section className={`${ui.card} space-y-3`}>
        <h2 className="font-semibold text-stone-900">If nobody acknowledges in time</h2>
        <p className={ui.muted}>The lead moves down this list. Each level gets its own number of seconds.</p>
        <ol className="space-y-3">
          {s.levels.map((l, i) => (
            <li key={i} className="flex flex-wrap items-end gap-3">
              <span className="w-16 pb-2 text-sm font-medium text-stone-800">Level {i + 1}</span>
              <div className="min-w-40 flex-1">
                <label htmlFor={`lt-${i}`} className={ui.label}>Who gets it</label>
                <select id={`lt-${i}`} className={ui.input} value={l.type} onChange={(e) => setLevel(i, { type: e.target.value as typeof l.type })}>
                  {Object.entries(LEVEL_LABEL).map(([v, label]) => <option key={v} value={v}>{label}</option>)}
                </select>
              </div>
              <div className="w-32">
                <label htmlFor={`ls-${i}`} className={ui.label}>Seconds</label>
                <input id={`ls-${i}`} type="number" min={5} className={ui.input} value={Number.isNaN(l.seconds) ? "" : l.seconds} onChange={(e) => setLevel(i, { seconds: num(e.target.value) })} />
              </div>
              <button type="button" className={ui.btnDanger} disabled={s.levels.length <= 1} onClick={() => set("levels", s.levels.filter((_, j) => j !== i))} aria-label={`Remove level ${i + 1}`}>
                Remove
              </button>
            </li>
          ))}
        </ol>
        <button type="button" className={ui.btn} disabled={s.levels.length >= 10} onClick={() => set("levels", [...s.levels, { type: "NEXT_ELIGIBLE", seconds: 60 }])}>
          Add level
        </button>
      </section>

      <section className={`${ui.card} grid gap-4 sm:grid-cols-2`}>
        <div>
          <label htmlFor="backup" className={ui.label}>Backup person</label>
          <select id="backup" className={ui.input} value={s.backupUserId ?? ""} onChange={(e) => set("backupUserId", e.target.value || null)}>
            <option value="">None</option>
            {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="manager" className={ui.label}>Manager</label>
          <select id="manager" className={ui.input} value={s.managerUserId ?? ""} onChange={(e) => set("managerUserId", e.target.value || null)}>
            <option value="">None</option>
            {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
        </div>
      </section>

      <section className={`${ui.card} space-y-3`}>
        <label className="flex items-start gap-3 text-sm text-stone-800">
          <input type="checkbox" className="mt-1 h-4 w-4" checked={s.useCalendarBusy} onChange={(e) => set("useCalendarBusy", e.target.checked)} />
          <span><span className="font-medium">Treat Google Calendar meetings as Busy.</span> People in a meeting are skipped when handing out leads.</span>
        </label>
        <label className="flex items-start gap-3 text-sm text-stone-800">
          <input type="checkbox" className="mt-1 h-4 w-4" checked={s.autoReplyCustomer} onChange={(e) => set("autoReplyCustomer", e.target.checked)} />
          <span><span className="font-medium">Auto-reply to the customer.</span> Tell new WhatsApp customers who will reply and how soon.</span>
        </label>
      </section>

      <button type="submit" disabled={pending} className={ui.btnPrimary}>{pending ? "Saving…" : "Save settings"}</button>
    </form>
  );
}
