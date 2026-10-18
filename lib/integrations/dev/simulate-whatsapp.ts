// P3 owns. DEV ONLY: pretend to be Twilio, so the WhatsApp flow can be tested without a Twilio account.
// It signs requests exactly like Twilio does (with the workspace's saved Auth Token), so the real
// signature check, dedupe and lead creation all run.
//
//   npx tsx --env-file=.env lib/integrations/dev/simulate-twilio.ts setup [workspace-slug]
//   npx tsx --env-file=.env lib/integrations/dev/simulate-twilio.ts message +923001234567 "Hi, need a quote" "Ahmed Raza"
//   npx tsx --env-file=.env lib/integrations/dev/simulate-twilio.ts duplicate      (re-sends the last message: must be ignored)
//   npx tsx --env-file=.env lib/integrations/dev/simulate-twilio.ts forged         (bad signature: must get 403)
//   npx tsx --env-file=.env lib/integrations/dev/simulate-twilio.ts status <messageId> delivered|read|failed [errorCode]
//
// The app must be running (npm run dev). Requests go to http://localhost:3000 (override with SIM_TARGET).
import { readFileSync, writeFileSync, existsSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { randomBytes } from "crypto";
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
const STATE = join(tmpdir(), "amanat-twilio-sim.json");
type State = { integrationId: string; last?: Record<string, string> };

const sid = (p: string) => p + randomBytes(16).toString("hex");
const load = (): State => {
  if (!existsSync(STATE)) throw new Error("Run `setup` first.");
  return JSON.parse(readFileSync(STATE, "utf8"));
};

async function post(integrationId: string, suffix: string, params: Record<string, string>, forge = false) {
  const i = await prisma.integration.findUniqueOrThrow({ where: { id: integrationId } });
  const { authToken } = decryptJson<{ authToken: string }>(i.secrets!);
  const signedUrl = `${APP_URL}/api/webhooks/twilio/${integrationId}${suffix}`;
  const signature = forge ? "Zm9yZ2VkLXNpZ25hdHVyZQ==" : twilio.getExpectedTwilioSignature(authToken, signedUrl, params);
  const r = await fetch(`${TARGET}/api/webhooks/twilio/${integrationId}${suffix}`, {
    method: "POST",
    headers: { "X-Twilio-Signature": signature, "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(params),
  });
  console.log(`→ ${r.status} ${(await r.text()).slice(0, 100) || "(empty)"}`);
}

async function main() {
  const [cmd, ...a] = process.argv.slice(2);
  if (cmd === "setup") {
    const ws = await prisma.workspace.findUniqueOrThrow({ where: { slug: a[0] ?? "sunrise-solar" } });
    const existing = await prisma.integration.findUnique({ where: { workspaceId_provider: { workspaceId: ws.id, provider: "TWILIO" } } });
    if (existing?.status === "CONNECTED" && !(existing.publicConfig as { simulated?: boolean })?.simulated) {
      console.log("This workspace already has REAL Twilio credentials. Not touching them.");
    } else {
      const fake = { accountSid: "AC" + "0".repeat(32), authToken: randomBytes(16).toString("hex") };
      await prisma.integration.upsert({
        where: { workspaceId_provider: { workspaceId: ws.id, provider: "TWILIO" } },
        create: { workspaceId: ws.id, provider: "TWILIO", status: "CONNECTED", secrets: encryptJson(fake), publicConfig: { simulated: true, fromNumber: "whatsapp:+14155238886", joinCode: "join simulated-test", accountSidMasked: "AC••••0000 (simulated)", authTokenMasked: "••••sim" } },
        update: { status: "CONNECTED", secrets: encryptJson(fake), publicConfig: { simulated: true, fromNumber: "whatsapp:+14155238886", joinCode: "join simulated-test", accountSidMasked: "AC••••0000 (simulated)", authTokenMasked: "••••sim" } },
      });
    }
    const i = await prisma.integration.findUniqueOrThrow({ where: { workspaceId_provider: { workspaceId: ws.id, provider: "TWILIO" } } });
    writeFileSync(STATE, JSON.stringify({ integrationId: i.id } satisfies State));
    console.log(`Ready. Workspace ${ws.slug}, integration ${i.id}.`);
    console.log("Note: replies you send will fail (fake credentials). That is expected and shows the failure handling.");
    return;
  }
  const s = load();
  if (cmd === "message") {
    const [phone, body = "Hi, I need a quote", name = ""] = a;
    if (!phone) throw new Error('Usage: message +923001234567 "text" "Name"');
    const params = { MessageSid: sid("SM"), AccountSid: "AC" + "0".repeat(32), From: `whatsapp:${phone}`, To: "whatsapp:+14155238886", Body: body, NumMedia: "0", ...(name ? { ProfileName: name } : {}) };
    await post(s.integrationId, "", params);
    writeFileSync(STATE, JSON.stringify({ ...s, last: params }));
  } else if (cmd === "duplicate") {
    if (!s.last) throw new Error("Send a `message` first.");
    await post(s.integrationId, "", s.last);
  } else if (cmd === "forged") {
    await post(s.integrationId, "", { MessageSid: sid("SM"), From: "whatsapp:+923000000000", Body: "forged" }, true);
  } else if (cmd === "status") {
    const [messageId, status = "delivered", code] = a;
    const m = await prisma.message.findUniqueOrThrow({ where: { id: messageId } });
    const providerSid = m.providerSid ?? sid("SM");
    await post(s.integrationId, `/status?m=${messageId}`, { MessageSid: providerSid, MessageStatus: status, ...(code ? { ErrorCode: code } : {}) });
  } else {
    console.log("Commands: setup | message <phone> <text> [name] | duplicate | forged | status <messageId> <status> [errorCode]");
  }
}

main()
  .catch((e) => { console.error(e.message); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
