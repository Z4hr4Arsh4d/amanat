// P2 owns. In-app notification + Telegram alert (F3.9, I4). Signature of alert() is a CONTRACT.
// A Telegram failure must never break assignment or escalation: everything here is caught and recorded instead.
import type { Notification } from "@prisma/client";
import { prisma } from "@/lib/db";
import { send as outboxSend } from "@/lib/integrations/outbox";
import { TgError, getTelegram, markIntegration, tgCall } from "./telegram";

const SOURCE_LABEL = { WEB_FORM: "Web form", WHATSAPP: "WhatsApp", MANUAL: "Manual" } as const;
const RETRY_DELAYS_S = [5, 15, 45]; // after attempt 1, 2, 3 (I4.4)
const MAX_ATTEMPTS = RETRY_DELAYS_S.length + 1;

const appUrl = () => process.env.APP_URL ?? "";
const shortPhone = (p: string | null) => (p && p.length > 7 ? `${p.slice(0, 7)}…` : (p ?? "no phone"));

export async function alert(input: {
  workspaceId: string;
  userId: string;
  leadId: string;
  title: string; // "Lead escalated to you"
  reason: string; // "Hina did not acknowledge within 60s (level 2 of 3)"
}): Promise<void> {
  const { workspaceId, userId, leadId } = input;
  const lead = await prisma.lead.findFirst({ where: { id: leadId, workspaceId }, include: { contact: { select: { name: true, phone: true } } } });
  if (!lead) return;
  const source = SOURCE_LABEL[lead.source];

  // 1) In-app: always.
  await prisma.notification.create({
    data: { workspaceId, userId, leadId, channel: "INAPP", status: "SENT", title: input.title, body: `${lead.contact.name} (${source}). ${input.reason}` },
  });

  // 2) Telegram: only if this person has linked their chat.
  const user = await prisma.user.findFirst({ where: { id: userId, workspaceId }, select: { telegramChatId: true } });
  if (!user?.telegramChatId) return;
  const left = lead.deadlineAt ? Math.max(0, Math.round((lead.deadlineAt.getTime() - Date.now()) / 1000)) : null;
  const text = [
    `🔴 ${input.title}`,
    `Lead: ${lead.contact.name} (${shortPhone(lead.contact.phone)})`,
    `Source: ${source}`,
    `Reason: ${input.reason}`,
    left !== null ? `You have ${left}s.` : "",
  ].filter(Boolean).join("\n");
  const n = await prisma.notification.create({
    data: { workspaceId, userId, leadId, channel: "TELEGRAM", status: "PENDING", title: input.title, body: text, nextAttemptAt: new Date() },
  });
  await attemptDelivery(n.id);
}

/** "Send test alert" button: a plain Telegram message to the person's own chat. */
export async function sendTestAlert(workspaceId: string, userId: string): Promise<{ ok: boolean; message: string }> {
  const user = await prisma.user.findFirst({ where: { id: userId, workspaceId }, select: { telegramChatId: true } });
  if (!user?.telegramChatId) return { ok: false, message: "Connect Telegram first, then press Start in the bot." };
  if (!(await getTelegram(workspaceId))) return { ok: false, message: "Telegram is not connected for your workspace. Ask an admin to connect it." };
  const n = await prisma.notification.create({
    data: { workspaceId, userId, channel: "TELEGRAM", status: "PENDING", title: "Test alert", body: "🔔 Test alert from Amanat. Telegram alerts are working.", nextAttemptAt: new Date() },
  });
  await attemptDelivery(n.id);
  const after = await prisma.notification.findUnique({ where: { id: n.id } });
  if (after?.status === "SENT") return { ok: true, message: "Test alert sent. Check Telegram." };
  return { ok: false, message: after?.lastError ?? "The test alert could not be sent." };
}

/**
 * One delivery attempt. Safe to run twice at once: the attempt is claimed with a conditional update,
 * and the claim also sets a 30s lease so a crashed worker's alert is picked up again.
 */
