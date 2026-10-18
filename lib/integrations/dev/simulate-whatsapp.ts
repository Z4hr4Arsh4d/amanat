// P3 owns. DEV ONLY: pretend to be WhatsApp (Meta Cloud API or Twilio), so the whole flow can be tested
// without any account. Requests are signed exactly like the real provider signs them, so the real
// signature check, dedupe, contact matching and lead creation all run.
//
//   npx tsx --env-file=.env lib/integrations/dev/simulate-whatsapp.ts setup [meta|twilio] [workspace-slug]
//   npx tsx --env-file=.env lib/integrations/dev/simulate-whatsapp.ts message +923001234567 "Hi, need a quote" "Ahmed Raza"
//   npx tsx --env-file=.env lib/integrations/dev/simulate-whatsapp.ts duplicate      (re-sends the last message: ignored)
//   npx tsx --env-file=.env lib/integrations/dev/simulate-whatsapp.ts forged         (bad signature: 403, logged, audited)
//   npx tsx --env-file=.env lib/integrations/dev/simulate-whatsapp.ts status <messageId> delivered|read|failed [errorCode]
//
// The app must be running (npm run dev). Requests go to http://localhost:3000 (override with SIM_TARGET).
import { readFileSync, writeFileSync, existsSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { createHmac, randomBytes } from "crypto";
import twilio from "twilio";
import { PrismaClient } from "@prisma/client";
import { decryptJson, encryptJson } from "../secrets";

if (process.env.NODE_ENV === "production") {
  console.error("The simulator is for development only.");
  process.exit(1);
}

const prisma = new PrismaClient();
const APP_URL = (process.env.APP_URL ?? "http://localhost:3000").replace(/\/+$/, "");
const TARGET = (process.env.SIM_TARGET ?? "http://localhost:3000").replace(/\/+$/, "");
const STATE = join(tmpdir(), "amanat-whatsapp-sim.json");
type Kind = "meta" | "twilio";
type State = { integrationId: string; kind: Kind; phoneNumberId?: string; last?: unknown };

const rand = (p: string) => p + randomBytes(16).toString("hex");
const load = (): State => {
  if (!existsSync(STATE)) throw new Error("Run `setup` first.");
  return JSON.parse(readFileSync(STATE, "utf8"));
};
const save = (s: State) => writeFileSync(STATE, JSON.stringify(s));

async function secretOf(id: string) {
  const i = await prisma.integration.findUniqueOrThrow({ where: { id } });
  return decryptJson<Record<string, string>>(i.secrets!);
}

async function send(r: Response) {
  console.log(`→ ${r.status} ${(await r.text()).slice(0, 100) || "(empty)"}`);
}

async function postTwilio(s: State, suffix: string, params: Record<string, string>, forge = false) {
  const { authToken } = await secretOf(s.integrationId);
  const signedUrl = `${APP_URL}/api/webhooks/twilio/${s.integrationId}${suffix}`;
  const signature = forge ? "Zm9yZ2Vk" : twilio.getExpectedTwilioSignature(authToken, signedUrl, params);
  await send(await fetch(`${TARGET}/api/webhooks/twilio/${s.integrationId}${suffix}`, {
    method: "POST", headers: { "X-Twilio-Signature": signature, "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams(params),
  }));
}

async function postMeta(s: State, value: Record<string, unknown>, forge = false) {
  const { appSecret } = await secretOf(s.integrationId);
  const body = JSON.stringify({
    object: "whatsapp_business_account",
    entry: [{ id: "WABA_SIM", changes: [{ field: "messages", value: { messaging_product: "whatsapp", metadata: { display_phone_number: "15550000000", phone_number_id: s.phoneNumberId }, ...value } }] }],
  });
  const sig = "sha256=" + createHmac("sha256", forge ? "wrong-secret" : appSecret).update(body).digest("hex");
  await send(await fetch(`${TARGET}/api/webhooks/whatsapp/${s.integrationId}`, { method: "POST", headers: { "X-Hub-Signature-256": sig, "Content-Type": "application/json" }, body }));
}

async function main() {
  const [cmd, ...a] = process.argv.slice(2);
  if (cmd === "setup") {
    const kind: Kind = a[0] === "twilio" ? "twilio" : "meta";
    const ws = await prisma.workspace.findUniqueOrThrow({ where: { slug: a[1] ?? "sunrise-solar" } });
    const provider = kind === "meta" ? "META" : "TWILIO";
    const existing = await prisma.integration.findUnique({ where: { workspaceId_provider: { workspaceId: ws.id, provider } } });
    const real = existing?.status === "CONNECTED" && !(existing.publicConfig as { simulated?: boolean })?.simulated;
    if (real) {
      console.log(`This workspace already has REAL ${provider} credentials. Not touching them.`);
    } else {
      const phoneNumberId = "100000000000001";
      const data = kind === "meta"
        ? { secrets: encryptJson({ accessToken: "EAA" + "x".repeat(40), appSecret: randomBytes(16).toString("hex") }),
            publicConfig: { simulated: true, phoneNumberId, displayPhone: "+1 555 000 0000 (simulated)", verifiedName: "Simulated test number", accessTokenMasked: "EA••••sim", appSecretMasked: "••••sim" } }
        : { secrets: encryptJson({ accountSid: "AC" + "0".repeat(32), authToken: randomBytes(16).toString("hex") }),
            publicConfig: { simulated: true, fromNumber: "whatsapp:+14155238886", joinCode: "join simulated-test", accountSidMasked: "AC••••0000 (simulated)", authTokenMasked: "••••sim" } };
      await prisma.integration.upsert({
        where: { workspaceId_provider: { workspaceId: ws.id, provider } },
        create: { workspaceId: ws.id, provider, status: "CONNECTED", ...data },
        update: { status: "CONNECTED", ...data },
      });
    }
    const i = await prisma.integration.findUniqueOrThrow({ where: { workspaceId_provider: { workspaceId: ws.id, provider } } });
    save({ integrationId: i.id, kind, phoneNumberId: (i.publicConfig as { phoneNumberId?: string }).phoneNumberId });
    console.log(`Ready: simulated ${provider} for workspace ${ws.slug} (integration ${i.id}).`);
    console.log("Replies you send from the Inbox will fail (fake credentials). That is expected: it shows the retry + failure handling.");
    return;
  }
  const s = load();
  if (cmd === "message") {
    const [phone, body = "Hi, I need a quote", name = ""] = a;
    if (!phone?.startsWith("+")) throw new Error('Usage: message +923001234567 "text" "Name"');
    if (s.kind === "twilio") {
      const p = { MessageSid: rand("SM"), From: `whatsapp:${phone}`, To: "whatsapp:+14155238886", Body: body, NumMedia: "0", ...(name ? { ProfileName: name } : {}) };
      await postTwilio(s, "", p);
      save({ ...s, last: p });
    } else {
      const wa = phone.slice(1);
      const v = { contacts: [{ wa_id: wa, profile: { name: name || wa } }], messages: [{ from: wa, id: rand("wamid.SIM"), timestamp: String(Math.floor(Date.now() / 1000)), type: "text", text: { body } }] };
      await postMeta(s, v);
      save({ ...s, last: v });
    }
  } else if (cmd === "duplicate") {
    if (!s.last) throw new Error("Send a `message` first.");
    if (s.kind === "twilio") await postTwilio(s, "", s.last as Record<string, string>);
    else await postMeta(s, s.last as Record<string, unknown>);
  } else if (cmd === "forged") {
    if (s.kind === "twilio") await postTwilio(s, "", { MessageSid: rand("SM"), From: "whatsapp:+923000000000", Body: "forged" }, true);
    else await postMeta(s, { messages: [{ from: "923000000000", id: rand("wamid.FORGED"), type: "text", text: { body: "forged" } }] }, true);
  } else if (cmd === "status") {
    const [messageId, status = "delivered", code] = a;
    const m = await prisma.message.findUniqueOrThrow({ where: { id: messageId } });
    const sid = m.providerSid ?? rand(s.kind === "twilio" ? "SM" : "wamid.SIM");
    if (!m.providerSid) await prisma.message.update({ where: { id: m.id }, data: { providerSid: sid } }); // pretend the provider accepted it
    if (s.kind === "twilio") await postTwilio(s, `/status?m=${messageId}`, { MessageSid: sid, MessageStatus: status, ...(code ? { ErrorCode: code } : {}) });
    else await postMeta(s, { statuses: [{ id: sid, status, timestamp: String(Math.floor(Date.now() / 1000)), recipient_id: "923000000000", ...(code ? { errors: [{ code: Number(code), title: "Simulated error" }] } : {}) }] });
  } else {
    console.log("Commands: setup [meta|twilio] [slug] | message <+phone> <text> [name] | duplicate | forged | status <messageId> <status> [errorCode]");
  }
}

main()
  .catch((e) => { console.error(e.message); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
