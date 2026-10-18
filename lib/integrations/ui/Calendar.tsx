"use client";
// P3 owns. Booking form (I3.3, I3.4, I3.5, I3.7) and appointment list with reschedule/cancel (I3.6).
import { useEffect, useId, useState } from "react";
import useSWR, { useSWRConfig } from "swr";
import { bookAppointmentAction, cancelAppointmentAction, rescheduleAppointmentAction } from "@/app/(app)/settings/calendar/actions";
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

const input = "w-full rounded border border-stone-300 bg-white px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-700";
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
  if (loading && !slot) return <p className="text-sm text-stone-600"><Spinner /> Checking the calendar…</p>;
  if (!slot) return null;
  if (!slot.ok) return <p role="alert" className="rounded border border-red-300 bg-red-50 p-2 text-sm text-red-900"><span aria-hidden="true">⚠ </span>{slot.error}</p>;
  return (
    <div className="space-y-1 text-sm" aria-live="polite">
      <p><span className="text-stone-600">Slot: </span>{slot.label}</p>
      {slot.warning && <p className="text-amber-900"><span aria-hidden="true">⚠ </span>{slot.warning}</p>}
      {slot.conflicts.length === 0 ? (
        <p className="text-emerald-900"><span aria-hidden="true">✓ </span>Free at this time.</p>
      ) : (
        <div className="space-y-1 rounded border border-amber-300 bg-amber-50 p-2 text-amber-900">
          {slot.conflicts.map((c) => <p key={c}><span aria-hidden="true">⚠ </span>{c}. Pick another time.</p>)}
          {slot.canOverride && (
            <label htmlFor={id} className="flex items-center gap-2">
              <input id={id} type="checkbox" checked={override} onChange={(e) => setOverride(e.target.checked)} className="h-4 w-4" />
              Book anyway (managers only)
            </label>
          )}
        </div>
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

  if (error && /permission/i.test((error as Error).message)) return <p className="text-sm text-stone-600">Booking appointments needs the “Book appointments” permission. Ask an admin if you need it.</p>;
  if (error) return <p role="alert" className="text-sm text-red-900"><span aria-hidden="true">⚠ </span>{(error as Error).message}</p>;
  const s = slot.data;
  const blocked = !emp?.bookable || !s || !s.ok || (s.conflicts.length > 0 && !override) || slot.isValidating;

  return (
    <form className="space-y-3 rounded-lg border border-stone-200 bg-white p-3"
      onSubmit={async (e) => {
        e.preventDefault();
        const r = await run("book", () => bookAppointmentAction({ contactId, opportunityId, userId, date: day, time, minutes, note, override }));
        if (r.ok) { setNote(""); mutate((k) => typeof k === "string" && k.startsWith("/settings/calendar/data/")); }
      }}>
      <div className="space-y-1">
        <label htmlFor={ids.emp} className="block text-sm font-medium">Employee</label>
        <select id={ids.emp} value={userId} onChange={(e) => { setUserId(e.target.value); setDate(""); }} className={input} aria-describedby={`${ids.emp}-h`}>
          <option value="">{data ? "Choose who meets the customer…" : "Loading…"}</option>
          {data?.items.map((u) => (
            <option key={u.id} value={u.id} disabled={!u.bookable}>{u.name}{u.why ? ` — ${u.why}` : ""}</option>
          ))}
        </select>
        <p id={`${ids.emp}-h`} className="text-xs text-stone-600">Employees without a connected calendar cannot be booked; they can connect it on My calendar.</p>
      </div>
      {emp && (
        <>
          <p className="text-sm font-medium">Times in {emp.timezone} ({emp.offset}), {emp.name}&apos;s time zone</p>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <div className="space-y-1">
              <label htmlFor={ids.date} className="block text-sm font-medium">Date</label>
              <input id={ids.date} type="date" value={day} onChange={(e) => setDate(e.target.value)} className={input} />
            </div>
            <div className="space-y-1">
              <label htmlFor={ids.time} className="block text-sm font-medium">Start time</label>
              <input id={ids.time} type="time" step={900} value={time} onChange={(e) => setTime(e.target.value)} className={input} />
            </div>
            <div className="space-y-1">
              <label htmlFor={ids.len} className="block text-sm font-medium">Length</label>
              <select id={ids.len} value={minutes} onChange={(e) => setMinutes(e.target.value)} className={input}>
                {MINUTES.map((m) => <option key={m} value={m}>{m < 60 ? `${m} min` : `${m / 60} h${m % 60 ? " 30" : ""}`}</option>)}
              </select>
            </div>
          </div>
          <div className="space-y-1">
            <label htmlFor={ids.note} className="block text-sm font-medium">Note for the calendar event (optional)</label>
            <input id={ids.note} value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Site visit, bring roof measurements" className={input} />
          </div>
          <SlotStatus slot={s} loading={slot.isLoading} override={override} setOverride={setOverride} />
        </>
      )}
      <button type="submit" disabled={!!pending || blocked}
        className="inline-flex items-center gap-2 rounded bg-emerald-800 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-900 focus:outline-none focus:ring-2 focus:ring-emerald-700 disabled:opacity-60">
        {pending && <Spinner />}{pending ? "Booking…" : "Book appointment"}
      </button>
    </form>
  );
}

type Appt = {
  id: string; title: string; status: "BOOKED" | "RESCHEDULED" | "CANCELLED"; contact: string; employee: string; bookedBy: string;
  timezone: string; startUtc: string; endUtc: string; minutes: number; viewerLabel: string; employeeLabel: string | null; upcoming: boolean; demo: boolean;
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
    <form className="mt-2 space-y-2 rounded border border-stone-200 bg-stone-50 p-2"
      onSubmit={async (e) => { e.preventDefault(); const r = await run("r", () => rescheduleAppointmentAction({ appointmentId: a.id, date, time, minutes, override })); if (r.ok) onDone(); }}>
      <p className="text-xs font-medium">New time in {a.timezone} ({a.employee}&apos;s time zone)</p>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <div><label htmlFor={ids.date} className="block text-xs font-medium">Date</label><input id={ids.date} type="date" value={date} onChange={(e) => setDate(e.target.value)} className={input} /></div>
        <div><label htmlFor={ids.time} className="block text-xs font-medium">Start time</label><input id={ids.time} type="time" step={900} value={time} onChange={(e) => setTime(e.target.value)} className={input} /></div>
        <div><label htmlFor={ids.len} className="block text-xs font-medium">Length</label>
          <select id={ids.len} value={minutes} onChange={(e) => setMinutes(e.target.value)} className={input}>{MINUTES.map((m) => <option key={m} value={m}>{m} min</option>)}</select></div>
      </div>
      {canOverride && (
        <label htmlFor={ids.ov} className="flex items-center gap-2 text-xs"><input id={ids.ov} type="checkbox" checked={override} onChange={(e) => setOverride(e.target.checked)} className="h-4 w-4" />Move even if the employee is busy (managers only)</label>
      )}
      <button type="submit" disabled={!!pending} className="inline-flex items-center gap-1 rounded bg-emerald-800 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-900 focus:outline-none focus:ring-2 focus:ring-emerald-700 disabled:opacity-60">
        {pending && <Spinner />}Save new time
      </button>
    </form>
  );
}

export function AppointmentList({ query, emptyText }: { query: Record<string, string>; emptyText?: string }) {
  const { data, error, mutate } = useSWR<ApptList>(`/settings/calendar/data/appointments?${new URLSearchParams(query)}`, fetchJson, { refreshInterval: 3000 });
  const [editing, setEditing] = useState<string | null>(null);
  const { pending, run } = useRun();
  if (error) return <p role="alert" className="rounded border border-red-300 bg-red-50 p-3 text-sm text-red-900"><span aria-hidden="true">⚠ </span>{(error as Error).message}</p>;
  if (!data) return <p className="text-sm text-stone-600"><Spinner /> Loading appointments…</p>;
  return (
    <ul className="space-y-2">
      {data.items.map((a) => (
        <li key={a.id} className={`rounded-lg border bg-white p-3 text-sm ${a.status === "CANCELLED" ? "border-stone-200 opacity-80" : "border-stone-200"}`}>
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <p className={`font-medium ${a.status === "CANCELLED" ? "line-through" : ""}`}>{a.viewerLabel}</p>
              {a.employeeLabel && <p className="text-xs text-stone-700">{a.employeeLabel}</p>}
              <p className="text-stone-700">With {a.employee} · booked by {a.bookedBy}{a.demo ? " · demo calendar" : ""}</p>
            </div>
            {a.status === "CANCELLED" ? <Chip tone="off">Cancelled</Chip> : !a.upcoming ? <Chip tone="info">Past</Chip> : a.status === "RESCHEDULED" ? <Chip tone="warn">Rescheduled</Chip> : <Chip tone="ok">Booked</Chip>}
          </div>
          {data.canChange && a.upcoming && (
            <div className="mt-2 flex flex-wrap gap-2">
              <button type="button" onClick={() => setEditing(editing === a.id ? null : a.id)} aria-expanded={editing === a.id}
                className="rounded border border-stone-300 bg-white px-2 py-1 text-xs font-medium hover:bg-stone-100 focus:outline-none focus:ring-2 focus:ring-emerald-700">
                {editing === a.id ? "Close" : "Reschedule"}
              </button>
              <button type="button" disabled={!!pending}
                onClick={() => { if (confirm("Cancel this appointment? It will be removed from the employee's calendar.")) run(a.id, () => cancelAppointmentAction(a.id), { onOk: () => mutate() }); }}
                className="inline-flex items-center gap-1 rounded border border-red-300 bg-white px-2 py-1 text-xs font-medium text-red-800 hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-red-700 disabled:opacity-60">
                {pending === a.id && <Spinner />}Cancel appointment
              </button>
            </div>
          )}
          {editing === a.id && <Reschedule a={a} canOverride={data.canOverride} onDone={() => { setEditing(null); mutate(); }} />}
        </li>
      ))}
      {data.items.length === 0 && <li className="rounded border border-dashed border-stone-300 p-4 text-center text-sm text-stone-600">{emptyText ?? "No appointments yet."}</li>}
    </ul>
  );
}
