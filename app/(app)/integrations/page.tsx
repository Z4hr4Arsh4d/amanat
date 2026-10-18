// P3 owns. Central integrations page (I5.1, I5.6, I5.7). Everyone can see the status;
// only users with integrations.manage can connect, change or remove (checked again on the server).
import Link from "next/link";
import type { Integration, Provider } from "@prisma/client";
import { requireUserPage, can, scoped } from "@/lib/shared/contracts";
import { TelegramIntegrationCard } from "@/components/slots/TelegramIntegrationCard";
import { appUrl, webhookUrl, type MetaConfig, type StripeConfig, type TwilioConfig } from "@/lib/integrations/store";
import { metaVerifyToken } from "@/lib/integrations/meta";
import { faultLabAllowed } from "@/lib/integrations/fault";
import { Chip, IntegrationStatusChip } from "@/lib/integrations/ui/StatusChip";
import { TimeAgo } from "@/lib/integrations/ui/TimeAgo";
import { AutoRefresh } from "@/lib/integrations/ui/AutoRefresh";
import { CopyField } from "@/lib/integrations/ui/CopyField";
import { DisconnectButton, MetaForm, PrepareWebhookButton, StripeForm, TestButton, TwilioForm } from "./forms";

export const dynamic = "force-dynamic";

const LIMITS: Record<Provider, string[]> = {
  META: [
    "Free: Meta's test number, incoming messages and replies within 24 hours cost nothing.",
    "The free test number only reaches up to 5 phone numbers that you add on the Meta API Setup page.",
    "Free-form replies only within 24 hours of the customer's last message. After that WhatsApp needs an approved template.",
    "The temporary access token expires after 24 hours; use a System User token for the demo.",
    "Pictures and files sent by customers are noted but not shown in Amanat. Customers who send STOP are opted out.",
  ],
  TWILIO: [
    "Sandbox only reaches phones that sent the join code to the sandbox number.",
    "Free-form replies only within 24 hours of the customer's last message. After that WhatsApp needs an approved template.",
    "Pictures and files sent by customers are noted but not shown in Amanat.",
    "Customers who send STOP are opted out and cannot be messaged until they send START.",
  ],
  STRIPE: [
    "Test mode only. Live keys are refused.",
    "Use card 4242 4242 4242 4242, any future date and any CVC.",
    "Card details are entered only on Stripe's page; Amanat never sees or stores them.",
  ],
  GOOGLE: [
    "App in testing mode; only listed test users can connect.",
    "Connections may need reconnecting after 7 days (Google limits testing apps).",
    "Each employee connects their own calendar. Employees without a connected calendar cannot be booked.",
  ],
  TELEGRAM: [
    "Each employee must press Start on the bot once to receive alerts.",
    "Failed alerts are retried a few times and listed in the sync history.",
  ],
};

function Card(props: {
  title: string;
  subtitle: string;
  status: Integration["status"];
  lastSuccessAt?: Date | null;
  lastError?: string | null;
  errors: { id: string; createdAt: Date; type: string; error: string | null }[];
  provider: Provider;
  canSeeHistory: boolean;
  children?: React.ReactNode;
}) {
  return (
    <section aria-labelledby={`h-${props.provider}`} className="flex min-w-0 flex-col gap-4 rounded-lg border border-stone-200 bg-white p-4 shadow-sm">
      <header className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 id={`h-${props.provider}`} className="text-lg font-semibold">{props.title}</h2>
          <p className="text-sm text-stone-600">{props.subtitle}</p>
        </div>
        <IntegrationStatusChip status={props.status} />
      </header>

      <dl className="grid grid-cols-1 gap-1 text-sm sm:grid-cols-2">
        <div><dt className="inline text-stone-600">Last worked: </dt><dd className="inline font-medium"><TimeAgo date={props.lastSuccessAt ?? null} /></dd></div>
        {props.lastError && props.status !== "NOT_CONNECTED" && (
          <div className="sm:col-span-2"><dt className="inline text-stone-600">Last problem: </dt><dd className="inline text-red-800">{props.lastError}</dd></div>
        )}
      </dl>

      {props.children}

      <details className="rounded border border-stone-200 bg-stone-50 p-3 text-sm" open>
        <summary className="cursor-pointer font-medium">What this can and can&apos;t do</summary>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-stone-700">
          {LIMITS[props.provider].map((l) => <li key={l}>{l}</li>)}
        </ul>
      </details>

      <div className="text-sm">
        <h3 className="font-medium">Recent errors</h3>
        {props.errors.length === 0 ? (
          <p className="text-stone-600">No recent errors.</p>
        ) : (
          <ul className="mt-1 space-y-1">
            {props.errors.map((e) => (
              <li key={e.id} className="flex flex-col gap-0.5 border-l-2 border-red-400 pl-2 sm:flex-row sm:gap-2">
                <span className="shrink-0 text-xs text-stone-600"><TimeAgo date={e.createdAt} /> · {e.type}</span>
                <span className="break-words text-red-900">{e.error}</span>
              </li>
            ))}
          </ul>
        )}
        {props.canSeeHistory && (
          <Link href={`/integrations/history?provider=${props.provider}`} className="mt-2 inline-block text-emerald-800 underline">
            See full sync history
          </Link>
        )}
      </div>
    </section>
  );
}

