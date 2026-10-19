"use client";
// P3 owns. Booking form (I3.3, I3.4, I3.5, I3.7) and appointment list with reschedule/cancel (I3.6).
import { useEffect, useId, useState } from "react";
import useSWR, { useSWRConfig } from "swr";
import { bookAppointmentAction, cancelAppointmentAction, rescheduleAppointmentAction } from "@/app/(app)/settings/calendar/actions";
import { Icon } from "@/components/ui/Icon";
import { EmptyState, Notice } from "@/components/ui/Kit";
import { ui } from "@/components/ui/styles";
import { Chip } from "./StatusChip";
import { Spinner } from "./Spinner";
import { useRun } from "./useRun";

const fetchJson = async <T,>(url: string): Promise<T> => {
  const r = await fetch(url);
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error ?? "Could not load. Refresh the page to try again.");
  return j as T;
};

type Employee = { id: string; name: string; timezone: string; offset: string; bookable: boolean; why: string | null };
type Slot = { ok: true; label: string; conflicts: string[]; canOverride: boolean; warning: string | null } | { ok: false; error: string };

const input = ui.input;
const MINUTES = [15, 30, 45, 60, 90, 120];

/** Today's date in a zone, as YYYY-MM-DD. */
function todayIn(tz: string) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

function useSlotCheck(params: Record<string, string> | null) {
  const [debounced, setDebounced] = useState(params);
  const key = params ? new URLSearchParams(params).toString() : "";
  useEffect(() => {
    const t = setTimeout(() => setDebounced(params), 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return useSWR<Slot>(debounced ? `/settings/calendar/data/slot?${new URLSearchParams(debounced)}` : null, fetchJson);
}

function SlotStatus({ slot, loading, override, setOverride }: { slot?: Slot; loading: boolean; override: boolean; setOverride: (v: boolean) => void }) {
  const id = useId();
  if (loading && !slot) return <p className="flex items-center gap-2 text-sm text-stone-600"><Spinner /> Checking the calendar…</p>;
  if (!slot) return null;
  if (!slot.ok) return <Notice tone="bad">{slot.error}</Notice>;
  return (
    <div className="space-y-2 text-sm" aria-live="polite">
      <p className="rounded-lg bg-stone-50 px-3 py-2"><span className="text-stone-600">Slot: </span><span className="font-semibold text-stone-900">{slot.label}</span></p>
      {slot.warning && <Notice tone="warn">{slot.warning}</Notice>}
      {slot.conflicts.length === 0 ? (
        <p className="flex items-center gap-1.5 font-semibold text-emerald-800"><Icon name="checkCircle" className="h-4 w-4" />Free at this time.</p>
      ) : (
        <Notice tone="warn">
          {slot.conflicts.map((c) => <p key={c}>{c}. Pick another time.</p>)}
          {slot.canOverride && (
            <label htmlFor={id} className="mt-2 flex items-center gap-2 font-semibold">
              <input id={id} type="checkbox" checked={override} onChange={(e) => setOverride(e.target.checked)} className={ui.check} />
              Book anyway (managers only)
            </label>
          )}
        </Notice>
      )}
    </div>
  );
}

export function BookAppointmentForm({ contactId, opportunityId }: { contactId: string; opportunityId?: string }) {
  const ids = { emp: useId(), date: useId(), time: useId(), len: useId(), note: useId() };
  const { data, error } = useSWR<{ items: Employee[] }>("/settings/calendar/data/employees", fetchJson);
  const [userId, setUserId] = useState("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("10:00");
  const [minutes, setMinutes] = useState("30");
  const [note, setNote] = useState("");
  const [override, setOverride] = useState(false);
  const { pending, run } = useRun();
  const { mutate } = useSWRConfig();
  const emp = data?.items.find((e) => e.id === userId);
  const day = date || (emp ? todayIn(emp.timezone) : "");
  const slot = useSlotCheck(emp?.bookable && day && time ? { userId, date: day, time, minutes } : null);
  useEffect(() => setOverride(false), [userId, day, time, minutes]);

  if (error && /permission/i.test((error as Error).message)) return <p className={ui.muted}>Booking appointments needs the “Book appointments” permission. Ask an admin if you need it.</p>;
  if (error) return <Notice tone="bad">{(error as Error).message}</Notice>;
  const s = slot.data;
  const blocked = !emp?.bookable || !s || !s.ok || (s.conflicts.length > 0 && !override) || slot.isValidating;

  return (
    <form className="space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        const r = await run("book", () => bookAppointmentAction({ contactId, opportunityId, userId, date: day, time, minutes, note, override }));
        if (r.ok) { setNote(""); mutate((k) => typeof k === "string" && k.startsWith("/settings/calendar/data/")); }
      }}>
      <div className={ui.field}>
        <label htmlFor={ids.emp} className={ui.label}>Employee</label>
        <select id={ids.emp} value={userId} onChange={(e) => { setUserId(e.target.value); setDate(""); }} className={input} aria-describedby={`${ids.emp}-h`}>
          <option value="">{data ? "Choose who meets the customer…" : "Loading…"}</option>
          {data?.items.map((u) => (
            <option key={u.id} value={u.id} disabled={!u.bookable}>{u.name}{u.why ? ` — ${u.why}` : ""}</option>
          ))}
        </select>
        <p id={`${ids.emp}-h`} className={ui.hint}>Employees without a connected calendar cannot be booked; they can connect it on My calendar.</p>
      </div>
      {emp && (
        <>
          <p className="flex items-center gap-1.5 text-xs font-semibold text-stone-600"><Icon name="globe" className="h-3.5 w-3.5" />Times in {emp.timezone} ({emp.offset}), {emp.name}&apos;s time zone</p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className={ui.field}>
              <label htmlFor={ids.date} className={ui.label}>Date</label>
              <input id={ids.date} type="date" value={day} onChange={(e) => setDate(e.target.value)} className={input} />
            </div>
            <div className={ui.field}>
              <label htmlFor={ids.time} className={ui.label}>Start time</label>
              <input id={ids.time} type="time" step={900} value={time} onChange={(e) => setTime(e.target.value)} className={input} />
            </div>
            <div className={ui.field}>
              <label htmlFor={ids.len} className={ui.label}>Length</label>
              <select id={ids.len} value={minutes} onChange={(e) => setMinutes(e.target.value)} className={input}>
                {MINUTES.map((m) => <option key={m} value={m}>{m < 60 ? `${m} min` : `${m / 60} h${m % 60 ? " 30" : ""}`}</option>)}
              </select>
            </div>
          </div>
          <div className={ui.field}>
            <label htmlFor={ids.note} className={ui.label}>Note for the calendar event <span className="font-normal text-stone-500">(optional)</span></label>
            <input id={ids.note} value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Site visit, bring roof measurements" className={input} />
          </div>
          <SlotStatus slot={s} loading={slot.isLoading} override={override} setOverride={setOverride} />
        </>
      )}
      <button type="submit" disabled={!!pending || blocked} className={ui.btnPrimary}>
        {pending ? <Spinner /> : <Icon name="calendar" className="h-4 w-4" />}{pending ? "Booking…" : "Book appointment"}
      </button>
    </form>
  );
}

type Appt = {
  id: string; title: string; status: "BOOKED" | "RESCHEDULED" | "CANCELLED"; contact: string; employee: string; bookedBy: string;
  timezone: string; startUtc: string; endUtc: string; minutes: number; viewerLabel: string; employeeLabel: string | null; upcoming: boolean; demo: boolean; googleLink: string | null;
};
type ApptList = { items: Appt[]; canChange: boolean; canOverride: boolean; viewerTimezone: string };

function zoned(iso: string, tz: string) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).formatToParts(new Date(iso));
  const g = (t: string) => parts.find((p) => p.type === t)?.value ?? "00";
  return { date: `${g("year")}-${g("month")}-${g("day")}`, time: `${g("hour")}:${g("minute")}` };
}

