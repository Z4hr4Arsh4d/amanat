"use client";
// P3 owns. "Check my calendar": tests each step against Google and explains what to fix; can add a test event.
import { useState } from "react";
import { useRun } from "@/lib/integrations/ui/useRun";
import { Spinner } from "@/lib/integrations/ui/Spinner";
import { addTestEventAction, checkCalendarAction } from "./actions";

type Check = { steps: { label: string; ok: boolean; detail: string }[]; events: { title: string; start: string; end: string; link: string | null; allDay: boolean }[]; account: string | null };
type Test = { start: string; end: string; link: string | null; demo: boolean };

const btn = "inline-flex items-center gap-2 rounded border border-stone-300 bg-white px-3 py-2 text-sm font-medium hover:bg-stone-100 focus:outline-none focus:ring-2 focus:ring-emerald-700 disabled:opacity-60";
const fmt = (iso: string, allDay: boolean) =>
  new Date(iso).toLocaleString([], allDay ? { weekday: "short", day: "numeric", month: "short" } : { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZoneName: "short" });

export function CalendarCheck({ connected }: { connected: boolean }) {
  const { pending, run } = useRun();
  const [result, setResult] = useState<Check | null>(null);
  const [test, setTest] = useState<Test | null>(null);
  if (!connected) return null;
  return (
    <section aria-labelledby="chk" className="space-y-3 rounded-lg border border-stone-200 bg-white p-4">
      <div>
        <h2 id="chk" className="font-semibold">Check my calendar</h2>
        <p className="text-sm text-stone-600">Tests the connection with Google right now and shows your next events, so you can see it is working.</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <button type="button" disabled={!!pending} className={btn} onClick={() => run("check", checkCalendarAction, { onOk: (r) => r.ok && r.data && setResult(r.data) })}>
          {pending === "check" && <Spinner />}Check now
        </button>
        <button type="button" disabled={!!pending} className={btn} onClick={() => run("test", addTestEventAction, { onOk: (r) => r.ok && r.data && setTest(r.data) })}>
          {pending === "test" && <Spinner />}Add a test event
        </button>
      </div>

      {test && (
        <p role="status" className="rounded border border-emerald-300 bg-emerald-50 p-2 text-sm text-emerald-900">
          <span aria-hidden="true">✓ </span>Test event added for {fmt(test.start, false)}.{" "}
          {test.link ? <a href={test.link} target="_blank" rel="noreferrer" className="underline">Open it in Google Calendar</a> : test.demo ? "Demo calendars have no Google page to open." : "Look for “Amanat test event” in Google Calendar."}
        </p>
      )}

      {result && (
        <div className="space-y-3" aria-live="polite">
          <ul className="space-y-1">
            {result.steps.map((s) => (
              <li key={s.label} className={`rounded border p-2 text-sm ${s.ok ? "border-emerald-200 bg-emerald-50 text-emerald-950" : "border-red-300 bg-red-50 text-red-950"}`}>
                <span aria-hidden="true">{s.ok ? "✓ " : "⚠ "}</span><strong>{s.label}:</strong> {s.detail}
              </li>
            ))}
          </ul>
          {result.events.length > 0 && (
            <div>
              <h3 className="text-sm font-medium">Your next events{result.account ? ` (${result.account})` : ""}</h3>
              <ul className="mt-1 space-y-1">
                {result.events.map((e, i) => (
                  <li key={i} className="rounded border border-stone-200 p-2 text-sm">
                    <span className="font-medium">{e.title}</span>
                    <span className="block text-xs text-stone-600">{fmt(e.start, e.allDay)}{e.allDay ? " (all day)" : ""}</span>
                    {e.link && <a href={e.link} target="_blank" rel="noreferrer" className="text-xs text-emerald-800 underline">Open in Google Calendar</a>}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
