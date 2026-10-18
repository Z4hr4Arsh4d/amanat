// P3 owns. Connect / disconnect your own calendar (I3.1, I3.2).
import { requireUserPage } from "@/lib/shared/contracts";
import { myCalendar } from "@/lib/integrations/appointments";
import { Chip } from "@/lib/integrations/ui/StatusChip";
import { TimeAgo } from "@/lib/integrations/ui/TimeAgo";
import { offsetLabel } from "@/lib/integrations/time";
import { CalendarButtons } from "./CalendarButtons";

export const dynamic = "force-dynamic";

export default async function CalendarPage({ searchParams }: { searchParams: Promise<{ error?: string; connected?: string }> }) {
  const ctx = await requireUserPage();
  const sp = await searchParams;
  const me = await myCalendar(ctx);
  const c = me.connection;
  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <header>
        <h1 className="text-2xl font-semibold">My calendar</h1>
        <p className="text-sm text-stone-600">Connect your Google Calendar so customers can be booked with you and your meetings count as Busy.</p>
      </header>

      {sp.error && <p role="alert" className="rounded border border-red-300 bg-red-50 p-3 text-sm text-red-900"><span aria-hidden="true">⚠ </span>{sp.error.slice(0, 300)}</p>}
      {sp.connected && <p role="status" className="rounded border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-900"><span aria-hidden="true">✓ </span>Google Calendar connected.</p>}
      {c?.status === "NEEDS_RECONNECT" && (
        <p role="alert" className="rounded border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          <span aria-hidden="true">⚠ </span>Your Google Calendar connection expired. Reconnect so customers can be booked with you.
        </p>
      )}

      <section className="space-y-3 rounded-lg border border-stone-200 bg-white p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold">Status</h2>
          {c?.status === "CONNECTED" ? <Chip tone="ok">Connected</Chip> : c?.status === "NEEDS_RECONNECT" ? <Chip tone="bad">Needs reconnect</Chip> : <Chip tone="off">Not connected</Chip>}
        </div>
        {c && (
          <dl className="space-y-1 text-sm">
            <div><dt className="inline text-stone-600">Account: </dt><dd className="inline break-all">{c.email}</dd></div>
            <div><dt className="inline text-stone-600">Connected: </dt><dd className="inline"><TimeAgo date={c.since} /></dd></div>
            {c.demo && <div className="text-stone-700">This is a demo calendar (no Google account). Your Amanat appointments count as busy time.</div>}
          </dl>
        )}
        <p className="text-sm"><span className="text-stone-600">Your time zone: </span>{me.timezone} ({offsetLabel(me.timezone)}). Appointments with you are booked in this zone.</p>
        <CalendarButtons connected={!!c} needsReconnect={c?.status === "NEEDS_RECONNECT"} googleReady={me.googleReady} demoAllowed={me.demoAllowed} />
      </section>

      <section className="rounded-lg border border-stone-200 bg-stone-50 p-4 text-sm text-stone-700">
        <h2 className="font-semibold text-stone-900">What this can and can&apos;t do</h2>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li>Amanat asks Google only to read your free/busy times and to add, move and delete the events it books.</li>
          <li>The Google app is in testing mode: only listed test users can connect, and the connection may need reconnecting after 7 days.</li>
          <li>If the connection expires, you are shown as not bookable until you reconnect.</li>
          <li>Disconnect removes Amanat&apos;s access at Google and deletes the saved tokens.</li>
        </ul>
      </section>
    </div>
  );
}