const latest = (ds: (Date | undefined)[]) =>
  ds.reduce<Date | null>((m, d) => (d && (!m || d > m) ? d : m), null);

export default async function IntegrationsPage() {
  const ctx = await requireUserPage();
  const db = scoped(ctx);
  const canManage = can(ctx, "integrations.manage");
  const canSeeHistory = canManage || can(ctx, "audit.view");

  const [rows, errorRows, users] = await Promise.all([
    db.integration.findMany(),
    db.integrationEvent.findMany({
      where: { OR: [{ status: { in: ["FAILED", "REJECTED"] } }, { status: "RETRYING", error: { not: null } }] },
      orderBy: { createdAt: "desc" },
      take: 40,
      select: { id: true, createdAt: true, type: true, error: true, provider: true },
    }),
    // CalendarConnection has no workspaceId; it is reached through this workspace's users only.
    db.user.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true, calendarConnection: { select: { status: true, googleEmail: true, createdAt: true } } },
    }),
  ]);
  const calendars = users;
  const byProvider = new Map(rows.map((r) => [r.provider, r]));
  const errorsFor = (p: Provider) => errorRows.filter((e) => e.provider === p).slice(0, 5);
  const calBy = new Map(calendars.map((c) => [c.id, c.calendarConnection]));

  const meta = byProvider.get("META");
  const metaCfg = (meta?.publicConfig ?? {}) as Partial<MetaConfig>;
  const metaOn = !!meta && meta.status !== "NOT_CONNECTED";
  const twilio = byProvider.get("TWILIO");
  const twilioCfg = (twilio?.publicConfig ?? {}) as Partial<TwilioConfig>;
  const stripe = byProvider.get("STRIPE");
  const stripeCfg = (stripe?.publicConfig ?? {}) as Partial<StripeConfig>;
  const telegram = byProvider.get("TELEGRAM");

  const googleReady = !!process.env.GOOGLE_CLIENT_ID && !!process.env.GOOGLE_CLIENT_SECRET;
  const connectedCount = calendars.filter((c) => c.calendarConnection?.status === "CONNECTED").length;
  const needsReconnect = calendars.filter((c) => c.calendarConnection?.status === "NEEDS_RECONNECT").length;
  const googleStatus: Integration["status"] = needsReconnect > 0 && connectedCount === 0 ? "ERROR" : connectedCount > 0 ? "CONNECTED" : "NOT_CONNECTED";
  const base = appUrl();
  const localUrl = /localhost|127\.0\.0\.1/.test(base);

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <AutoRefresh seconds={5} />
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Integrations</h1>
          <p className="text-sm text-stone-600">
            Connections to WhatsApp, Stripe, Google Calendar and Telegram for this workspace.
            {!canManage && " You can view them; ask an admin to change them."}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {canSeeHistory && (
            <Link href="/integrations/history" className="rounded border border-stone-300 bg-white px-3 py-2 text-sm font-medium hover:bg-stone-100 focus:outline-none focus:ring-2 focus:ring-emerald-700">
              Sync history
            </Link>
          )}
          {faultLabAllowed(ctx) && (
            <Link href="/integrations/fault-lab" className="rounded border border-stone-300 bg-white px-3 py-2 text-sm font-medium hover:bg-stone-100 focus:outline-none focus:ring-2 focus:ring-emerald-700">
              Fault lab
            </Link>
          )}
        </div>
      </header>

      {localUrl && canManage && (
        <p role="note" className="rounded border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          <span aria-hidden="true">⚠ </span>APP_URL is <code>{base}</code>. Twilio and Stripe cannot reach a localhost address.
          Run <code>ngrok http 3000</code> (or deploy) and set APP_URL to the public https URL, then restart the app.
        </p>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card title="WhatsApp (Meta Cloud API)" subtitle="Free. Receive customer messages as leads and reply from the Inbox." provider="META"
          status={meta?.status ?? "NOT_CONNECTED"} lastSuccessAt={meta?.lastSuccessAt} lastError={meta?.lastError} errors={errorsFor("META")} canSeeHistory={canSeeHistory}>
          {metaOn && (
            <dl className="grid grid-cols-1 gap-1 text-sm sm:grid-cols-2">
              <div><dt className="inline text-stone-600">Number: </dt><dd className="inline font-mono">{metaCfg.displayPhone ?? "—"}</dd></div>
              <div><dt className="inline text-stone-600">Name: </dt><dd className="inline">{metaCfg.verifiedName ?? "—"}</dd></div>
              <div><dt className="inline text-stone-600">Phone number ID: </dt><dd className="inline font-mono">{metaCfg.phoneNumberId}</dd></div>
              <div><dt className="inline text-stone-600">Access token: </dt><dd className="inline font-mono">{metaCfg.accessTokenMasked}</dd></div>
              <div><dt className="inline text-stone-600">App secret: </dt><dd className="inline font-mono">{metaCfg.appSecretMasked}</dd></div>
            </dl>
          )}
          {canManage && (meta ? (
            <div className="space-y-2">
              <CopyField label="Callback URL (Meta app → WhatsApp → Configuration → Webhook → Edit)" value={webhookUrl("whatsapp", meta.id)} />
              <CopyField label="Verify token (made by Amanat for this workspace; paste it next to the Callback URL)" value={metaVerifyToken(meta.id)}
                hint="Then press “Manage” under Webhook fields and subscribe to “messages”." />
            </div>
          ) : (
            <PrepareWebhookButton provider="META" />
          ))}
          {canManage ? (
            <MetaForm connected={metaOn} initial={{ phoneNumberId: metaCfg.phoneNumberId ?? "", wabaId: metaCfg.wabaId ?? "" }} />
          ) : (
            <p className="text-sm text-stone-600">Read only: you need the “Connect, change or remove integrations” permission to change this.</p>
          )}
          {canManage && metaOn && (
            <div className="flex flex-wrap gap-2"><TestButton provider="META" /><DisconnectButton provider="META" label="WhatsApp (Meta)" /></div>
          )}
        </Card>

        <Card title="WhatsApp (Twilio) — alternative" subtitle={metaOn ? "Not used while WhatsApp (Meta) is connected." : "Paid alternative to the Meta Cloud API."} provider="TWILIO"
          status={twilio?.status ?? "NOT_CONNECTED"} lastSuccessAt={twilio?.lastSuccessAt} lastError={twilio?.lastError} errors={errorsFor("TWILIO")} canSeeHistory={canSeeHistory}>
          {twilio?.status && twilio.status !== "NOT_CONNECTED" && (
            <dl className="grid grid-cols-1 gap-1 text-sm sm:grid-cols-2">
              <div><dt className="inline text-stone-600">Account SID: </dt><dd className="inline font-mono">{twilioCfg.accountSidMasked}</dd></div>
              <div><dt className="inline text-stone-600">Auth Token: </dt><dd className="inline font-mono">{twilioCfg.authTokenMasked}</dd></div>
              <div><dt className="inline text-stone-600">Sandbox number: </dt><dd className="inline font-mono">{twilioCfg.fromNumber}</dd></div>
              {twilioCfg.joinCode && <div><dt className="inline text-stone-600">Join phrase: </dt><dd className="inline font-mono">{twilioCfg.joinCode}</dd></div>}
            </dl>
          )}
          {canManage && (twilio ? (
            <div className="space-y-2">
              <CopyField label="Webhook URL (paste into Twilio → Messaging → WhatsApp sandbox settings → “When a message comes in”, method POST)"
                value={webhookUrl("twilio", twilio.id)} />
              <p className="text-xs text-stone-600">Delivery status callbacks are set automatically on every message we send.</p>
            </div>
          ) : (
            <PrepareWebhookButton provider="TWILIO" />
          ))}
          {canManage ? (
            <TwilioForm connected={twilio?.status === "CONNECTED" || twilio?.status === "ERROR"}
              initial={{ fromNumber: twilioCfg.fromNumber ?? "whatsapp:+14155238886", joinCode: twilioCfg.joinCode ?? "" }} />
          ) : (
            <p className="text-sm text-stone-600">Read only: you need the “Connect, change or remove integrations” permission to change this.</p>
          )}
          {canManage && twilio && twilio.status !== "NOT_CONNECTED" && (
            <div className="flex flex-wrap gap-2"><TestButton provider="TWILIO" /><DisconnectButton provider="TWILIO" label="Twilio" /></div>
          )}
        </Card>

        <Card title="Payments (Stripe)" subtitle="Payment links for opportunities; status updates arrive by webhook." provider="STRIPE"
          status={stripe?.status ?? "NOT_CONNECTED"} lastSuccessAt={stripe?.lastSuccessAt} lastError={stripe?.lastError} errors={errorsFor("STRIPE")} canSeeHistory={canSeeHistory}>
          {stripe?.status && stripe.status !== "NOT_CONNECTED" && (
            <dl className="grid grid-cols-1 gap-1 text-sm sm:grid-cols-2">
              <div><dt className="inline text-stone-600">Secret key: </dt><dd className="inline font-mono">{stripeCfg.secretKeyMasked}</dd></div>
              <div><dt className="inline text-stone-600">Signing secret: </dt><dd className="inline font-mono">{stripeCfg.webhookSecretMasked}</dd></div>
            </dl>
          )}
          {canManage && (stripe ? (
            <div className="space-y-2 text-sm">
              <CopyField label="Webhook endpoint URL (Stripe → Developers → Webhooks → Add endpoint)" value={webhookUrl("stripe", stripe.id)} />
              <p className="text-xs text-stone-600">
                Events to send: <code>checkout.session.completed</code>, <code>checkout.session.expired</code>,{" "}
                <code>checkout.session.async_payment_failed</code>, <code>payment_intent.payment_failed</code>, <code>charge.refunded</code>.
              </p>
            </div>
          ) : (
            <PrepareWebhookButton provider="STRIPE" />
          ))}
          {canManage ? (
            <StripeForm connected={stripe?.status === "CONNECTED" || stripe?.status === "ERROR"} />
          ) : (
            <p className="text-sm text-stone-600">Read only: you need the “Connect, change or remove integrations” permission to change this.</p>
          )}
          {canManage && stripe && stripe.status !== "NOT_CONNECTED" && (
            <div className="flex flex-wrap gap-2"><TestButton provider="STRIPE" /><DisconnectButton provider="STRIPE" label="Stripe" /></div>
          )}
        </Card>

        <Card title="Google Calendar" subtitle="Each employee connects their own calendar to be bookable." provider="GOOGLE"
          status={googleStatus} lastSuccessAt={latest(calendars.map((c) => c.calendarConnection?.createdAt))}
          lastError={needsReconnect > 0 ? `${needsReconnect} employee calendar connection(s) expired and need reconnecting.` : null} errors={errorsFor("GOOGLE")} canSeeHistory={canSeeHistory}>
          <p className="text-sm text-stone-700">
            {googleReady ? "Google sign-in is set up. " : "Google sign-in is not set up yet (GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET, see README). "}
            {process.env.DEMO_MODE === "true" ? "Employees can also use a demo calendar (no Google) while DEMO_MODE=true." : ""}
          </p>
          <p className="text-sm">
            <Link href="/settings/calendar" className="text-emerald-800 underline">Connect or check your own calendar</Link>
          </p>
          {canManage && (
            <div className="overflow-hidden rounded border border-stone-200">
              <table className="w-full text-left text-sm">
                <caption className="sr-only">Calendar connection by employee</caption>
                <thead className="bg-stone-50 text-xs text-stone-600"><tr><th className="px-3 py-2 font-medium">Employee</th><th className="px-3 py-2 font-medium">Calendar</th></tr></thead>
                <tbody>
                  {users.map((u) => {
                    const c = calBy.get(u.id);
                    return (
                      <tr key={u.id} className="border-t border-stone-100">
                        <td className="px-3 py-2"><span className="block">{u.name}</span>{c?.googleEmail && <span className="block break-all text-xs text-stone-600">{c.googleEmail}</span>}</td>
                        <td className="px-3 py-2">
                          {c?.status === "CONNECTED" ? <Chip tone="ok">{c.googleEmail.endsWith("(demo calendar)") ? "Connected (demo)" : "Connected"}</Chip> : c?.status === "NEEDS_RECONNECT" ? <Chip tone="bad">Needs reconnect</Chip> : <Chip tone="off">Not connected</Chip>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <Card title="Alerts (Telegram)" subtitle="Escalation alerts sent to each employee's Telegram." provider="TELEGRAM"
          status={telegram?.status ?? "NOT_CONNECTED"} lastSuccessAt={telegram?.lastSuccessAt} lastError={telegram?.lastError} errors={errorsFor("TELEGRAM")} canSeeHistory={canSeeHistory}>
          <TelegramIntegrationCard canManage={canManage} />
        </Card>
      </div>
    </div>
  );
}