function Reschedule({ a, canOverride, onDone }: { a: Appt; canOverride: boolean; onDone: () => void }) {
  const start = zoned(a.startUtc, a.timezone);
  const ids = { date: useId(), time: useId(), len: useId(), ov: useId() };
  const [date, setDate] = useState(start.date);
  const [time, setTime] = useState(start.time);
  const [minutes, setMinutes] = useState(String(MINUTES.includes(a.minutes) ? a.minutes : 30));
  const [override, setOverride] = useState(false);
  const { pending, run } = useRun();
  return (
    <form className="mt-3 space-y-3 rounded-lg border border-stone-200 bg-stone-50 p-3"
      onSubmit={async (e) => { e.preventDefault(); const r = await run("r", () => rescheduleAppointmentAction({ appointmentId: a.id, date, time, minutes, override })); if (r.ok) onDone(); }}>
      <p className="text-xs font-semibold text-stone-700">New time in {a.timezone} ({a.employee}&apos;s time zone)</p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className={ui.field}><label htmlFor={ids.date} className={ui.labelSm}>Date</label><input id={ids.date} type="date" value={date} onChange={(e) => setDate(e.target.value)} className={input} /></div>
        <div className={ui.field}><label htmlFor={ids.time} className={ui.labelSm}>Start time</label><input id={ids.time} type="time" step={900} value={time} onChange={(e) => setTime(e.target.value)} className={input} /></div>
        <div className={ui.field}><label htmlFor={ids.len} className={ui.labelSm}>Length</label>
          <select id={ids.len} value={minutes} onChange={(e) => setMinutes(e.target.value)} className={input}>{MINUTES.map((m) => <option key={m} value={m}>{m} min</option>)}</select></div>
      </div>
      {canOverride && (
        <label htmlFor={ids.ov} className="flex items-center gap-2 text-xs font-medium text-stone-700"><input id={ids.ov} type="checkbox" checked={override} onChange={(e) => setOverride(e.target.checked)} className={ui.check} />Move even if the employee is busy (managers only)</label>
      )}
      <button type="submit" disabled={!!pending} className={ui.btnPrimarySm}>
        {pending && <Spinner />}Save new time
      </button>
    </form>
  );
}

