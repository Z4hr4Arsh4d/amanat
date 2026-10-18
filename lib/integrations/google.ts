// P3 owns. Google Calendar over OAuth 2.0 (I3.1, I3.2) with plain fetch calls to Google's REST API.
// Tokens live only on the server, encrypted. Access tokens refresh automatically; a revoked/expired grant
// marks the connection NEEDS_RECONNECT so the user sees "Reconnect".
//
// Demo calendar: when an employee connects a "demo calendar" (DEMO_MODE only), the same functions work
// without Google: busy times come from that employee's Amanat appointments and events get local ids.
import { createHmac, randomBytes, timingSafeEqual } from "crypto";
import type { CalendarConnection } from "@prisma/client";
import { prisma } from "@/lib/db";
import { decrypt, encrypt } from "./secrets";
import { appUrl } from "./store";
import { logEvent } from "./log";
import { classify } from "./errors";
import { ensureEnv } from "./env";

const AUTH = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN = "https://oauth2.googleapis.com/token";
const REVOKE = "https://oauth2.googleapis.com/revoke";
const USERINFO = "https://openidconnect.googleapis.com/v1/userinfo";
const CAL = "https://www.googleapis.com/calendar/v3";
const SCOPES = ["openid", "email", "https://www.googleapis.com/auth/calendar.events", "https://www.googleapis.com/auth/calendar.readonly"];
const SIM = "SIMULATED-DEMO-CALENDAR";

export const redirectUri = () => `${appUrl()}/api/oauth/google/callback`;

