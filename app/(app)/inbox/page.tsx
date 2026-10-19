// P3 owns. Customer conversations (website chat + WhatsApp): the ones you may see (I1.6) and the thread view.
import { requireUserPage } from "@/lib/shared/contracts";
import { prisma } from "@/lib/db";
import { seesAll } from "@/lib/integrations/inbox";
import { appUrl } from "@/lib/integrations/store";
import { InboxClient } from "./InboxClient";
import { PageHeader } from "@/components/ui/Kit";
import { Icon } from "@/components/ui/Icon";
import { ui } from "@/components/ui/styles";

export const dynamic = "force-dynamic";

export default async function InboxPage({ searchParams }: { searchParams: Promise<{ c?: string }> }) {
  const ctx = await requireUserPage();
  const { c } = await searchParams;
  const ws = await prisma.workspace.findUnique({ where: { id: ctx.workspaceId }, select: { slug: true } });
  const chatUrl = `${appUrl()}/api/webhooks/webchat/${ws?.slug ?? ""}`;
  return (
    <div className="space-y-6">
      <PageHeader
        title="Inbox"
        description={seesAll(ctx)
          ? "All customer conversations in this workspace (website chat and WhatsApp)."
          : "Customer conversations you handle: ones assigned to you, your contacts, and your leads."}
        actions={
          <a href={chatUrl} target="_blank" rel="noreferrer" className={ui.btn}>
            <Icon name="external" className="h-4 w-4" /> Try it: open the customer chat
          </a>
        }
      />
      <InboxClient initialId={c ?? null} />
    </div>
  );
}
