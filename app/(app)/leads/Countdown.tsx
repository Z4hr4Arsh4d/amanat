"use client";
// P2 owns. Live countdown to the acknowledge deadline (F3.4). Text + icon, never colour alone.
import { useEffect, useState } from "react";

const mmss = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

/** msLeft is measured on the server when `receivedAt` (a Date.now() on this device) was taken. */
export function Countdown({ msLeft, receivedAt }: { msLeft: number; receivedAt: number }) {
  const [now, setNow] = useState(receivedAt);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, []);

  const left = Math.max(0, Math.ceil((msLeft - (Math.max(now, receivedAt) - receivedAt)) / 1000));
  if (left === 0) {
    return <span role="status" className="font-medium text-red-800">⏰ Escalating now…</span>;
  }
  const urgent = left < 10;
  return (
    <span role="timer" aria-label={`Escalates in ${mmss(left)}`} className={urgent ? "font-semibold text-red-800" : "text-stone-800"}>
      {urgent ? "⏰" : "⏳"} Escalates in {mmss(left)}
    </span>
  );
}
