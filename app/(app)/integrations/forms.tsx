"use client";
// P3 owns. Client forms on the Integrations page. Secrets are typed in here and sent to the server once;
// the server never sends them back (only masked values).
import { useId, useState } from "react";
import { useRouter } from "next/navigation";
import { useRun } from "@/lib/integrations/ui/useRun";
import { Spinner } from "@/lib/integrations/ui/Spinner";
import { Icon } from "@/components/ui/Icon";
import { ui } from "@/components/ui/styles";
import { disconnectAction, prepareWebhookAction, saveMetaAction, saveStripeAction, saveTwilioAction, setWebchatAction, testConnectionAction } from "./actions";

const input = ui.input;
const primary = ui.btnPrimary;
const secondary = ui.btn;
const danger = ui.btnDanger;

function Field(props: { label: string; name: string; type?: string; placeholder?: string; defaultValue?: string; hint?: string; autoComplete?: string }) {
  const id = useId();
  return (
    <div className={ui.field}>
      <label htmlFor={id} className={ui.label}>{props.label}</label>
      <input id={id} name={props.name} type={props.type ?? "text"} placeholder={props.placeholder} defaultValue={props.defaultValue}
        autoComplete={props.autoComplete ?? "off"} spellCheck={false} className={input} aria-describedby={props.hint ? `${id}-h` : undefined} />
      {props.hint && <p id={`${id}-h`} className={ui.hint}>{props.hint}</p>}
    </div>
  );
}

export function TwilioForm({ connected, initial }: { connected: boolean; initial: { fromNumber: string; joinCode: string } }) {
  const [open, setOpen] = useState(!connected);
  const { pending, run } = useRun();
  const router = useRouter();
  if (!open) return <button type="button" className={secondary} onClick={() => setOpen(true)}><Icon name="pencil" className="h-4 w-4" />Edit Twilio settings</button>;
  return (
    <form
      className="space-y-4 rounded-xl border border-stone-200 bg-stone-50/60 p-4"
      onSubmit={async (e) => {
        e.preventDefault();
        const form = e.currentTarget;
        const data = Object.fromEntries(new FormData(form));
        const r = await run("save", () => saveTwilioAction(data));
        if (r.ok) { form.reset(); setOpen(false); router.refresh(); }
      }}
    >
      <p className="text-sm text-stone-600">Find these on the Twilio console home page. We check them with Twilio before saving.</p>
      <Field label="Account SID" name="accountSid" placeholder="AC…" hint="Starts with AC, 34 characters." />
      <Field label="Auth Token" name="authToken" type="password" placeholder={connected ? "Leave blank to keep the saved token" : "32 characters"}
        hint="Stored encrypted. It is never shown again." autoComplete="new-password" />
      <Field label="WhatsApp sandbox number" name="fromNumber" defaultValue={initial.fromNumber} hint="From Twilio → Messaging → Try it out → WhatsApp. Usually whatsapp:+14155238886." />
      <Field label="Sandbox join phrase (optional)" name="joinCode" defaultValue={initial.joinCode} placeholder="join happy-tiger" hint="Shown to staff so they can tell customers how to join the sandbox." />
      <div className="flex flex-wrap gap-2">
        <button type="submit" className={primary} disabled={!!pending}>{pending && <Spinner />}{pending ? "Checking with Twilio…" : connected ? "Save changes" : "Connect Twilio"}</button>
        {connected && <button type="button" className={secondary} onClick={() => setOpen(false)}>Cancel</button>}
      </div>
    </form>
  );
}

export function MetaForm({ connected, initial }: { connected: boolean; initial: { phoneNumberId: string; wabaId: string } }) {
  const [open, setOpen] = useState(!connected);
  const { pending, run } = useRun();
  const router = useRouter();
  if (!open) return <button type="button" className={secondary} onClick={() => setOpen(true)}><Icon name="pencil" className="h-4 w-4" />Edit WhatsApp settings</button>;
  return (
    <form
      className="space-y-4 rounded-xl border border-stone-200 bg-stone-50/60 p-4"
      onSubmit={async (e) => {
        e.preventDefault();
        const form = e.currentTarget;
        const r = await run("save", () => saveMetaAction(Object.fromEntries(new FormData(form))));
        if (r.ok) { form.reset(); setOpen(false); router.refresh(); }
      }}
    >
      <p className="text-sm text-stone-600">From developers.facebook.com → your app → WhatsApp → API Setup. We check them with Meta before saving.</p>
      <Field label="Phone number ID" name="phoneNumberId" defaultValue={initial.phoneNumberId} hint="Under “From” on the API Setup page (not the phone number itself)." />
      <Field label="WhatsApp Business Account ID (optional)" name="wabaId" defaultValue={initial.wabaId} />
      <Field label="Access token" name="accessToken" type="password" placeholder={connected ? "Leave blank to keep the saved token" : "EAA…"}
        hint="The temporary token lasts 24 hours. For the demo, create a permanent System User token (see README)." autoComplete="new-password" />
      <Field label="App secret" name="appSecret" type="password" placeholder={connected ? "Leave blank to keep the saved secret" : "32 characters"}
        hint="App settings → Basic → App secret. Used to check that webhooks really come from Meta." autoComplete="new-password" />
      <div className="flex flex-wrap gap-2">
        <button type="submit" className={primary} disabled={!!pending}>{pending && <Spinner />}{pending ? "Checking with Meta…" : connected ? "Save changes" : "Connect WhatsApp"}</button>
        {connected && <button type="button" className={secondary} onClick={() => setOpen(false)}>Cancel</button>}
      </div>
    </form>
  );
}

