// P2 owns. Telegram webhook. Steps: 1) verify secret header  2) dedupe by update id  3) process  4) log IntegrationEvent.
// Webhooks are exempt from the Origin check in middleware.ts; the secret header is our proof the call is from Telegram.
import { timingSafeEqual } from "crypto";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { decryptJson } from "@/lib/integrations/secrets";
import { acknowledge } from "@/lib/leads/acknowledge";
import { tgCall } from "@/lib/notify/telegram";

const Update = z.object({
  update_id: z.number(),
  message: z.object({ chat: z.object({ id: z.number() }), text: z.string().optional() }).optional(),
  callback_query: z.object({
    id: z.string(),
    data: z.string().optional(),
    message: z.object({ message_id: z.number(), chat: z.object({ id: z.number() }) }).optional(),
  }).optional(),
});

const same = (a: string, b: string) => {
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};

const clock = (tz: string) => new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: tz }).format(new Date());

export async function POST(req: Request, { params }: { params: Promise<{ integrationId: string }> }) {
  const { integrationId } = await params;
  const integration = await prisma.integration.findFirst({ where: { id: integrationId, provider: "TELEGRAM" } });
  if (!integration?.secrets) return new Response("Not found", { status: 404 });

  let creds: { botToken: string; webhookSecret: string };
  try {
    creds = decryptJson(integration.secrets);
  } catch {
    return new Response("Not available", { status: 503 });
  }

  // 1) Signature first: nothing is read or written before this passes.
  const header = req.headers.get("x-telegram-bot-api-secret-token") ?? "";
  if (!same(header, creds.webhookSecret)) {
    await prisma.integrationEvent.create({
      data: { workspaceId: integration.workspaceId, provider: "TELEGRAM", direction: "IN", type: "telegram.update", status: "REJECTED", error: "Wrong or missing secret token", payload: {} },
    }).catch(() => undefined);
    return new Response("Unauthorized", { status: 401 });
  }

  const parsed = Update.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return new Response("ok", { status: 200 }); // nothing we understand; don't make Telegram retry
  const update = parsed.data;

  // 2) Dedupe on the update id (scoped to this bot, because ids repeat across bots).
  let eventId: string;
  try {
    const ev = await prisma.integrationEvent.create({
      data: {
        workspaceId: integration.workspaceId, provider: "TELEGRAM", direction: "IN", status: "RECEIVED",
        type: update.callback_query ? "telegram.callback" : "telegram.message",
        externalId: `${integration.id}:${update.update_id}`, payload: { updateId: update.update_id },
      },
    });
    eventId = ev.id;
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") return new Response("ok", { status: 200 });
    throw e;
  }

  // 3) Process. Always answer 200 afterwards so Telegram does not keep retrying.
  const token = creds.botToken;
  const ws = integration.workspaceId;
  try {
    if (update.message?.text?.startsWith("/start")) {
      const chatId = update.message.chat.id;
      const linkToken = update.message.text.split(/\s+/)[1];
      const user = linkToken ? await prisma.user.findFirst({ where: { workspaceId: ws, telegramLinkToken: linkToken, isActive: true } }) : null;
      if (user) {
        await prisma.user.updateMany({ where: { id: user.id, workspaceId: ws }, data: { telegramChatId: String(chatId), telegramLinkToken: null } });
        await tgCall(token, "sendMessage", { chat_id: chatId, text: "Connected to Amanat ✅" });
      } else {
        await tgCall(token, "sendMessage", { chat_id: chatId, text: "That link has expired. Open Amanat and press Connect Telegram again." });
      }
    } else if (update.callback_query?.data?.startsWith("ack:")) {
      const cq = update.callback_query;
      const leadId = cq.data!.slice(4);
      const chatId = cq.message?.chat.id;
      const user = chatId ? await prisma.user.findFirst({ where: { workspaceId: ws, telegramChatId: String(chatId), isActive: true } }) : null;
      if (!user) {
        await tgCall(token, "answerCallbackQuery", { callback_query_id: cq.id, text: "This Telegram account is not linked to Amanat.", show_alert: true });
      } else {
        const r = await acknowledge({ workspaceId: ws, leadId, userId: user.id });
        await tgCall(token, "answerCallbackQuery", { callback_query_id: cq.id, text: r.ok ? "Acknowledged ✅" : r.message });
        if (cq.message) {
          await tgCall(token, "editMessageText", {
            chat_id: cq.message.chat.id, message_id: cq.message.message_id,
            text: r.ok ? `✅ Acknowledged by you at ${clock(user.timezone)}` : r.message,
          });
        }
      }
    }
    await prisma.integrationEvent.update({ where: { id: eventId }, data: { status: "PROCESSED" } });
    await prisma.integration.update({ where: { id: integration.id }, data: { status: "CONNECTED", lastSuccessAt: new Date(), lastError: null } }).catch(() => undefined);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    await prisma.integrationEvent.update({ where: { id: eventId }, data: { status: "FAILED", error: msg.slice(0, 500) } }).catch(() => undefined);
  }
  return new Response("ok", { status: 200 });
}
