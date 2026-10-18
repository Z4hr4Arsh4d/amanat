// P1 owns. F2.8: history newest first, showing who and when.
import type { TimelineEntry } from "@/lib/crm/timeline";

const ICON: Record<string, string> = {
  note: "📝", stage_change: "➜", assignment: "👤", field_edit: "✎", message: "💬", payment: "💳",
  appointment: "📅", lead_created: "✚", escalation: "⚠", acknowledged: "✓", opt_out: "⊘",
};
const LABEL: Record<string, string> = {
  note: "Note", stage_change: "Stage", assignment: "Assigned", field_edit: "Edited", message: "Message", payment: "Payment",
  appointment: "Appointment", lead_created: "New lead", escalation: "Escalated", acknowledged: "Acknowledged", opt_out: "Opted out",
};

export function Timeline({ entries, tz }: { entries: TimelineEntry[]; tz: string }) {
  if (entries.length === 0) return <p className="text-sm text-stone-600">No history yet.</p>;
  const fmt = new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: tz });
  return (
    <ol className="space-y-3">
      {entries.map((e) => {
        const changes = e.type === "field_edit" ? ((e.data as { changes?: { field: string; from: string; to: string }[] })?.changes ?? []) : [];
        return (
          <li key={e.id} className="rounded-md border border-stone-200 bg-white p-3">
            <p className="text-xs text-stone-600">
              <span aria-hidden>{ICON[e.type] ?? "•"}</span> {LABEL[e.type] ?? e.type} · {e.who} · <time dateTime={e.at}>{fmt.format(new Date(e.at))}</time>
            </p>
            <p className="mt-1 whitespace-pre-wrap break-words text-sm">{e.summary}</p>
            {changes.length > 0 && (
              <ul className="mt-1 space-y-0.5 text-xs text-stone-700">
                {changes.map((c, i) => <li key={i} className="break-words">{c.field}: {c.from} → {c.to}</li>)}
              </ul>
            )}
          </li>
        );
      })}
    </ol>
  );
}