export function StripeForm({ connected }: { connected: boolean }) {
  const [open, setOpen] = useState(!connected);
  const { pending, run } = useRun();
  const router = useRouter();
  if (!open) return <button type="button" className={secondary} onClick={() => setOpen(true)}><Icon name="pencil" className="h-4 w-4" />Edit Stripe settings</button>;
  return (
    <form
      className="space-y-4 rounded-xl border border-stone-200 bg-stone-50/60 p-4"
      onSubmit={async (e) => {
        e.preventDefault();
        const form = e.currentTarget;
        const r = await run("save", () => saveStripeAction(Object.fromEntries(new FormData(form))));
        if (r.ok) { form.reset(); setOpen(false); router.refresh(); }
      }}
    >
      <p className="text-sm text-stone-600">Use Stripe in <strong>test mode</strong>. Live keys are refused.</p>
      <Field label="Secret key" name="secretKey" type="password" placeholder={connected ? "Leave blank to keep the saved key" : "sk_test_…"}
        hint="Stripe → Developers → API keys. Stored encrypted." autoComplete="new-password" />
      <Field label="Webhook signing secret" name="webhookSecret" type="password" placeholder={connected ? "Leave blank to keep the saved secret" : "whsec_…"}
        hint="Shown after you add the webhook endpoint in Stripe." autoComplete="new-password" />
      <div className="flex flex-wrap gap-2">
        <button type="submit" className={primary} disabled={!!pending}>{pending && <Spinner />}{pending ? "Checking with Stripe…" : connected ? "Save changes" : "Connect Stripe"}</button>
        {connected && <button type="button" className={secondary} onClick={() => setOpen(false)}>Cancel</button>}
      </div>
    </form>
  );
}

export function PrepareWebhookButton({ provider }: { provider: "TWILIO" | "STRIPE" | "META" }) {
  const { pending, run } = useRun();
  const router = useRouter();
  return (
    <div className="space-y-2 text-sm">
      <p className="text-stone-600">Need the webhook URL before connecting? Create it now.</p>
      <button type="button" className={secondary} disabled={!!pending}
        onClick={() => run("prep", () => prepareWebhookAction(provider), { onOk: () => router.refresh() })}>
        {pending && <Spinner />}Show webhook URL
      </button>
    </div>
  );
}

export function TestButton({ provider }: { provider: "TWILIO" | "STRIPE" | "META" }) {
  const { pending, run } = useRun();
  const router = useRouter();
  return (
    <button type="button" className={secondary} disabled={!!pending}
      onClick={() => run("test", () => testConnectionAction(provider)).then(() => router.refresh())}>
      {pending ? <Spinner /> : <Icon name="refresh" className="h-4 w-4" />}{pending ? "Testing…" : "Test connection"}
    </button>
  );
}

export function DisconnectButton({ provider, label }: { provider: "TWILIO" | "STRIPE" | "META"; label: string }) {
  const { pending, run } = useRun();
  const router = useRouter();
  return (
    <button type="button" className={danger} disabled={!!pending}
      onClick={() => {
        if (!confirm(`Disconnect ${label}? The saved credentials will be deleted and it will stop working until reconnected.`)) return;
        run("disc", () => disconnectAction(provider), { onOk: () => router.refresh() });
      }}>
      {pending ? <Spinner /> : <Icon name="power" className="h-4 w-4" />}Disconnect
    </button>
  );
}

export function WebchatToggle({ on }: { on: boolean }) {
  const { pending, run } = useRun();
  const router = useRouter();
  return (
    <button type="button" disabled={!!pending} className={on ? danger : secondary}
      onClick={() => {
        if (on && !confirm("Turn off the website chat? Customers who open the link will see “Chat is not available”. Existing chats stay in the Inbox.")) return;
        run("toggle", () => setWebchatAction(!on), { onOk: () => router.refresh() });
      }}>
      {pending && <Spinner />}{on ? "Turn off" : "Turn on"}
    </button>
  );
}
