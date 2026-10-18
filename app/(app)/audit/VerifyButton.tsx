"use client";
// P1 owns.
import { useState } from "react";
import { useAction } from "@/components/ui/useAction";
import { Spinner } from "@/components/ui/Spinner";
import { ui } from "@/components/ui/styles";
import type { VerifyResult } from "@/lib/audit";
import { verifyAudit } from "./actions";

const short = (h?: string) => (h ? `${h.slice(0, 8)}…` : "—");

export function VerifyButton() {
  const { pending, run } = useAction();
  const [res, setRes] = useState<VerifyResult | null>(null);
  return (
    <div className="space-y-3">
      <button
        type="button"
        disabled={pending}
        className={ui.btnPrimary}
        onClick={() => run(() => verifyAudit(), { onSuccess: setRes })}
      >
        {pending && <Spinner />} 🔒 Verify history
      </button>
      <div aria-live="polite">
        {res && res.ok && (
          <p className="rounded-md border border-emerald-300 bg-emerald-50 p-3 text-sm font-medium text-emerald-900">
            ✓ All {res.checked.toLocaleString()} entries intact. Nothing has been changed or removed.
          </p>
        )}
        {res && !res.ok && (
          <div role="alert" className="space-y-1 rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-900">
            <p className="font-semibold">✗ {res.reason ?? `Entry #${res.brokenAt} has been altered.`}</p>
            {res.expected && <p>Expected hash <code>{short(res.expected)}</code>, found <code>{short(res.found)}</code>.</p>}
            <p>{res.checked.toLocaleString()} entries before it are intact. Everything from #{res.brokenAt} onward can&apos;t be trusted.</p>
          </div>
        )}
      </div>
    </div>
  );
}
