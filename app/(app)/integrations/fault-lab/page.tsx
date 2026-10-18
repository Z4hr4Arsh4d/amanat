// P3 owns. Fault-test lab (PLAN §4.5): show dedupe, forged-request rejection and retries live.
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUserPage } from "@/lib/shared/contracts";
import { faultLabAllowed } from "@/lib/integrations/fault";
import { FaultLab } from "./FaultLab";

export const dynamic = "force-dynamic";

export default async function FaultLabPage() {
  const ctx = await requireUserPage();
  if (!faultLabAllowed(ctx)) notFound();
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <nav className="text-sm"><Link href="/integrations" className="text-emerald-800 underline">← Integrations</Link></nav>
      <header>
        <h1 className="text-2xl font-semibold">Fault lab</h1>
        <p className="text-sm text-stone-600">Owner-only demo tools (DEMO_MODE=true). Each test uses the real webhook and outbox code, then shows the result.</p>
      </header>
      <FaultLab />
    </div>
  );
}
