// P3 owns. Fault-test lab (PLAN §4.5): show dedupe, forged-request rejection and retries live.
import { notFound } from "next/navigation";
import { requireUserPage } from "@/lib/shared/contracts";
import { faultLabAllowed } from "@/lib/integrations/fault";
import { FaultLab } from "./FaultLab";
import { PageHeader } from "@/components/ui/Kit";

export const dynamic = "force-dynamic";

export default async function FaultLabPage() {
  const ctx = await requireUserPage();
  if (!faultLabAllowed(ctx)) notFound();
  return (
    <div className="max-w-3xl space-y-6">
      <PageHeader back={{ href: "/integrations", label: "Integrations" }} title="Fault lab"
        description="Owner-only demo tools (DEMO_MODE=true). Each test uses the real webhook and outbox code, then shows the result." />
      <FaultLab />
    </div>
  );
}
