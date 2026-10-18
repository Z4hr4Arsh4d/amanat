"use server";
// P2 owns. Telegram connect / link / test actions (PLAN.md §3.8, I4.1–I4.3).
import { randomBytes } from "crypto";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireUser, requirePermission } from "@/lib/core/session";
import { scoped } from "@/lib/core/scoped";
import { act } from "@/lib/core/action";
import { HttpError } from "@/lib/core/errors";
import * as audit from "@/lib/audit";
import { encryptJson, mask } from "@/lib/integrations/secrets";
import { TgError, getTelegram, tgCall } from "@/lib/notify/telegram";
import { sendTestAlert } from "@/lib/notify";

export type TelegramStatus = {
  connected: boolean; status: "NOT_CONNECTED" | "CONNECTED" | "ERROR"; botUsername: string | null; maskedToken: string;
  lastError: string | null; lastSuccessAt: string | null; iAmLinked: boolean; webhookUrl: string;
  failedAlerts: { id: string; title: string; error: string; at: string }[];
};

export async function getTelegramStatus() {
  return act(async (): Promise<TelegramStatus> => {
    const ctx = await requireUser();
    requirePermission(ctx, "crm.view");
    const db = scoped(ctx);
    const row = await db.integration.findFirst({ where: { provider: "TELEGRAM" } });
    const me = await db.user.findFirst({ where: { id: ctx.userId }, select: { telegramChatId: true } });
    const failed = await db.notification.findMany({ where: { channel: "TELEGRAM", status: "FAILED" }, orderBy: { createdAt: "desc" }, take: 5 });
    const cfg = (row?.publicConfig ?? {}) as { botUsername?: string; maskedToken?: string };
    return {
      connected: !!row && row.status !== "NOT_CONNECTED", status: row?.status ?? "NOT_CONNECTED",
      botUsername: cfg.botUsername ?? null, maskedToken: cfg.maskedToken ?? "",
      lastError: row?.lastError ?? null, lastSuccessAt: row?.lastSuccessAt?.toISOString() ?? null,
      iAmLinked: !!me?.telegramChatId, webhookUrl: row ? `${process.env.APP_URL ?? ""}/api/webhooks/telegram/${row.id}` : "",
      failedAlerts: failed.map((f) => ({ id: f.id, title: f.title, error: f.lastError ?? "Unknown error", at: f.createdAt.toISOString() })),
    };
  });
}

const Token = z.string().trim().regex(/^\d{5,}:[A-Za-z0-9_-]{30,}$/, "That does not look like a bot token. Copy the whole token from @BotFather.");

export async function connectTelegram(input: { botToken: string }) {
  return act(async () => {
    const ctx = await requireUser();
    requirePermission(ctx, "integrations.manage");
    const botToken = Token.parse(input.botToken);
    const appUrl = process.env.APP_URL ?? "";
    if (!appUrl.startsWith("https://")) {
      throw new HttpError(422, "Telegram can only send updates to a public https address. Set APP_URL to your public https link (for example your ngrok address) and try again.");
    }
    const db = scoped(ctx);

    let username: string;
    try {
      const me = await tgCall<{ username: string }>(botToken, "getMe", {});
      username = me.username;
    } catch (e) {
      throw new HttpError(422, e instanceof TgError ? e.message : "Could not check the bot token. Try again.");
    }

    const webhookSecret = randomBytes(24).toString("hex");
    const secrets = encryptJson({ botToken, webhookSecret });
    const publicConfig = { botUsername: username, maskedToken: mask(botToken) };
    const existing = await db.integration.findFirst({ where: { provider: "TELEGRAM" } });
    const row = existing
      ? await db.integration.update({ where: { id: existing.id }, data: { secrets, publicConfig, status: "CONNECTED", lastError: null } })
      : await db.integration.create({ data: { workspaceId: ctx.workspaceId, provider: "TELEGRAM", secrets, publicConfig, status: "CONNECTED" } });

    try {
      await tgCall(botToken, "setWebhook", { url: `${appUrl}/api/webhooks/telegram/${row.id}`, secret_token: webhookSecret, allowed_updates: ["message", "callback_query"] });
    } catch (e) {
      const message = e instanceof TgError ? e.message : "Could not set up the Telegram webhook.";
      await db.integration.update({ where: { id: row.id }, data: { status: "ERROR", lastError: message } });
      throw new HttpError(422, message);
    }
    await audit.record({
      workspaceId: ctx.workspaceId, actorId: ctx.userId, actorLabel: ctx.name, action: "integration.connected",
      targetType: "Integration", targetId: row.id, after: { provider: "TELEGRAM", bot: username },
    });
    revalidatePath("/integrations");
    return { botUsername: username };
  });
}

export async function disconnectTelegram() {
  return act(async () => {
    const ctx = await requireUser();
    requirePermission(ctx, "integrations.manage");
    const db = scoped(ctx);
    const tg = await getTelegram(ctx.workspaceId);
    const row = await db.integration.findFirst({ where: { provider: "TELEGRAM" } });
    if (!row) return null;
    if (tg) await tgCall(tg.token, "deleteWebhook", {}).catch(() => undefined);
    await db.integration.update({ where: { id: row.id }, data: { status: "NOT_CONNECTED", secrets: null, publicConfig: {}, lastError: null } });
    await audit.record({
      workspaceId: ctx.workspaceId, actorId: ctx.userId, actorLabel: ctx.name, action: "integration.disconnected",
      targetType: "Integration", targetId: row.id, after: { provider: "TELEGRAM" },
    });
    revalidatePath("/integrations");
    return null;
  });
}

/** "Connect Telegram": returns the link that opens the bot with this person's one-time token (I4.3). */
export async function startTelegramLink() {
  return act(async () => {
    const ctx = await requireUser();
    requirePermission(ctx, "crm.view");
    const tg = await getTelegram(ctx.workspaceId);
    if (!tg?.botUsername) throw new HttpError(409, "Telegram is not connected yet. Ask an admin to connect it on the Integrations page.");
    const token = randomBytes(16).toString("hex");
    await scoped(ctx).user.update({ where: { id: ctx.userId }, data: { telegramLinkToken: token } });
    return { url: `https://t.me/${tg.botUsername}?start=${token}` };
  });
}

export async function sendTelegramTest() {
  return act(async () => {
    const ctx = await requireUser();
    requirePermission(ctx, "crm.view");
    const r = await sendTestAlert(ctx.workspaceId, ctx.userId);
    if (!r.ok) throw new HttpError(409, r.message);
    return { message: r.message };
  });
}
