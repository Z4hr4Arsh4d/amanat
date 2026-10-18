// P3 owns. Synchronization history: every inbound webhook and outbound call (I5.4).
import Link from "next/link";
import { requireUserPage } from "@/lib/shared/contracts";
import { canSeeHistory } from "@/lib/integrations/history";
import { HistoryTable } from "./HistoryTable";

export const dynamic = "force-dynamic";

export default async function HistoryPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const ctx = await requireUserPage();
  if (!canSeeHistory(ctx)) {
    return (
      <section className="mx-auto max-w-3xl space-y-2">
        <h1 className="text-2xl font-semibold">Sync history</h1>
        <p role="alert" className="rounded border border-red-300 bg-red-50 p-3 text-sm text-red-900">
          <span aria-hidden="true">⚠ </span>You don&apos;t have permission to view the sync history. Ask an admin for the
          “Connect, change or remove integrations” or “View the audit history” permission.
        </p>
      </section>
    );
  }
  const sp = await searchParams;
  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <nav className="text-sm"><Link href="/integrations" className="text-emerald-800 underline">← Integrations</Link></nav>
      <header>
        <h1 className="text-2xl font-semibold">Sync history</h1>
        <p className="text-sm text-stone-600">Every message, webhook and call to Twilio, Stripe, Google and Telegram, newest first. Updates live.</p>
      </header>
      <HistoryTable initial={{ provider: sp.provider ?? "", direction: sp.direction ?? "", status: sp.status ?? "", q: sp.q ?? "" }} />
    </div>
  );
}
