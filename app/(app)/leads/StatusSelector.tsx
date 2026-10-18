"use client";
// P2 owns. Your own availability (F3.2). Zahra/P1 can mount <StatusSelector/> in the top bar.
import { useState } from "react";
import useSWR from "swr";
import { useAction } from "@/components/ui/useAction";
import { ui } from "@/components/ui/styles";
import { getMyStatus, setMyStatus } from "./team-actions";

export const STATUS_OPTIONS = [
  { value: "AVAILABLE", label: "🟢 Available" },
  { value: "BUSY", label: "🟡 Busy" },
  { value: "ON_LEAVE", label: "🏖 On leave" },
  { value: "OFFLINE", label: "⚫ Offline" },
] as const;

export const ABSENCE_NOTICE =
  "Leads you have already acknowledged stay with you, but they are flagged 'Owner away' and appear in the recovery queue so a manager can reassign them.";

export function StatusSelector() {
  const { data, mutate } = useSWR("my-status", async () => {
    const r = await getMyStatus();
    if (!r.ok) throw new Error(r.error);
    return r.data;
  }, { refreshInterval: 3000 });
  const { pending, run } = useAction();
  const [picked, setPicked] = useState<string | null>(null);
  const value = picked ?? data ?? "AVAILABLE";
  const away = value === "ON_LEAVE" || value === "OFFLINE";

  return (
    <div className="space-y-1">
      <label htmlFor="my-status" className="mr-2 text-sm font-medium text-stone-800">My status</label>
      <select
        id="my-status" className={`${ui.input} w-auto`} value={value} disabled={pending || !data}
        onChange={(e) => {
          const next = e.target.value;
          setPicked(next);
          run(() => setMyStatus({ status: next }), { success: "Status updated.", onSuccess: () => mutate().then(() => setPicked(null)), onError: () => setPicked(null) });
        }}
      >
        {STATUS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      {away && <p role="note" className="max-w-md text-xs text-amber-900">ℹ️ {ABSENCE_NOTICE}</p>}
    </div>
  );
}