export function AppointmentList({ query, emptyText }: { query: Record<string, string>; emptyText?: string }) {
  const { data, error, mutate } = useSWR<ApptList>(`/settings/calendar/data/appointments?${new URLSearchParams(query)}`, fetchJson, { refreshInterval: 3000 });
  const [editing, setEditing] = useState<string | null>(null);
  const { pending, run } = useRun();
  if (error) return <Notice tone="bad">{(error as Error).message}</Notice>;
  if (!data) return <p className="flex items-center gap-2 text-sm text-stone-600"><Spinner /> Loading appointments…</p>;
  if (data.items.length === 0) return <EmptyState compact icon="calendar" title={emptyText ?? "No appointments yet."} />;
  return (
    <ul className="divide-y divide-stone-100">
      {data.items.map((a) => (
        <li key={a.id} className={`py-3.5 text-sm first:pt-1 last:pb-1 ${a.status === "CANCELLED" ? "opacity-75" : ""}`}>
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0 space-y-0.5">
              <p className={`font-bold text-stone-900 ${a.status === "CANCELLED" ? "line-through" : ""}`}>{a.viewerLabel}</p>
              {a.employeeLabel && <p className="text-xs text-stone-600">{a.employeeLabel}</p>}
              <p className="text-stone-600">{a.contact} · with {a.employee} · booked by {a.bookedBy}{a.demo ? " · demo calendar" : ""}</p>
              {a.googleLink && a.status !== "CANCELLED" && <a href={a.googleLink} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-800 hover:underline">Open in Google Calendar<Icon name="external" className="h-3 w-3" /></a>}
            </div>
            {a.status === "CANCELLED" ? <Chip tone="off">Cancelled</Chip> : !a.upcoming ? <Chip tone="info">Past</Chip> : a.status === "RESCHEDULED" ? <Chip tone="warn">Rescheduled</Chip> : <Chip tone="ok">Booked</Chip>}
          </div>
          {data.canChange && a.upcoming && (
            <div className="mt-2.5 flex flex-wrap gap-2">
              <button type="button" onClick={() => setEditing(editing === a.id ? null : a.id)} aria-expanded={editing === a.id} className={ui.btnSm}>
                <Icon name={editing === a.id ? "x" : "clock"} className="h-3.5 w-3.5" />{editing === a.id ? "Close" : "Reschedule"}
              </button>
              <button type="button" disabled={!!pending}
                onClick={() => { if (confirm("Cancel this appointment? It will be removed from the employee's calendar.")) run(a.id, () => cancelAppointmentAction(a.id), { onOk: () => mutate() }); }}
                className={ui.btnDangerSm}>
                {pending === a.id ? <Spinner /> : <Icon name="xCircle" className="h-3.5 w-3.5" />}Cancel appointment
              </button>
            </div>
          )}
          {editing === a.id && <Reschedule a={a} canOverride={data.canOverride} onDone={() => { setEditing(null); mutate(); }} />}
        </li>
      ))}
    </ul>
  );
}
