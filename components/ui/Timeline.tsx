// P1 owns. F2.8: history newest first, showing who and when.
import type { TimelineEntry } from "@/lib/crm/timeline";
import { Icon, type IconName } from "./Icon";

const ICON: Record<string, IconName> = {
  note: "pen", stage_change: "arrowRight", assignment: "user", field_edit: "pencil", message: "inbox", payment: "card",
  appointment: "calendar", lead_created: "plus", escalation: "alert", acknowledged: "check", opt_out: "ban",
};
const LABEL: Record<string, string> = {
  note: "Note", stage_change: "Stage", assignment: "Assigned", field_edit: "Edited", message: "Message", payment: "Payment",
  appointment: "Appointment", lead_created: "New lead", escalation: "Escalated", acknowledged: "Acknowledged", opt_out: "Opted out",
};
const TONE: Record<string, string> = {
  escalation: "bg-amber-50 text-amber-700 ring-amber-200", opt_out: "bg-red-50 text-red-700 ring-red-200",
  payment: "bg-emerald-50 text-emerald-700 ring-emerald-200", acknowledged: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  note: "bg-sky-50 text-sky-700 ring-sky-200",
};

export function Timeline({ entries, tz }: { entries: TimelineEntry[]; tz: string }) {
  if (entries.length === 0) return <p className="text-sm text-stone-600">No history yet.</p>;
  const fmt = new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: tz });
  return (
    <ol className="relative space-y-5 before:absolute before:bottom-2 before:left-[15px] before:top-2 before:w-px before:bg-stone-200">
      {entries.map((e) => {
        const changes = e.type === "field_edit" ? ((e.data as { changes?: { field: string; from: string; to: string }[] })?.changes ?? []) : [];
        return (
          <li key={e.id} className="relative flex gap-3">
            <span className={`relative z-10 grid h-8 w-8 shrink-0 place-items-center rounded-full ring-1 ${TONE[e.type] ?? "bg-white text-stone-500 ring-stone-200"}`}>
              <Icon name={ICON[e.type] ?? "dot"} className="h-3.5 w-3.5" />
            </span>
            <div className="min-w-0 flex-1 pt-0.5">
              <p className="flex flex-wrap items-baseline gap-x-2 text-xs text-stone-500">
                <span className="font-bold text-stone-800">{LABEL[e.type] ?? e.type}</span>
                <span>{e.who}</span>
                <span aria-hidden="true">·</span>
                <time dateTime={e.at}>{fmt.format(new Date(e.at))}</time>
              </p>
              <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-6 text-stone-800">{e.summary}</p>
              {changes.length > 0 && (
                <ul className="mt-2 space-y-1 rounded-lg bg-stone-50 px-3 py-2 text-xs text-stone-700">
                  {changes.map((c, i) => (
                    <li key={i} className="break-words">
                      <span className="font-semibold">{c.field}:</span> <span className="text-stone-500 line-through decoration-stone-300">{c.from}</span> <span aria-hidden="true">→</span><span className="sr-only">changed to</span> {c.to}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
