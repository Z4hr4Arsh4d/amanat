"use client";
// P3 owns. Client forms on the Integrations page. Secrets are typed in here and sent to the server once;
// the server never sends them back (only masked values).
import { useId, useState } from "react";
import { useRouter } from "next/navigation";
import { useRun } from "@/lib/integrations/ui/useRun";
import { Spinner } from "@/lib/integrations/ui/Spinner";
import { disconnectAction, prepareWebhookAction, saveMetaAction, saveStripeAction, saveTwilioAction, setWebchatAction, testConnectionAction } from "./actions";

const input = "w-full min-w-0 rounded border border-stone-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-700";
const btn = "inline-flex items-center gap-2 rounded px-3 py-2 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-emerald-700 disabled:opacity-60";
const primary = `${btn} bg-emerald-800 text-white hover:bg-emerald-900`;
const secondary = `${btn} border border-stone-300 bg-white hover:bg-stone-100`;
const danger = `${btn} border border-red-300 bg-white text-red-800 hover:bg-red-50`;

function Field(props: { label: string; name: string; type?: string; placeholder?: string; defaultValue?: string; hint?: string; autoComplete?: string }) {
  const id = useId();
  return (
    <div className="space-y-1">
      <label htmlFor={id} className="block text-sm font-medium">{props.label}</label>
      <input id={id} name={props.name} type={props.type ?? "text"} placeholder={props.placeholder} defaultValue={props.defaultValue}
        autoComplete={props.autoComplete ?? "off"} spellCheck={false} className={input} aria-describedby={props.hint ? `${id}-h` : undefined} />
      {props.hint && <p id={`${id}-h`} className="text-xs text-stone-600">{props.hint}</p>}
    </div>
  );
}

export function TwilioForm({ connected, initial }: { connected: boolean; initial: { fromNumber: string; joinCode: string } }) {
  const [open, setOpen] = useState(!connected);
  const { pending, run } = useRun();
  const router = useRouter();
  if (!open) return <button type="button" className={secondary} onClick={() => setOpen(true)}>Edit Twilio settings</button>;
  return (
    <form
      className="space-y-3 rounded border border-stone-200 p-3"
      onSubmit={async (e) => {
        e.preventDefault();
        const form = e.currentTarget;
        const data = Object.fromEntries(new FormData(form));
        const r = await run("save", () => saveTwilioAction(data));
        if (r.ok) { form.reset(); setOpen(false); router.refresh(); }
      }}
    >
      <p className="text-sm text-stone-700">Find these on the Twilio console home page. We check them with Twilio before saving.</p>
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
  if (!open) return <button type="button" className={secondary} onClick={() => setOpen(true)}>Edit WhatsApp settings</button>;
  return (
    <form
      className="space-y-3 rounded border border-stone-200 p-3"
      onSubmit={async (e) => {
        e.preventDefault();
        const form = e.currentTarget;
        const r = await run("save", () => saveMetaAction(Object.fromEntries(new FormData(form))));
        if (r.ok) { form.reset(); setOpen(false); router.refresh(); }
      }}
    >
      <p className="text-sm text-stone-700">From developers.facebook.com → your app → WhatsApp → API Setup. We check them with Meta before saving.</p>
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
  if (!open) return <button type="button" className={secondary} onClick={() => setOpen(true)}>Edit Stripe settings</button>;
  return (
    <form
      className="space-y-3 rounded border border-stone-200 p-3"
      onSubmit={async (e) => {
        e.preventDefault();
        const form = e.currentTarget;
        const r = await run("save", () => saveStripeAction(Object.fromEntries(new FormData(form))));
        if (r.ok) { form.reset(); setOpen(false); router.refresh(); }
      }}
    >
      <p className="text-sm text-stone-700">Use Stripe in <strong>test mode</strong>. Live keys are refused.</p>
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
    <div className="space-y-1 text-sm">
      <p className="text-stone-700">Need the webhook URL before connecting? Create it now.</p>
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
      {pending && <Spinner />}{pending ? "Testing…" : "Test connection"}
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
      {pending && <Spinner />}Disconnect
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
