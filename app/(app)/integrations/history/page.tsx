// P3 owns. Synchronization history: every inbound webhook and outbound call (I5.4).
import { requireUserPage } from "@/lib/shared/contracts";
import { canSeeHistory } from "@/lib/integrations/history";
import { HistoryTable } from "./HistoryTable";
import { NoAccess } from "@/components/ui/NoAccess";
import { PageHeader } from "@/components/ui/Kit";

export const dynamic = "force-dynamic";

export default async function HistoryPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const ctx = await requireUserPage();
  if (!canSeeHistory(ctx)) {
    return <NoAccess what="view the sync history. You need the “Connect, change or remove integrations” or “View the audit history” permission" />;
  }
  const sp = await searchParams;
  return (
    <div className="space-y-6">
      <PageHeader
        back={{ href: "/integrations", label: "Integrations" }}
        title="Sync history"
        description="Every message, webhook and call to Twilio, Stripe, Google and Telegram, newest first. Updates live."
      />
      <HistoryTable initial={{ provider: sp.provider ?? "", direction: sp.direction ?? "", status: sp.status ?? "", q: sp.q ?? "" }} />
    </div>
  );
}
