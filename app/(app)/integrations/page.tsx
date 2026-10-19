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
import { DisconnectButton, MetaForm, PrepareWebhookButton, StripeForm, TestButton, TwilioForm, WebchatToggle } from "./forms";
import { prisma } from "@/lib/db";
import { Icon, type IconName } from "@/components/ui/Icon";
import { Notice, PageHeader } from "@/components/ui/Kit";
import { ui } from "@/components/ui/styles";

const PROVIDER_ICON: Record<Provider, IconName> = { WEBCHAT: "globe", META: "whatsapp", TWILIO: "whatsapp", STRIPE: "card", GOOGLE: "calendar", TELEGRAM: "send" };

export const dynamic = "force-dynamic";

const LIMITS: Record<Provider, string[]> = {
  WEBCHAT: [
    "Built in: no outside account, cost or setup. Share the link on your website, in an email or a QR code.",
    "Customers give a name and phone number, then chat live. Each chat becomes a lead with an owner and the same auto-reply, escalation and handoff messages as WhatsApp.",
    "Staff reply from the Inbox. Replies appear in the customer's chat window within seconds.",
    "Customers see only their own chat. If they close the page and come back on the same device, the chat continues.",
  ],
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
  chip?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <section aria-labelledby={`h-${props.provider}`} className="flex min-w-0 flex-col rounded-xl border border-stone-200 bg-white shadow-xs">
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-stone-100 p-5">
        <div className="flex min-w-0 items-start gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-stone-100 text-stone-600"><Icon name={PROVIDER_ICON[props.provider]} className="h-5 w-5" /></span>
          <div className="min-w-0">
            <h2 id={`h-${props.provider}`} className={ui.h2}>{props.title}</h2>
            <p className="mt-0.5 text-sm leading-6 text-stone-600">{props.subtitle}</p>
          </div>
        </div>
        {props.chip ?? <IntegrationStatusChip status={props.status} />}
      </header>

      <div className="flex flex-1 flex-col gap-4 p-5">
        <dl className="grid grid-cols-1 gap-1 text-sm">
          <div><dt className="inline text-stone-500">Last worked: </dt><dd className="inline font-semibold text-stone-900"><TimeAgo date={props.lastSuccessAt ?? null} /></dd></div>
          {props.lastError && props.status !== "NOT_CONNECTED" && (
            <div><dt className="inline text-stone-500">Last problem: </dt><dd className="inline font-medium text-red-800">{props.lastError}</dd></div>
          )}
        </dl>

        {props.children}

        <details className="group rounded-lg bg-stone-50 text-sm" open>
          <summary className="flex list-none items-center justify-between gap-2 px-3.5 py-2.5 font-semibold text-stone-800">
            What this can and can&apos;t do
            <Icon name="chevronDown" className="chevron h-4 w-4 text-stone-500 transition-transform" />
          </summary>
          <ul className="list-disc space-y-1 px-3.5 pb-3 pl-8 leading-6 text-stone-600 marker:text-stone-400">
            {LIMITS[props.provider].map((l) => <li key={l}>{l}</li>)}
          </ul>
        </details>

        <div className="mt-auto space-y-2 border-t border-stone-100 pt-4 text-sm">
          <h3 className={ui.h3}>Recent errors</h3>
          {props.errors.length === 0 ? (
            <p className="flex items-center gap-1.5 text-stone-600"><Icon name="checkCircle" className="h-4 w-4 text-emerald-600" />No recent errors.</p>
          ) : (
            <ul className="space-y-1.5">
              {props.errors.map((e) => (
                <li key={e.id} className="flex flex-col gap-0.5 rounded-lg bg-red-50 px-3 py-2 sm:flex-row sm:gap-2">
                  <span className="shrink-0 text-xs text-stone-600"><TimeAgo date={e.createdAt} /> · {e.type}</span>
                  <span className="break-words text-red-900">{e.error}</span>
                </li>
              ))}
            </ul>
          )}
          {props.canSeeHistory && (
            <Link href={`/integrations/history?provider=${props.provider}`} className="inline-flex items-center gap-1 text-sm font-semibold text-emerald-800 hover:underline">
              See full sync history <Icon name="arrowRight" className="h-3.5 w-3.5" />
            </Link>
          )}
        </div>
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
  const ws = await prisma.workspace.findUnique({ where: { id: ctx.workspaceId }, select: { slug: true } });
  const chatUrl = `${base}/api/webhooks/webchat/${ws?.slug ?? ""}`;
  const webchat = byProvider.get("WEBCHAT");
  const chatOn = !webchat || webchat.status !== "NOT_CONNECTED";
  const localUrl = /localhost|127\.0\.0\.1/.test(base);

  return (
    <div className="space-y-6">
      <AutoRefresh seconds={5} />
      <PageHeader
        title="Integrations"
        description={<>Connections to WhatsApp, Stripe, Google Calendar and Telegram for this workspace.{!canManage && " You can view them; ask an admin to change them."}</>}
        actions={<>
          {canSeeHistory && <Link href="/integrations/history" className={ui.btn}><Icon name="history" className="h-4 w-4" />Sync history</Link>}
          {faultLabAllowed(ctx) && <Link href="/integrations/fault-lab" className={ui.btn}><Icon name="flask" className="h-4 w-4" />Fault lab</Link>}
        </>}
      />

      <details className="rounded-xl border border-emerald-200 bg-emerald-50/70 text-sm text-emerald-950" open>
        <summary className="flex list-none items-center justify-between gap-2 px-5 py-3.5 font-bold">
          <span className="flex items-center gap-2"><Icon name="zap" className="h-4 w-4 text-emerald-700" />Try everything in 5 minutes</span>
          <Icon name="chevronDown" className="chevron h-4 w-4 transition-transform" />
        </summary>
        <ol className="list-decimal space-y-1.5 px-5 pb-4 pl-10 leading-6 marker:font-bold marker:text-emerald-700">
          <li><strong>Customer chat:</strong> open the <a className="underline" href={chatUrl} target="_blank" rel="noreferrer">customer chat</a> in a new tab, type a name, phone and message. A lead is created and the customer gets an automatic reply.</li>
          <li><strong>Reply:</strong> open the <Link className="underline" href="/inbox">Inbox</Link>, pick the chat and answer. The reply shows up in the customer&apos;s tab within seconds.</li>
          <li><strong>Escalation:</strong> start a chat and do not answer. After the wait time set in Assignment rules the lead moves to the next person and the customer is told who took over (the worker must be running).</li>
          <li><strong>Payment:</strong> open an opportunity, press <em>Create payment link</em> (needs Stripe below), pay with card 4242 4242 4242 4242 and watch it turn Paid on <Link className="underline" href="/payments">Payments</Link>.</li>
          <li><strong>Appointment:</strong> on <Link className="underline" href="/settings/calendar">My calendar</Link> connect Google (or the demo calendar) and press <em>Check now</em>, then book from an opportunity page.</li>
          <li><strong>Proof:</strong> <Link className="underline" href="/integrations/history">Sync history</Link> lists every message, payment event and calendar call{faultLabAllowed(ctx) ? <>, and the <Link className="underline" href="/integrations/fault-lab">Fault lab</Link> shows duplicates, forged requests and outages being handled</> : ""}.</li>
        </ol>
      </details>

      {localUrl && canManage && (
        <Notice tone="warn" role="note">
          APP_URL is <code>{base}</code>. Twilio and Stripe cannot reach a localhost address.
          Run <code>ngrok http 3000</code> (or deploy) and set APP_URL to the public https URL, then restart the app.
        </Notice>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card title="Website chat (built in)" subtitle="Works right now, no account needed. Customers chat with your team from a link." provider="WEBCHAT"
          status={chatOn ? "CONNECTED" : "NOT_CONNECTED"} lastSuccessAt={webchat?.lastSuccessAt} lastError={null} errors={errorsFor("WEBCHAT")} canSeeHistory={canSeeHistory}
          chip={chatOn ? <Chip tone="ok">On</Chip> : <Chip tone="off">Turned off</Chip>}>
          <div className="space-y-2">
            <CopyField label="Customer chat link (share this)" value={chatUrl} hint={chatOn ? "Open it in another browser tab or on your phone to play the customer." : "The chat is turned off, so this link shows “Chat is not available”."} />
            <div className="flex flex-wrap gap-2">
              {chatOn && <a href={chatUrl} target="_blank" rel="noreferrer" className={ui.btnPrimary}><Icon name="external" className="h-4 w-4" />Open the customer chat</a>}
              <Link href="/inbox" className={ui.btn}><Icon name="inbox" className="h-4 w-4" />Open the Inbox</Link>
              {canManage && <WebchatToggle on={chatOn} />}
            </div>
          </div>
        </Card>

        <Card title="WhatsApp (Meta Cloud API)" subtitle="Optional. Free from Meta, needs a Facebook developer account. Receive WhatsApp messages as leads." provider="META"
          status={meta?.status ?? "NOT_CONNECTED"} lastSuccessAt={meta?.lastSuccessAt} lastError={meta?.lastError} errors={errorsFor("META")} canSeeHistory={canSeeHistory}>
          {metaOn && (
            <dl className="grid grid-cols-1 gap-1.5 rounded-lg border border-stone-200 p-3 text-sm sm:grid-cols-2">
              <div><dt className="inline text-stone-500">Number: </dt><dd className="inline font-mono">{metaCfg.displayPhone ?? "—"}</dd></div>
              <div><dt className="inline text-stone-500">Name: </dt><dd className="inline">{metaCfg.verifiedName ?? "—"}</dd></div>
              <div><dt className="inline text-stone-500">Phone number ID: </dt><dd className="inline font-mono">{metaCfg.phoneNumberId}</dd></div>
              <div><dt className="inline text-stone-500">Access token: </dt><dd className="inline font-mono">{metaCfg.accessTokenMasked}</dd></div>
              <div><dt className="inline text-stone-500">App secret: </dt><dd className="inline font-mono">{metaCfg.appSecretMasked}</dd></div>
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
            <p className="text-sm text-stone-500">Read only: you need the “Connect, change or remove integrations” permission to change this.</p>
          )}
          {canManage && metaOn && (
            <div className="flex flex-wrap gap-2"><TestButton provider="META" /><DisconnectButton provider="META" label="WhatsApp (Meta)" /></div>
          )}
        </Card>

        <Card title="WhatsApp (Twilio) — alternative" subtitle={metaOn ? "Optional. Not used while WhatsApp (Meta) is connected." : "Optional. Twilio account needed; the website chat works without it."} provider="TWILIO"
          status={twilio?.status ?? "NOT_CONNECTED"} lastSuccessAt={twilio?.lastSuccessAt} lastError={twilio?.lastError} errors={errorsFor("TWILIO")} canSeeHistory={canSeeHistory}>
          {twilio?.status && twilio.status !== "NOT_CONNECTED" && (
            <dl className="grid grid-cols-1 gap-1.5 rounded-lg border border-stone-200 p-3 text-sm sm:grid-cols-2">
              <div><dt className="inline text-stone-500">Account SID: </dt><dd className="inline font-mono">{twilioCfg.accountSidMasked}</dd></div>
              <div><dt className="inline text-stone-500">Auth Token: </dt><dd className="inline font-mono">{twilioCfg.authTokenMasked}</dd></div>
              <div><dt className="inline text-stone-500">Sandbox number: </dt><dd className="inline font-mono">{twilioCfg.fromNumber}</dd></div>
              {twilioCfg.joinCode && <div><dt className="inline text-stone-500">Join phrase: </dt><dd className="inline font-mono">{twilioCfg.joinCode}</dd></div>}
            </dl>
          )}
          {canManage && (twilio ? (
            <div className="space-y-2">
              <CopyField label="Webhook URL (paste into Twilio → Messaging → WhatsApp sandbox settings → “When a message comes in”, method POST)"
                value={webhookUrl("twilio", twilio.id)} />
              <p className={ui.hint}>Delivery status callbacks are set automatically on every message we send.</p>
            </div>
          ) : (
            <PrepareWebhookButton provider="TWILIO" />
          ))}
          {canManage ? (
            <TwilioForm connected={twilio?.status === "CONNECTED" || twilio?.status === "ERROR"}
              initial={{ fromNumber: twilioCfg.fromNumber ?? "whatsapp:+14155238886", joinCode: twilioCfg.joinCode ?? "" }} />
          ) : (
            <p className="text-sm text-stone-500">Read only: you need the “Connect, change or remove integrations” permission to change this.</p>
          )}
          {canManage && twilio && twilio.status !== "NOT_CONNECTED" && (
            <div className="flex flex-wrap gap-2"><TestButton provider="TWILIO" /><DisconnectButton provider="TWILIO" label="Twilio" /></div>
          )}
        </Card>

        <Card title="Payments (Stripe)" subtitle="Payment links for opportunities; status updates arrive by webhook." provider="STRIPE"
          status={stripe?.status ?? "NOT_CONNECTED"} lastSuccessAt={stripe?.lastSuccessAt} lastError={stripe?.lastError} errors={errorsFor("STRIPE")} canSeeHistory={canSeeHistory}>
          {stripe?.status && stripe.status !== "NOT_CONNECTED" && (
            <dl className="grid grid-cols-1 gap-1.5 rounded-lg border border-stone-200 p-3 text-sm sm:grid-cols-2">
              <div><dt className="inline text-stone-500">Secret key: </dt><dd className="inline font-mono">{stripeCfg.secretKeyMasked}</dd></div>
              <div><dt className="inline text-stone-500">Signing secret: </dt><dd className="inline font-mono">{stripeCfg.webhookSecretMasked}</dd></div>
            </dl>
          )}
          {canManage && (stripe ? (
            <div className="space-y-2 text-sm">
              <CopyField label="Webhook endpoint URL (Stripe → Developers → Webhooks → Add endpoint)" value={webhookUrl("stripe", stripe.id)} />
              <p className={ui.hint}>
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
            <p className="text-sm text-stone-500">Read only: you need the “Connect, change or remove integrations” permission to change this.</p>
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
            <Link href="/settings/calendar" className={ui.link}>Connect or check your own calendar</Link>
          </p>
          {canManage && (
            <div className="overflow-hidden rounded-lg border border-stone-200">
              <table className="w-full text-left text-sm">
                <caption className="sr-only">Calendar connection by employee</caption>
                <thead className="bg-stone-50"><tr><th scope="col" className={`${ui.th} !px-3`}>Employee</th><th scope="col" className={`${ui.th} !px-3`}>Calendar</th></tr></thead>
                <tbody>
                  {users.map((u) => {
                    const c = calBy.get(u.id);
                    return (
                      <tr key={u.id} className="border-t border-stone-100">
                        <td className="px-3 py-2.5"><span className="block font-semibold text-stone-900">{u.name}</span>{c?.googleEmail && <span className="block break-all text-xs text-stone-600">{c.googleEmail}</span>}</td>
                        <td className="px-3 py-2.5">
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
