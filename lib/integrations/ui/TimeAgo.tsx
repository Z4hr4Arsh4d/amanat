"use client";
// P3 owns. "2 min ago", updating itself; the exact time is in the tooltip.
import { useEffect, useState } from "react";

export function timeAgo(d: Date, now = Date.now()) {
  const s = Math.round((now - d.getTime()) / 1000);
  if (s < 5) return "just now";
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  return `${Math.round(h / 24)} d ago`;
}

export function TimeAgo({ date, prefix = "" }: { date: string | Date | null | undefined; prefix?: string }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 10_000);
    return () => clearInterval(t);
  }, []);
  if (!date) return <span>never</span>;
  const d = new Date(date);
  return (
    <time dateTime={d.toISOString()} title={d.toLocaleString()} suppressHydrationWarning>
      {prefix}
      {timeAgo(d, now)}
    </time>
  );
}
