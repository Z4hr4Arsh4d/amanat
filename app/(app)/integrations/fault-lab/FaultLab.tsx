"use client";
// P3 owns.
import { useState } from "react";
import Link from "next/link";
import { useRun } from "@/lib/integrations/ui/useRun";
import { Spinner } from "@/lib/integrations/ui/Spinner";
import { Icon } from "@/components/ui/Icon";
import { ui } from "@/components/ui/styles";
import { faultAction } from "./actions";

const TESTS = [
  { kind: "stripe", title: "Send the same Stripe event twice", expect: "First delivery: processed (an open payment turns Paid). Second: “duplicate”, nothing changes (I2.4).", provider: "STRIPE" },
  { kind: "forged", title: "Send a forged WhatsApp webhook", expect: "Rejected with 403, logged as Rejected and written to the audit history; no contact or lead is created (I1.2).", provider: "META" },
  { kind: "outage", title: "Call a provider that is down", expect: "Retries after 5s, 15s, 45s (worker must be running), then Failed with a plain reason. The rest of the app keeps working (I5.5, I5.8).", provider: "TELEGRAM" },
] as const;

export function FaultLab() {
  const { pending, run } = useRun();
  const [results, setResults] = useState<Record<string, { label: string; status: number; body: string }[]>>({});
  return (
    <ul className="space-y-3">
      {TESTS.map((t) => (
        <li key={t.kind} className={`${ui.card} space-y-3`}>
          <h2 className={ui.h2}>{t.title}</h2>
          <p className="text-sm leading-6 text-stone-600"><span className="font-semibold text-stone-800">Expected: </span>{t.expect}</p>
          <div className="flex flex-wrap items-center gap-3">
            <button type="button" disabled={!!pending}
              onClick={() => run(t.kind, () => faultAction(t.kind), { onOk: (r) => r.ok && r.data && setResults((x) => ({ ...x, [t.kind]: r.data! })) })}
              className={ui.btnPrimary}>
              {pending === t.kind ? <Spinner /> : <Icon name="flask" className="h-4 w-4" />}Run test
            </button>
            <Link href={`/integrations/history?provider=${t.kind === "forged" ? "" : t.provider}`} className={ui.link}>Open sync history</Link>
          </div>
          {results[t.kind] && (
            <ol className="space-y-1.5 text-sm" aria-live="polite">
              {results[t.kind].map((s, i) => (
                <li key={i} className="rounded-lg border border-stone-200 bg-stone-50 px-3 py-2">
                  <span className="font-semibold">{s.label}: </span>
                  <code>HTTP {s.status}</code> — <span className="break-words">{s.body}</span>
                </li>
              ))}
            </ol>
          )}
        </li>
      ))}
    </ul>
  );
}
