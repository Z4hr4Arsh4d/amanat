// P3 owns. Status chips always carry text + an icon, never color alone (Q8). Drawn with the shared Badge.
import { Badge, type Tone as BadgeTone } from "@/components/ui/Kit";
import type { IconName } from "@/components/ui/Icon";

const TONES = { ok: "ok", warn: "warn", bad: "bad", off: "neutral", info: "info" } as const satisfies Record<string, BadgeTone>;
const ICONS: Record<keyof typeof TONES, IconName> = { ok: "check", warn: "clock", bad: "alert", off: "circle", info: "dot" };

export type Tone = keyof typeof TONES;

export function Chip({ tone, children, title }: { tone: Tone; children: React.ReactNode; title?: string }) {
  return <Badge tone={TONES[tone]} icon={ICONS[tone]} title={title}>{children}</Badge>;
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
