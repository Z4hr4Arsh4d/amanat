"use client";
// P1 owns.
import { useState } from "react";
import { useAction } from "@/components/ui/useAction";
import { Spinner } from "@/components/ui/Spinner";
import { ui } from "@/components/ui/styles";
import { Icon } from "@/components/ui/Icon";
import { Notice } from "@/components/ui/Kit";
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
        {pending ? <Spinner /> : <Icon name="shield" className="h-4 w-4" />}{pending ? "Checking…" : "Verify history"}
      </button>
      <div aria-live="polite">
        {res && res.ok && (
          <Notice tone="ok" role="status" title={`All ${res.checked.toLocaleString()} entries intact.`}>Nothing has been changed or removed.</Notice>
        )}
        {res && !res.ok && (
          <Notice tone="bad" title={res.reason ?? `Entry #${res.brokenAt} has been altered.`}>
            {res.expected && <p>Expected hash <code>{short(res.expected)}</code>, found <code>{short(res.found)}</code>.</p>}
            <p>{res.checked.toLocaleString()} entries before it are intact. Everything from #{res.brokenAt} onward can&apos;t be trusted.</p>
          </Notice>
        )}
      </div>
    </div>
  );
}
