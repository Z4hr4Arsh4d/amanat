"use client";
// P3 owns. "Check my calendar": tests each step against Google and explains what to fix; can add a test event.
import { useState } from "react";
import { useRun } from "@/lib/integrations/ui/useRun";
import { Spinner } from "@/lib/integrations/ui/Spinner";
import { Icon } from "@/components/ui/Icon";
import { Notice, Panel } from "@/components/ui/Kit";
import { ui } from "@/components/ui/styles";
import { addTestEventAction, checkCalendarAction } from "./actions";

type Check = { steps: { label: string; ok: boolean; detail: string }[]; events: { title: string; start: string; end: string; link: string | null; allDay: boolean }[]; account: string | null };
type Test = { start: string; end: string; link: string | null; demo: boolean };

const btn = ui.btn;
const fmt = (iso: string, allDay: boolean) =>
  new Date(iso).toLocaleString([], allDay ? { weekday: "short", day: "numeric", month: "short" } : { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZoneName: "short" });

export function CalendarCheck({ connected }: { connected: boolean }) {
  const { pending, run } = useRun();
  const [result, setResult] = useState<Check | null>(null);
  const [test, setTest] = useState<Test | null>(null);
  if (!connected) return null;
  return (
    <Panel id="chk" title="Check my calendar" description="Tests the connection with Google right now and shows your next events, so you can see it is working.">
      <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <button type="button" disabled={!!pending} className={btn} onClick={() => run("check", checkCalendarAction, { onOk: (r) => r.ok && r.data && setResult(r.data) })}>
          {pending === "check" ? <Spinner /> : <Icon name="refresh" className="h-4 w-4" />}Check now
        </button>
        <button type="button" disabled={!!pending} className={btn} onClick={() => run("test", addTestEventAction, { onOk: (r) => r.ok && r.data && setTest(r.data) })}>
          {pending === "test" ? <Spinner /> : <Icon name="plus" className="h-4 w-4" />}Add a test event
        </button>
      </div>

      {test && (
        <Notice tone="ok" role="status">
          Test event added for {fmt(test.start, false)}.{" "}
          {test.link ? <a href={test.link} target="_blank" rel="noreferrer" className="font-semibold underline">Open it in Google Calendar</a> : test.demo ? "Demo calendars have no Google page to open." : "Look for “Amanat test event” in Google Calendar."}
        </Notice>
      )}

      {result && (
        <div className="space-y-3" aria-live="polite">
          <ul className="space-y-1">
            {result.steps.map((s) => (
              <li key={s.label} className={`flex items-start gap-2 rounded-lg px-3 py-2 text-sm ${s.ok ? "bg-emerald-50 text-emerald-950" : "bg-red-50 text-red-950"}`}>
                <Icon name={s.ok ? "checkCircle" : "alertCircle"} className={`mt-0.5 h-4 w-4 ${s.ok ? "text-emerald-700" : "text-red-700"}`} />
                <span><strong>{s.label}:</strong> {s.detail}</span>
              </li>
            ))}
          </ul>
          {result.events.length > 0 && (
            <div>
              <h3 className={ui.h3}>Your next events{result.account ? ` (${result.account})` : ""}</h3>
              <ul className="mt-1 space-y-1">
                {result.events.map((e, i) => (
                  <li key={i} className="rounded-lg border border-stone-200 px-3 py-2 text-sm">
                    <span className="font-semibold">{e.title}</span>
                    <span className="block text-xs text-stone-600">{fmt(e.start, e.allDay)}{e.allDay ? " (all day)" : ""}</span>
                    {e.link && <a href={e.link} target="_blank" rel="noreferrer" className="text-xs font-semibold text-emerald-800 hover:underline">Open in Google Calendar</a>}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
      </div>
    </Panel>
  );
}
