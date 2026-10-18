// P3 owns. Built-in customer chat (replaces an outside messaging account). A customer opens the public chat
// page, gives a name and phone number, and talks to the company. Messages go through the same pipeline as
// WhatsApp: contact matching, lead creation + assignment, auto-reply, opt-out, timeline, sync history.
//
// Security: no login for customers, so every chat session is a signed token (HMAC with ENCRYPTION_KEY) that
// names one conversation and the moment the session began. A token only shows messages from its own session
// on (typing someone else's phone number never reveals their earlier chat). Input is validated, rate limited
// and a hidden "honeypot" field catches simple bots.
import { createHmac, randomBytes, timingSafeEqual } from "crypto";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { ensureEnv } from "./env";
import { parsePhone } from "./phone";
import { receiveMessage } from "./inbound";
import { ensureConversation } from "./messaging";

export class ChatError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

// ── session tokens ──
function key() {
  ensureEnv();
  return createHmac("sha256", process.env.ENCRYPTION_KEY ?? "").update("webchat-session").digest();
}
const sign = (body: string) => createHmac("sha256", key()).update(body).digest("base64url").slice(0, 32);

export function makeToken(conversationId: string, since: Date) {
  const body = `${conversationId}.${since.getTime().toString(36)}`;
  return `${body}.${sign(body)}`;
}

export function readToken(token: string | null | undefined): { conversationId: string; since: Date } | null {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [id, ts, sig] = parts;
  const want = Buffer.from(sign(`${id}.${ts}`));
  const got = Buffer.from(sig);
  if (want.length !== got.length || !timingSafeEqual(want, got)) return null;
  const ms = parseInt(ts, 36);
  if (!Number.isFinite(ms)) return null;
  return { conversationId: id, since: new Date(ms) };
}

// ── rate limits (per server process; the database also caps messages per conversation) ──
const hits = new Map<string, number[]>();
function limited(bucket: string, max: number, windowMs: number) {
  const now = Date.now();
  const recent = (hits.get(bucket) ?? []).filter((t) => now - t < windowMs);
  if (recent.length >= max) {
    hits.set(bucket, recent);
    return true;
  }
  recent.push(now);
  hits.set(bucket, recent);
  if (hits.size > 5000) for (const [k, v] of hits) if (!v.some((t) => now - t < windowMs)) hits.delete(k);
  return false;
}

// ── workspace + on/off switch ──
export async function chatWorkspace(slug: string) {
  const ws = await prisma.workspace.findUnique({ where: { slug: slug.toLowerCase() }, select: { id: true, name: true } });
  if (!ws) return null;
  const row = await prisma.integration.findUnique({ where: { workspaceId_provider: { workspaceId: ws.id, provider: "WEBCHAT" } }, select: { status: true } });
  return { ...ws, enabled: !row || row.status !== "NOT_CONNECTED" }; // on unless an admin turned it off
}

const unavailable = () => new ChatError(404, "This chat is not available. Please contact the company another way.");

export const StartSchema = z.object({
  name: z.string().trim().min(2, "Please enter your name.").max(80, "That name is too long."),
  phone: z.string().trim().min(1, "Please enter your phone number.").max(30, "That phone number is too long."),
  message: z.string().trim().min(1, "Please type your message.").max(1000, "Your message is too long (1,000 characters at most)."),
  website: z.string().optional().default(""), // honeypot: real people leave it empty (checked in startChat)
});

/** Customer starts a chat: finds or creates their contact, creates the lead, returns their session token. */
export async function startChat(slug: string, input: unknown, ip: string) {
  if (!input || typeof input !== "object") throw new ChatError(422, "Please fill in your name, phone number and message.");
  const f = StartSchema.safeParse(input);
  if (!f.success) throw new ChatError(422, f.error.issues[0]?.message ?? "Please check your details.");
  const ws = await chatWorkspace(slug);
  if (!ws || !ws.enabled) throw unavailable();
  if (f.data.website) throw new ChatError(422, "Could not start the chat. Please try again."); // bot
  if (limited(`start:${ip}`, 6, 10 * 60_000)) throw new ChatError(429, "Too many chats started from your connection. Please wait a few minutes and try again.");
  const phone = parsePhone(f.data.phone);
  if (!phone) throw new ChatError(422, "Please enter a valid phone number, for example 0300 1234567 or +92 300 1234567.");

  const startedAt = new Date(Date.now() - 1000);
  const clientId = randomBytes(8).toString("hex");
  const r = await receiveMessage({ workspaceId: ws.id }, "WEBCHAT", {
    externalId: `wc:start:${phone}:${clientId}`, from: phone, body: f.data.message, profileName: f.data.name, raw: { name: f.data.name, ip, text: f.data.message },
  }, "WEBCHAT");
  if (r === "failed") throw new ChatError(500, "Something went wrong on our side. Please try again in a moment.");
  const contact = await prisma.contact.findFirst({ where: { workspaceId: ws.id, phone } });
  if (!contact) throw new ChatError(500, "Something went wrong on our side. Please try again in a moment.");
  const convo = await ensureConversation(ws.id, contact.id, "WEBCHAT");
  return { token: makeToken(convo.id, startedAt), company: ws.name };
}

