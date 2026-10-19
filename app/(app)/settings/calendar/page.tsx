// P3 owns. Connect / disconnect your own calendar (I3.1, I3.2).
import { requireUserPage } from "@/lib/shared/contracts";
import { myCalendar } from "@/lib/integrations/appointments";
import { Chip } from "@/lib/integrations/ui/StatusChip";
import { TimeAgo } from "@/lib/integrations/ui/TimeAgo";
import { offsetLabel } from "@/lib/integrations/time";
import { CalendarButtons } from "./CalendarButtons";
import { CalendarCheck } from "./CalendarCheck";
import { MyAppointments } from "./MyAppointments";
import { Notice, PageHeader, Panel } from "@/components/ui/Kit";
import { Icon } from "@/components/ui/Icon";

export const dynamic = "force-dynamic";

export default async function CalendarPage({ searchParams }: { searchParams: Promise<{ error?: string; connected?: string }> }) {
  const ctx = await requireUserPage();
  const sp = await searchParams;
  const me = await myCalendar(ctx);
  const c = me.connection;
  return (
    <div className="max-w-3xl space-y-6">
      <PageHeader title="My calendar" description="Connect your Google Calendar so customers can be booked with you and your meetings count as Busy." />

      {sp.error && <Notice tone="bad">{sp.error.slice(0, 300)}</Notice>}
      {sp.connected && <Notice tone="ok" role="status">Google Calendar connected.</Notice>}
      {c?.status === "NEEDS_RECONNECT" && (
        <Notice tone="warn" role="alert">Your Google Calendar connection expired. Reconnect so customers can be booked with you.</Notice>
      )}

      <Panel id="cal-status" title="Status" actions={c?.status === "CONNECTED" ? <Chip tone="ok">Connected</Chip> : c?.status === "NEEDS_RECONNECT" ? <Chip tone="bad">Needs reconnect</Chip> : <Chip tone="off">Not connected</Chip>}>
        <div className="space-y-4">
          {c && (
            <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
              <div><dt className="text-xs font-semibold uppercase tracking-wider text-stone-500">Account</dt><dd className="mt-0.5 break-all font-semibold text-stone-900">{c.email}</dd></div>
              <div><dt className="text-xs font-semibold uppercase tracking-wider text-stone-500">Connected</dt><dd className="mt-0.5 font-semibold text-stone-900"><TimeAgo date={c.since} /></dd></div>
              {c.demo && <div className="text-stone-600 sm:col-span-2">This is a demo calendar (no Google account). Your Amanat appointments count as busy time.</div>}
            </dl>
          )}
          <p className="flex items-start gap-2 rounded-lg bg-stone-50 px-3 py-2.5 text-sm text-stone-700">
            <Icon name="globe" className="mt-0.5 h-4 w-4 text-stone-500" />
            <span><span className="text-stone-500">Your time zone: </span><span className="font-semibold text-stone-900">{me.timezone} ({offsetLabel(me.timezone)})</span>. Appointments with you are booked in this zone.</span>
          </p>
          <CalendarButtons connected={!!c} needsReconnect={c?.status === "NEEDS_RECONNECT"} googleReady={me.googleReady} demoAllowed={me.demoAllowed} />
        </div>
      </Panel>

      <CalendarCheck connected={!!c && c.status === "CONNECTED"} />

      <Panel id="mine" title="My upcoming appointments" description="Customer appointments booked with you in Amanat. They are also on your Google Calendar.">
        <MyAppointments />
      </Panel>

      <section className="rounded-xl bg-stone-100/70 p-5 text-sm text-stone-700">
        <h2 className={"text-sm font-bold text-stone-900"}>What this can and can&apos;t do</h2>
        <ul className="mt-2 list-disc space-y-1 pl-5 leading-6 marker:text-stone-400">
          <li>Amanat asks Google only to read your free/busy times and to add, move and delete the events it books.</li>
          <li>The Google app is in testing mode: only listed test users can connect, and the connection may need reconnecting after 7 days.</li>
          <li>If the connection expires, you are shown as not bookable until you reconnect.</li>
          <li>Disconnect removes Amanat&apos;s access at Google and deletes the saved tokens.</li>
        </ul>
      </section>
    </div>
  );
}
