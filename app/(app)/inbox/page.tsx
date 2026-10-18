// P3 owns. Customer conversations (website chat + WhatsApp): the ones you may see (I1.6) and the thread view.
import { requireUserPage } from "@/lib/shared/contracts";
import { prisma } from "@/lib/db";
import { seesAll } from "@/lib/integrations/inbox";
import { appUrl } from "@/lib/integrations/store";
import { InboxClient } from "./InboxClient";

export const dynamic = "force-dynamic";

export default async function InboxPage({ searchParams }: { searchParams: Promise<{ c?: string }> }) {
  const ctx = await requireUserPage();
  const { c } = await searchParams;
  const ws = await prisma.workspace.findUnique({ where: { id: ctx.workspaceId }, select: { slug: true } });
  const chatUrl = `${appUrl()}/api/webhooks/webchat/${ws?.slug ?? ""}`;
  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Inbox</h1>
          <p className="text-sm text-stone-600">
            {seesAll(ctx)
              ? "All customer conversations in this workspace (website chat and WhatsApp)."
              : "Customer conversations you handle: ones assigned to you, your contacts, and your leads."}
          </p>
        </div>
        <a href={chatUrl} target="_blank" rel="noreferrer"
          className="rounded border border-emerald-700 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-900 hover:bg-emerald-100 focus:outline-none focus:ring-2 focus:ring-emerald-700">
          Try it: open the customer chat in a new tab
        </a>
      </header>
      <InboxClient initialId={c ?? null} />
    </div>
  );
}
