// P3 owns. WhatsApp inbox: conversations you may see (I1.6) and the thread view.
import { requireUserPage } from "@/lib/shared/contracts";
import { seesAll } from "@/lib/integrations/inbox";
import { InboxClient } from "./InboxClient";

export const dynamic = "force-dynamic";

export default async function InboxPage({ searchParams }: { searchParams: Promise<{ c?: string }> }) {
  const ctx = await requireUserPage();
  const { c } = await searchParams;
  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <header>
        <h1 className="text-2xl font-semibold">Inbox</h1>
        <p className="text-sm text-stone-600">
          {seesAll(ctx)
            ? "All WhatsApp conversations in this workspace."
            : "WhatsApp conversations you handle: ones assigned to you, your contacts, and your leads."}
        </p>
      </header>
      <InboxClient initialId={c ?? null} />
    </div>
  );
}
