// P2 owns. Source and status labels for leads, shared by the leads list, the recovery queue and the contact page.
// Always text + icon, never colour alone (Q8).
import { Badge, type Tone } from "@/components/ui/Kit";
import type { IconName } from "@/components/ui/Icon";

const SOURCE: Record<string, { label: string; icon: IconName }> = {
  WEB_FORM: { label: "Web form", icon: "globe" },
  WHATSAPP: { label: "WhatsApp", icon: "whatsapp" },
  MANUAL: { label: "Manual", icon: "pen" },
};

const STATUS: Record<string, { label: string; icon: IconName; tone: Tone }> = {
  NEW: { label: "New", icon: "dot", tone: "info" },
  ASSIGNED: { label: "Waiting for reply", icon: "clock", tone: "warn" },
  ACKNOWLEDGED: { label: "Acknowledged", icon: "check", tone: "ok" },
  UNASSIGNED: { label: "Nobody assigned", icon: "alert", tone: "bad" },
  CLOSED: { label: "Closed", icon: "circle", tone: "neutral" },
};

export function SourceBadge({ source }: { source: string }) {
  const s = SOURCE[source] ?? { label: source.replace("_", " ").toLowerCase(), icon: "dot" as IconName };
  return <Badge icon={s.icon}>{s.label}</Badge>;
}

export function LeadStatusBadge({ status }: { status: string }) {
  const s = STATUS[status] ?? { label: status, icon: "dot" as IconName, tone: "neutral" as Tone };
  return <Badge tone={s.tone} icon={s.icon}>{s.label}</Badge>;
}