async function sessionOf(slug: string, token: string | null) {
  const t = readToken(token);
  const ws = await chatWorkspace(slug);
  if (!t || !ws) throw new ChatError(401, "Your chat session expired. Please start a new chat.");
  const convo = await prisma.conversation.findFirst({ where: { id: t.conversationId, workspaceId: ws.id, channel: "WEBCHAT" }, include: { contact: true } });
  if (!convo) throw new ChatError(401, "Your chat session expired. Please start a new chat.");
  return { ws, convo, since: t.since };
}

export const SendSchema = z.object({
  text: z.string().trim().min(1, "Please type a message.").max(1000, "Your message is too long (1,000 characters at most)."),
  clientId: z.string().min(8).max(64).regex(/^[A-Za-z0-9_-]+$/),
});

/** Customer sends a message in an existing chat. `clientId` makes a retried request count once. */
export async function sendChat(slug: string, token: string | null, input: unknown) {
  if (!input || typeof input !== "object") throw new ChatError(422, "Please type a message.");
  const f = SendSchema.safeParse(input);
  if (!f.success) throw new ChatError(422, f.error.issues[0]?.message ?? "Please type a message.");
  const { ws, convo } = await sessionOf(slug, token);
  if (!ws.enabled) throw unavailable();
  if (limited(`msg:${convo.id}`, 20, 60_000)) throw new ChatError(429, "You are sending messages too fast. Please wait a moment.");
  const r = await receiveMessage({ workspaceId: ws.id }, "WEBCHAT", {
    externalId: `wc:${convo.id}:${f.data.clientId}`, from: convo.contact.phone!, body: f.data.text, profileName: convo.contact.name, raw: { text: f.data.text },
  }, "WEBCHAT");
  if (r === "failed") throw new ChatError(500, "Your message could not be sent. Please try again.");
  return { ok: true as const };
}

export type ChatMessage = { id: string; from: "you" | "team"; sender: string; body: string; at: Date; read: boolean };

/** Messages of this chat session. Also marks the team's replies as Read, so staff see "✓✓ Read". */
export async function chatMessages(slug: string, token: string | null) {
  const { ws, convo, since } = await sessionOf(slug, token);
  const rows = await prisma.message.findMany({ where: { conversationId: convo.id, createdAt: { gte: since } }, orderBy: { createdAt: "asc" }, take: 300 });
  if (rows.some((m) => m.direction === "OUT" && m.status === "DELIVERED")) {
    await prisma.message.updateMany({ where: { conversationId: convo.id, direction: "OUT", status: "DELIVERED", createdAt: { gte: since } }, data: { status: "READ" } });
  }
  const staffIds = Array.from(new Set(rows.map((m) => m.sentById).filter((x): x is string => !!x)));
  const staff = staffIds.length ? await prisma.user.findMany({ where: { id: { in: staffIds }, workspaceId: ws.id }, select: { id: true, name: true } }) : [];
  const names = new Map(staff.map((u) => [u.id, u.name.split(" ")[0]]));
  const messages: ChatMessage[] = rows.map((m) => ({
    id: m.id, from: m.direction === "IN" ? "you" : "team", body: m.body, at: m.createdAt, read: m.status === "READ",
    sender: m.direction === "IN" ? "You" : m.sentById ? names.get(m.sentById) ?? "Team" : "Auto-reply",
  }));
  return { company: ws.name, messages, optedOut: convo.contact.optedOut };
}

// ── admin on/off (used from the Integrations page) ──
export async function setEnabled(workspaceId: string, enabled: boolean) {
  const row = await prisma.integration.upsert({
    where: { workspaceId_provider: { workspaceId, provider: "WEBCHAT" } },
    create: { workspaceId, provider: "WEBCHAT", status: enabled ? "CONNECTED" : "NOT_CONNECTED", ...(enabled ? { lastSuccessAt: new Date() } : {}) },
    update: { status: enabled ? "CONNECTED" : "NOT_CONNECTED" },
  });
  return row;
}
