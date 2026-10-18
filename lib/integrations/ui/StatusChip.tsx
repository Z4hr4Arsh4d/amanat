// P3 owns. Status chips always carry text + an icon, never color alone (Q8).
const STYLES = {
  ok: "border-emerald-300 bg-emerald-50 text-emerald-900",
  warn: "border-amber-300 bg-amber-50 text-amber-900",
  bad: "border-red-300 bg-red-50 text-red-900",
  off: "border-stone-300 bg-stone-100 text-stone-700",
  info: "border-sky-300 bg-sky-50 text-sky-900",
} as const;
const ICONS = { ok: "✓", warn: "⏳", bad: "⚠", off: "○", info: "•" } as const;

export type Tone = keyof typeof STYLES;

export function Chip({ tone, children, title }: { tone: Tone; children: React.ReactNode; title?: string }) {
  return (
    <span title={title} className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2 py-0.5 text-xs font-medium ${STYLES[tone]}`}>
      <span aria-hidden="true">{ICONS[tone]}</span>
      {children}
    </span>
  );
}

export function IntegrationStatusChip({ status }: { status: "NOT_CONNECTED" | "CONNECTED" | "ERROR" }) {
  if (status === "CONNECTED") return <Chip tone="ok">Connected</Chip>;
  if (status === "ERROR") return <Chip tone="bad">Error</Chip>;
  return <Chip tone="off">Not connected</Chip>;
}

const EVENT_TONES: Record<string, Tone> = {
  RECEIVED: "info", PROCESSED: "ok", SENT: "ok", REJECTED: "bad", FAILED: "bad", RETRYING: "warn",
};
const EVENT_LABELS: Record<string, string> = {
  RECEIVED: "Received", PROCESSED: "Processed", SENT: "Sent", REJECTED: "Rejected", FAILED: "Failed", RETRYING: "Retrying",
};
export function EventStatusChip({ status }: { status: string }) {
  return <Chip tone={EVENT_TONES[status] ?? "off"}>{EVENT_LABELS[status] ?? status}</Chip>;
}
