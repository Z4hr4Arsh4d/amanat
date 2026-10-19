"use client";
// P2 owns. Live countdown to the acknowledge deadline (F3.4). Text + icon, never colour alone.
import { useEffect, useState } from "react";
import { Icon } from "@/components/ui/Icon";

const mmss = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

/** msLeft is measured on the server when `receivedAt` (a Date.now() on this device) was taken. */
export function Countdown({ msLeft, receivedAt }: { msLeft: number; receivedAt: number }) {
  const [now, setNow] = useState(receivedAt);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, []);

  const left = Math.max(0, Math.ceil((msLeft - (Math.max(now, receivedAt) - receivedAt)) / 1000));
  const pill = "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-bold tabular-nums";
  if (left === 0) {
    return (
      <span role="status" className={`${pill} border-red-200 bg-red-50 text-red-800`}>
        <Icon name="alert" className="h-3.5 w-3.5" /> Escalating now…
      </span>
    );
  }
  const urgent = left < 10;
  return (
    <span role="timer" aria-label={`Escalates in ${mmss(left)}`} className={`${pill} ${urgent ? "animate-pulse border-red-200 bg-red-50 text-red-800" : "border-amber-200 bg-amber-50 text-amber-900"}`}>
      <Icon name={urgent ? "alert" : "timer"} className="h-3.5 w-3.5" /> Escalates in {mmss(left)}
    </span>
  );
}