/** Env value without stray spaces or quotes (easy to paste by mistake into hosting dashboards). */
function cleanEnv(name: string) {
  ensureEnv();
  return (process.env[name] ?? "").trim().replace(/^["']+|["']+$/g, "").trim();
}
const clientId = () => cleanEnv("GOOGLE_CLIENT_ID");
const clientSecret = () => cleanEnv("GOOGLE_CLIENT_SECRET");

export function googleConfigured() {
  return !!clientId() && !!clientSecret();
}
/** Demo calendars are allowed only when DEMO_MODE=true (hackathon demo / local testing). */
export function demoMode() {
  ensureEnv();
  return process.env.DEMO_MODE === "true";
}

/** Raised when Google says the grant is gone; the connection has already been marked NEEDS_RECONNECT. */
export class ReconnectNeeded extends Error {
  constructor(public who: string) {
    super(`${who}'s Google Calendar connection expired or was revoked. They must reconnect on My calendar.`);
  }
}

// ── OAuth state: signed (HMAC) and bound to this browser by a cookie nonce, to stop CSRF / mix-ups ──
function stateKey() {
  ensureEnv();
  return createHmac("sha256", process.env.ENCRYPTION_KEY ?? "").update("google-oauth-state").digest();
}
export function makeState(userId: string) {
  const nonce = randomBytes(16).toString("base64url");
  const body = Buffer.from(JSON.stringify({ u: userId, n: nonce, e: Date.now() + 10 * 60_000 })).toString("base64url");
  const sig = createHmac("sha256", stateKey()).update(body).digest("base64url");
  return { state: `${body}.${sig}`, nonce };
}
export function readState(state: string | null, cookieNonce: string | undefined): { userId: string } | null {
  if (!state || !cookieNonce) return null;
  const [body, sig] = state.split(".");
  if (!body || !sig) return null;
  const want = createHmac("sha256", stateKey()).update(body).digest();
  const got = Buffer.from(sig, "base64url");
  if (got.length !== want.length || !timingSafeEqual(got, want)) return null;
  try {
    const p = JSON.parse(Buffer.from(body, "base64url").toString()) as { u: string; n: string; e: number };
    if (p.e < Date.now() || p.n !== cookieNonce) return null;
    return { userId: p.u };
  } catch {
    return null;
  }
}

export function authUrl(state: string) {
  const q = new URLSearchParams({
    client_id: clientId(), redirect_uri: redirectUri(), response_type: "code", scope: SCOPES.join(" "),
    access_type: "offline", prompt: "consent", include_granted_scopes: "true", state,
  });
  return `${AUTH}?${q}`;
}

class GoogleError extends Error {
  constructor(message: string, public status: number, public code?: string) {
    super(message);
  }
}

async function call<T>(url: string, init: { method?: string; token?: string; json?: unknown; form?: Record<string, string> } = {}): Promise<T> {
  const r = await fetch(url, {
    method: init.method ?? (init.json || init.form ? "POST" : "GET"),
    headers: {
      ...(init.token ? { Authorization: `Bearer ${init.token}` } : {}),
      ...(init.json ? { "Content-Type": "application/json" } : {}),
      ...(init.form ? { "Content-Type": "application/x-www-form-urlencoded" } : {}),
    },
    body: init.json ? JSON.stringify(init.json) : init.form ? new URLSearchParams(init.form) : undefined,
    signal: AbortSignal.timeout(10_000),
  });
  if (r.status === 204) return {} as T;
  const j = await r.json().catch(() => ({}));
  if (!r.ok) {
    const code = typeof j.error === "string" ? j.error : j.error?.status ?? String(r.status);
    const msg = j.error_description ?? j.error?.message ?? `HTTP ${r.status}`;
    throw new GoogleError(msg, r.status, code);
  }
  return j as T;
}

/** Callback step: code → tokens + the Google account's email. */
export async function exchangeCode(code: string) {
  const t = await call<{ access_token: string; refresh_token?: string; expires_in: number }>(TOKEN, {
    form: { code, client_id: clientId(), client_secret: clientSecret(), redirect_uri: redirectUri(), grant_type: "authorization_code" },
  });
  const me = await call<{ email?: string }>(USERINFO, { token: t.access_token });
  return { ...t, email: me.email ?? "unknown" };
}

export const isDemoConnection = (c: Pick<CalendarConnection, "refreshTokenEnc">) => {
  try { return decrypt(c.refreshTokenEnc) === SIM; } catch { return false; }
};
export const demoRefreshToken = () => encrypt(SIM);

async function owner(userId: string) {
  return prisma.user.findUnique({ where: { id: userId }, select: { name: true, workspaceId: true, timezone: true } });
}

/** Valid access token for a connection, refreshing it when needed (I3.2). */
async function accessToken(conn: CalendarConnection): Promise<string> {
  if (conn.accessTokenEnc && conn.expiresAt && conn.expiresAt.getTime() > Date.now() + 60_000) return decrypt(conn.accessTokenEnc);
  try {
    const t = await call<{ access_token: string; expires_in: number }>(TOKEN, {
      form: { client_id: clientId(), client_secret: clientSecret(), refresh_token: decrypt(conn.refreshTokenEnc), grant_type: "refresh_token" },
    });
    await prisma.calendarConnection.update({ where: { id: conn.id }, data: { accessTokenEnc: encrypt(t.access_token), expiresAt: new Date(Date.now() + t.expires_in * 1000) } });
    return t.access_token;
  } catch (e) {
    if (e instanceof GoogleError && (e.code === "invalid_grant" || e.status === 400 || e.status === 401)) {
      await prisma.calendarConnection.update({ where: { id: conn.id }, data: { status: "NEEDS_RECONNECT", accessTokenEnc: null } });
      const u = await owner(conn.userId);
      if (u) await logEvent({ workspaceId: u.workspaceId, provider: "GOOGLE", direction: "OUT", type: "oauth.refresh", status: "FAILED", attempts: 1, error: `${u.name}'s Google Calendar access was revoked or expired. They must reconnect.`, payload: { userId: conn.userId } });
      throw new ReconnectNeeded(u?.name ?? "This employee");
    }
    throw e;
  }
}

export type Busy = { start: Date; end: Date; source: "google" | "amanat" };
export type FreeBusy = { state: "not_connected" | "needs_reconnect" | "ok" | "error"; busy: Busy[]; error?: string; demo?: boolean };

/** Busy blocks for an employee in [from, to): Google free/busy + Amanat appointments (I3.4). */
export async function freeBusy(userId: string, from: Date, to: Date, ignoreAppointmentId?: string): Promise<FreeBusy> {
  const conn = await prisma.calendarConnection.findUnique({ where: { userId } });
  const appts = await prisma.appointment.findMany({
    where: { userId, status: { in: ["BOOKED", "RESCHEDULED"] }, startUtc: { lt: to }, endUtc: { gt: from }, ...(ignoreAppointmentId ? { id: { not: ignoreAppointmentId } } : {}) },
    select: { startUtc: true, endUtc: true, googleEventId: true },
  });
  const ours: Busy[] = appts.map((a) => ({ start: a.startUtc, end: a.endUtc, source: "amanat" }));
  if (!conn) return { state: "not_connected", busy: ours };
  if (conn.status === "NEEDS_RECONNECT") return { state: "needs_reconnect", busy: ours };
  if (isDemoConnection(conn)) return { state: "ok", busy: ours, demo: true };
  try {
    const token = await accessToken(conn);
    const r = await call<{ calendars?: { primary?: { busy?: { start: string; end: string }[]; errors?: { reason: string }[] } } }>(`${CAL}/freeBusy`, {
      token, json: { timeMin: from.toISOString(), timeMax: to.toISOString(), items: [{ id: "primary" }] },
    });
    const ignore = ignoreAppointmentId ? await prisma.appointment.findUnique({ where: { id: ignoreAppointmentId }, select: { startUtc: true, endUtc: true } }) : null;
    const g: Busy[] = (r.calendars?.primary?.busy ?? [])
      .map((b) => ({ start: new Date(b.start), end: new Date(b.end), source: "google" as const }))
      // When rescheduling, the appointment's own Google event must not count as a conflict.
      .filter((b) => !(ignore && b.start.getTime() === ignore.startUtc.getTime() && b.end.getTime() === ignore.endUtc.getTime()));
    return { state: "ok", busy: [...g, ...ours] };
  } catch (e) {
    if (e instanceof ReconnectNeeded) return { state: "needs_reconnect", busy: ours };
    return { state: "error", busy: ours, error: classify("GOOGLE", e).message };
  }
}

type EventInput = { summary: string; description: string; start: Date; end: Date; timeZone: string };

async function withConn<T>(userId: string, type: string, payload: Record<string, unknown>, fn: (token: string) => Promise<T>, demo: () => T): Promise<T> {
  const conn = await prisma.calendarConnection.findUnique({ where: { userId } });
  const u = await owner(userId);
  if (!conn || !u) throw new Error("This employee has not connected a calendar.");
  if (conn.status === "NEEDS_RECONNECT") throw new ReconnectNeeded(u.name);
  if (isDemoConnection(conn)) {
    const r = demo();
    await logEvent({ workspaceId: u.workspaceId, provider: "GOOGLE", direction: "OUT", type: `${type} (demo calendar)`, status: "SENT", attempts: 1, payload });
    return r;
  }
  try {
    const r = await fn(await accessToken(conn));
    await logEvent({ workspaceId: u.workspaceId, provider: "GOOGLE", direction: "OUT", type, status: "SENT", attempts: 1, payload, externalId: null });
    await prisma.integration.updateMany({ where: { workspaceId: u.workspaceId, provider: "GOOGLE" }, data: { lastSuccessAt: new Date(), lastError: null, status: "CONNECTED" } });
    return r;
  } catch (e) {
    const msg = e instanceof ReconnectNeeded ? e.message : classify("GOOGLE", e).message;
    await logEvent({ workspaceId: u.workspaceId, provider: "GOOGLE", direction: "OUT", type, status: "FAILED", attempts: 1, error: msg, payload });
    if (e instanceof ReconnectNeeded) throw e;
    throw new Error(msg);
  }
}

const eventBody = (e: EventInput) => ({
  summary: e.summary, description: e.description,
  start: { dateTime: e.start.toISOString(), timeZone: e.timeZone }, end: { dateTime: e.end.toISOString(), timeZone: e.timeZone },
});

export function insertEvent(userId: string, e: EventInput) {
  return withConn(userId, "calendar.events.insert", { summary: e.summary, start: e.start, end: e.end },
    async (token) => (await call<{ id: string }>(`${CAL}/calendars/primary/events`, { token, json: eventBody(e) })).id,
    () => `demo_${randomBytes(10).toString("hex")}`);
}

export function patchEvent(userId: string, eventId: string, e: EventInput) {
  return withConn(userId, "calendar.events.patch", { eventId, start: e.start, end: e.end },
    async (token) => { await call(`${CAL}/calendars/primary/events/${encodeURIComponent(eventId)}`, { method: "PATCH", token, json: eventBody(e) }); return true; },
    () => true);
}

export function deleteEvent(userId: string, eventId: string) {
  return withConn(userId, "calendar.events.delete", { eventId },
    async (token) => {
      try { await call(`${CAL}/calendars/primary/events/${encodeURIComponent(eventId)}`, { method: "DELETE", token }); }
      catch (e) { if (!(e instanceof GoogleError && (e.status === 404 || e.status === 410))) throw e; } // already gone in Google: fine
      return true;
    },
    () => true);
}

/** Best-effort revoke at Google on disconnect. */
export async function revoke(conn: CalendarConnection) {
  if (isDemoConnection(conn)) return;
  try { await call(REVOKE, { form: { token: decrypt(conn.refreshTokenEnc) } }); } catch { /* already revoked: fine */ }
}
