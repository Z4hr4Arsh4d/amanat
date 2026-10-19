"use client";
// P2 owns. Your own availability (F3.2). Mounted in the top bar (compact) so it can be changed from any page.
import { useId, useState } from "react";
import useSWR from "swr";
import { useAction } from "@/components/ui/useAction";
import { ui } from "@/components/ui/styles";
import { Notice } from "@/components/ui/Kit";
import { getMyStatus, setMyStatus } from "./team-actions";

export const STATUS_OPTIONS = [
  { value: "AVAILABLE", label: "Available" },
  { value: "BUSY", label: "Busy" },
  { value: "ON_LEAVE", label: "On leave" },
  { value: "OFFLINE", label: "Offline" },
] as const;

/** Dot colour per status. Always shown next to the status name, so colour is never the only signal. */
export const STATUS_DOT: Record<string, string> = {
  AVAILABLE: "bg-emerald-500",
  BUSY: "bg-amber-500",
  ON_LEAVE: "bg-sky-500",
  OFFLINE: "bg-white ring-2 ring-inset ring-stone-400",
};

export const ABSENCE_NOTICE =
  "Leads you have already acknowledged stay with you, but they are flagged 'Owner away' and appear in the recovery queue so a manager can reassign them.";

async function fetchStatus() {
  const r = await getMyStatus();
  if (!r.ok) throw new Error(r.error);
  return r.data;
}

export function StatusSelector({ compact = false }: { compact?: boolean }) {
  const id = useId();
  const { data, mutate } = useSWR("my-status", fetchStatus, { refreshInterval: 3000 });
  const { pending, run } = useAction();
  const [picked, setPicked] = useState<string | null>(null);
  const value = picked ?? data ?? "AVAILABLE";
  const away = value === "ON_LEAVE" || value === "OFFLINE";

  return (
    <div className={compact ? "flex items-center gap-2" : "space-y-2"}>
      <label htmlFor={id} className={compact ? "text-xs font-semibold text-stone-600" : ui.label}>My status</label>
      <div className="relative">
        <span aria-hidden="true" className={`pointer-events-none absolute left-3 top-1/2 z-10 h-2.5 w-2.5 -translate-y-1/2 rounded-full ${STATUS_DOT[value] ?? "bg-stone-400"}`} />
        <select
          id={id} className={`${compact ? ui.inputSm : ui.inputAuto} !pl-8`} value={value} disabled={pending || !data}
          title={away ? ABSENCE_NOTICE : undefined}
          onChange={(e) => {
            const next = e.target.value;
            setPicked(next);
            run(() => setMyStatus({ status: next }), { success: "Status updated.", onSuccess: () => mutate().then(() => setPicked(null)), onError: () => setPicked(null) });
          }}
        >
          {STATUS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </div>
      {away && !compact && <p role="note" className="max-w-md text-xs text-amber-900">{ABSENCE_NOTICE}</p>}
    </div>
  );
}

/** Shown on the leads page while you are away, so it is clear what happens to your leads. */
export function AwayNotice() {
  const { data } = useSWR("my-status", fetchStatus, { refreshInterval: 3000 });
  if (data !== "ON_LEAVE" && data !== "OFFLINE") return null;
  return (
    <Notice tone="warn" role="note" title={`You are set to ${data === "ON_LEAVE" ? "On leave" : "Offline"}, so new leads skip you.`}>
      {ABSENCE_NOTICE} Change your status at the top of the page when you are back.
    </Notice>
  );
}