export async function attemptDelivery(notificationId: string): Promise<void> {
  const n = await prisma.notification.findUnique({ where: { id: notificationId } });
  if (!n || n.channel !== "TELEGRAM" || n.status !== "PENDING") return;
  const claim = await prisma.notification.updateMany({
    where: { id: n.id, status: "PENDING", attempts: n.attempts },
    data: { attempts: n.attempts + 1, nextAttemptAt: new Date(Date.now() + 30_000) },
  });
  if (claim.count === 0) return;
  const attempt = n.attempts + 1;

  let failure: { message: string; permanent: boolean } | null = null;
  let integrationId: string | null = null;
  try {
    const tg = await getTelegram(n.workspaceId);
    const user = await prisma.user.findFirst({ where: { id: n.userId, workspaceId: n.workspaceId }, select: { telegramChatId: true } });
    if (!tg) throw new TgError("Telegram is not connected. An admin can connect it on the Integrations page.", true);
    if (!user?.telegramChatId) throw new TgError("This person has not linked Telegram yet.", true);
    integrationId = tg.integrationId;
    const chatId = user.telegramChatId;

    const lead = n.leadId ? await prisma.lead.findFirst({ where: { id: n.leadId, workspaceId: n.workspaceId }, select: { id: true, contactId: true } }) : null;
    const buttons: Record<string, string>[] = [];
    if (lead) {
      buttons.push({ text: "✅ Acknowledge", callback_data: `ack:${lead.id}` });
      // Telegram rejects non-https links, so a local APP_URL would make the whole alert fail.
      if (appUrl().startsWith("https://")) buttons.push({ text: "Open lead", url: `${appUrl()}/contacts/${lead.contactId}` });
    }
    let tgErr: TgError | null = null;
    const result = await outboxSend({
      workspaceId: n.workspaceId, provider: "TELEGRAM", type: "telegram.sendMessage", payload: { notificationId: n.id },
      run: async () => {
        try {
          await tgCall(tg.token, "sendMessage", { chat_id: chatId, text: n.body, ...(buttons.length ? { reply_markup: { inline_keyboard: [buttons] } } : {}) });
        } catch (e) {
          if (e instanceof TgError) tgErr = e; // keep the details; the outbox only passes the message on
          throw e;
        }
        return { externalId: n.id };
      },
    });
    if (!result.ok) throw tgErr ?? new TgError(result.error ?? "Telegram did not accept the message.", false);
  } catch (e) {
    failure = e instanceof TgError ? { message: e.message, permanent: e.permanent } : { message: "Something went wrong sending the alert.", permanent: false };
  }

  if (!failure) {
    await prisma.notification.updateMany({ where: { id: n.id }, data: { status: "SENT", lastError: null, nextAttemptAt: null } });
    if (integrationId) await markIntegration(integrationId, true);
    return;
  }
  if (integrationId) await markIntegration(integrationId, false, failure.message);
  if (failure.permanent || attempt >= MAX_ATTEMPTS) {
    await prisma.notification.updateMany({ where: { id: n.id }, data: { status: "FAILED", lastError: failure.message, nextAttemptAt: null } });
  } else {
    const delay = RETRY_DELAYS_S[attempt - 1];
    await prisma.notification.updateMany({
      where: { id: n.id }, data: { lastError: failure.message, nextAttemptAt: new Date(Date.now() + delay * 1000) },
    });
  }
}

/** Worker job "notification-retry": try again every Telegram alert whose next attempt time has come. */
export async function retryNotifications(): Promise<void> {
  const due: Pick<Notification, "id">[] = await prisma.notification.findMany({
    where: { channel: "TELEGRAM", status: "PENDING", nextAttemptAt: { lte: new Date() } },
    select: { id: true }, orderBy: { nextAttemptAt: "asc" }, take: 20,
  });
  for (const n of due) {
    try {
      await attemptDelivery(n.id);
    } catch (e) {
      console.error(`[notify] retry of ${n.id} failed`, e);
    }
  }
}
