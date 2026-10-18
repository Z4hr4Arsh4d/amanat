// P3 owns. Booking, rescheduling and cancelling appointments on employees' calendars (I3.3–I3.7).
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { audit, can, leads, requirePermission, scoped, timeline, type Ctx } from "@/lib/shared/contracts";
import { HttpError, NotFound } from "@/lib/core/errors";
import { deleteEvent, demoMode, demoRefreshToken, freeBusy, googleConfigured, insertEvent, isDemoConnection, patchEvent, ReconnectNeeded, revoke } from "./google";
import { forgetBusy } from "./calendar";
import { appUrl } from "./store";
import { formatInZone, formatTimeInZone, isValidZone, offsetLabel, zonedToUtc } from "./time";

// ───────────────────────────── My connection (I3.1, I3.2) ─────────────────────────────

export async function myCalendar(ctx: Ctx) {
  const c = await prisma.calendarConnection.findUnique({ where: { userId: ctx.userId } });
  return {
    connection: c ? { email: c.googleEmail, status: c.status, since: c.createdAt, demo: isDemoConnection(c) } : null,
    googleReady: googleConfigured(),
    demoAllowed: demoMode(),
    timezone: ctx.timezone,
  };
}

export async function connectDemo(ctx: Ctx) {
  if (!demoMode()) throw new HttpError(403, "Demo calendars are turned off. Set DEMO_MODE=true or connect Google.");
  const data = { googleEmail: `${ctx.email} (demo calendar)`, refreshTokenEnc: demoRefreshToken(), accessTokenEnc: null, expiresAt: null, status: "CONNECTED" as const };
  const c = await prisma.calendarConnection.upsert({ where: { userId: ctx.userId }, create: { userId: ctx.userId, ...data }, update: data });
  await audit.record({ workspaceId: ctx.workspaceId, actorId: ctx.userId, actorLabel: ctx.name, action: "integration.connected", targetType: "CalendarConnection", targetId: c.id, after: { provider: "GOOGLE", calendar: "demo", user: ctx.name } });
  forgetBusy(ctx.userId);
  return { message: "Demo calendar connected. You can now be booked; your Amanat appointments count as busy time." };
}

export async function saveGoogleConnection(userId: string, email: string, refreshToken: string | undefined, accessToken: string, expiresIn: number) {
  const { encrypt } = await import("./secrets");
  const existing = await prisma.calendarConnection.findUnique({ where: { userId } });
  if (!refreshToken && (!existing || isDemoConnection(existing))) {
    throw new Error("Google did not send a refresh token. Remove Amanat's access at myaccount.google.com/permissions and connect again.");
  }
  const data = {
    googleEmail: email, status: "CONNECTED" as const,
    ...(refreshToken ? { refreshTokenEnc: encrypt(refreshToken) } : {}),
    accessTokenEnc: encrypt(accessToken), expiresAt: new Date(Date.now() + expiresIn * 1000),
  };
  const c = await prisma.calendarConnection.upsert({
    where: { userId }, create: { userId, refreshTokenEnc: encrypt(refreshToken!), ...data }, update: data,
  });
  const u = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  await audit.record({ workspaceId: u.workspaceId, actorId: userId, actorLabel: u.name, action: existing ? "integration.updated" : "integration.connected", targetType: "CalendarConnection", targetId: c.id, after: { provider: "GOOGLE", googleEmail: email } });
  await prisma.integration.upsert({
    where: { workspaceId_provider: { workspaceId: u.workspaceId, provider: "GOOGLE" } },
    create: { workspaceId: u.workspaceId, provider: "GOOGLE", status: "CONNECTED", lastSuccessAt: new Date() },
    update: { status: "CONNECTED", lastSuccessAt: new Date(), lastError: null },
  });
  forgetBusy(userId);
}

export async function disconnectCalendar(ctx: Ctx) {
  const c = await prisma.calendarConnection.findUnique({ where: { userId: ctx.userId } });
  if (!c) throw new HttpError(409, "Your calendar is not connected.");
  await revoke(c);
  await prisma.calendarConnection.delete({ where: { id: c.id } });
  await audit.record({ workspaceId: ctx.workspaceId, actorId: ctx.userId, actorLabel: ctx.name, action: "integration.disconnected", targetType: "CalendarConnection", targetId: c.id, before: { provider: "GOOGLE", googleEmail: c.googleEmail } });
  forgetBusy(ctx.userId);
  return { message: "Calendar disconnected. Access at Google was revoked and the saved tokens were deleted." };
}

// ───────────────────────────── Booking (I3.3, I3.4, I3.5, I3.7) ─────────────────────────────

/** Employees for the booking dropdown. Without a working calendar they are listed but not bookable (I3.7). */
export async function bookableEmployees(ctx: Ctx) {
  requirePermission(ctx, "appointments.book");
  const users = await scoped(ctx).user.findMany({
    where: { isActive: true }, orderBy: { name: "asc" },
    select: { id: true, name: true, timezone: true, calendarConnection: { select: { status: true } } },
  });
  return users.map((u) => {
    const s = u.calendarConnection?.status;
    return {
      id: u.id, name: u.name, timezone: u.timezone, offset: offsetLabel(u.timezone),
      bookable: s === "CONNECTED",
      why: s === "CONNECTED" ? null : s === "NEEDS_RECONNECT" ? "Not bookable: calendar connection expired (needs reconnect)" : "Not bookable: calendar not connected",
    };
  });
}

const DateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose a date.");
const TimeStr = z.string().regex(/^\d{2}:\d{2}$/, "Choose a time.");
const Minutes = z.coerce.number().int().refine((m) => [15, 30, 45, 60, 90, 120].includes(m), "Choose a length.");
export const SlotSchema = z.object({ userId: z.string().min(1, "Choose an employee.").max(40), date: DateStr, time: TimeStr, minutes: Minutes, ignoreAppointmentId: z.string().max(40).optional() });

async function employee(ctx: Ctx, userId: string) {
  const u = await scoped(ctx).user.findFirst({ where: { id: userId, isActive: true }, include: { calendarConnection: true } });
  if (!u) throw NotFound();
  return u;
}

function toRange(date: string, time: string, minutes: number, tz: string) {
  const zone = isValidZone(tz) ? tz : "UTC";
  const start = zonedToUtc(date, time, zone);
  if (!start) throw new HttpError(422, `That time does not exist in ${zone} (clocks change that day). Pick another time.`);
  return { start, end: new Date(start.getTime() + minutes * 60_000), zone };
}

/** Live conflict check while the user picks a slot (I3.4). */
export async function checkSlot(ctx: Ctx, input: unknown) {
  requirePermission(ctx, "appointments.book");
  const f = SlotSchema.parse(input);
  const u = await employee(ctx, f.userId);
  const { start, end, zone } = toRange(f.date, f.time, f.minutes, u.timezone);
  if (start.getTime() < Date.now() - 60_000) return { ok: false as const, error: "That time is in the past. Pick a later time." };
  const fb = await freeBusy(u.id, start, end, f.ignoreAppointmentId);
  if (fb.state === "not_connected") return { ok: false as const, error: `${u.name} is not bookable: Google Calendar not connected.` };
  if (fb.state === "needs_reconnect") return { ok: false as const, error: `${u.name} is not bookable: their calendar connection expired. They must reconnect on My calendar.` };
  const overlaps = fb.busy.filter((b) => b.start < end && b.end > start);
  return {
    ok: true as const,
    startUtc: start, endUtc: end, timezone: zone,
    label: `${formatInZone(start, zone)}–${formatTimeInZone(end, zone)} (${zone}, ${offsetLabel(zone, start)})`,
    conflicts: overlaps.map((b) => `${u.name} is busy ${formatTimeInZone(b.start, zone)}–${formatTimeInZone(b.end, zone)}${b.source === "amanat" ? " (Amanat appointment)" : ""}`),
    canOverride: can(ctx, "leads.reassign"),
    warning: fb.state === "error" ? `Could not read ${u.name}'s calendar right now (${fb.error}). Busy times may be missing.` : null,
  };
}

export const BookSchema = SlotSchema.extend({
  contactId: z.string().min(1).max(40),
  opportunityId: z.string().max(40).optional(),
  note: z.string().trim().max(500).optional().default(""),
  override: z.coerce.boolean().optional().default(false),
});

/**
 * Book: lock this employee's bookings, re-check overlaps, reserve the row, create the Google event,
 * then save its id. Two people booking the same slot at once cannot both succeed.
 */
export async function book(ctx: Ctx, input: unknown) {
  requirePermission(ctx, "appointments.book");
  const f = BookSchema.parse(input);
  const contact = await scoped(ctx).contact.findFirst({ where: { id: f.contactId, deletedAt: null } });
  if (!contact) throw NotFound();
  const opp = f.opportunityId ? await scoped(ctx).opportunity.findFirst({ where: { id: f.opportunityId, contactId: contact.id, deletedAt: null } }) : null;
  if (f.opportunityId && !opp) throw NotFound();
  const u = await employee(ctx, f.userId);
  if (u.calendarConnection?.status !== "CONNECTED") throw new HttpError(409, `${u.name} is not bookable: ${u.calendarConnection ? "their calendar connection expired" : "Google Calendar not connected"}.`);
  const { start, end, zone } = toRange(f.date, f.time, f.minutes, u.timezone);
  if (start.getTime() < Date.now() - 60_000) throw new HttpError(422, "That time is in the past. Pick a later time.");
  if (f.override && !can(ctx, "leads.reassign")) throw new HttpError(403, "Only managers can book over a busy time.");

  const fb = await freeBusy(u.id, start, end);
  if (fb.state === "needs_reconnect") throw new HttpError(409, `${u.name}'s calendar connection expired. They must reconnect on My calendar.`);
  const googleConflicts = fb.busy.filter((b) => b.source === "google" && b.start < end && b.end > start);
  if (googleConflicts.length && !f.override) {
    const b = googleConflicts[0];
    throw new HttpError(409, `${u.name} is busy ${formatTimeInZone(b.start, zone)}–${formatTimeInZone(b.end, zone)}. Pick another time.`);
  }

  const title = `Amanat: ${contact.name}${opp ? ` – ${opp.title}` : ""}`.slice(0, 200);
  const appt = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${"appt:" + u.id}))`;
    const clash = await tx.appointment.findFirst({ where: { userId: u.id, status: { in: ["BOOKED", "RESCHEDULED"] }, startUtc: { lt: end }, endUtc: { gt: start } } });
    if (clash && !f.override) {
      throw new HttpError(409, `${u.name} already has an appointment ${formatTimeInZone(clash.startUtc, zone)}–${formatTimeInZone(clash.endUtc, zone)}. Pick another time.`);
    }
    return tx.appointment.create({
      data: { workspaceId: ctx.workspaceId, userId: u.id, contactId: contact.id, opportunityId: opp?.id ?? null, googleEventId: "pending", title, startUtc: start, endUtc: end, timezone: zone, status: "BOOKED", createdById: ctx.userId },
    });
  });

  let eventId: string;
  try {
    eventId = await insertEvent(u.id, {
      summary: title, start, end, timeZone: zone,
      description: `Booked in Amanat by ${ctx.name}.\nCustomer: ${contact.name}${contact.phone ? ` (${contact.phone})` : ""}\n${f.note ? `Note: ${f.note}\n` : ""}${appUrl()}/contacts/${contact.id}`,
    });
  } catch (e) {
    await prisma.appointment.delete({ where: { id: appt.id } }).catch(() => {});
    throw new HttpError(e instanceof ReconnectNeeded ? 409 : 502, `The appointment was not booked. ${(e as Error).message}`);
  }
  await prisma.appointment.update({ where: { id: appt.id }, data: { googleEventId: eventId } });
  forgetBusy(u.id);
  const when = `${formatInZone(start, zone)} (${zone})`;
  await timeline.add({ workspaceId: ctx.workspaceId, actorId: ctx.userId, type: "appointment", contactId: contact.id, opportunityId: opp?.id ?? null, summary: `Appointment booked with ${u.name} on ${when} by ${ctx.name}${f.override && (googleConflicts.length || fb.busy.length) ? " (booked over a busy time)" : ""}`, data: { appointmentId: appt.id } });
  await audit.record({ workspaceId: ctx.workspaceId, actorId: ctx.userId, actorLabel: ctx.name, action: "appointment.booked", targetType: "Appointment", targetId: appt.id, after: { userId: u.id, startUtc: start.toISOString(), endUtc: end.toISOString(), timezone: zone, override: f.override } });
  await leads.markActed({ workspaceId: ctx.workspaceId, contactId: contact.id, userId: ctx.userId, action: "appointment" });
  return { id: appt.id, message: `Booked with ${u.name}: ${when}.` };
}

async function loadAppointment(ctx: Ctx, id: string) {
  const a = await scoped(ctx).appointment.findFirst({ where: { id }, include: { contact: true } });
  if (!a) throw NotFound();
  return a;
}

export const RescheduleSchema = z.object({ appointmentId: z.string().min(1).max(40), date: DateStr, time: TimeStr, minutes: Minutes, override: z.coerce.boolean().optional().default(false) });

/** I3.6: move the Google event and record "Rescheduled from 15:00 to 16:00 by Hina". */
export async function reschedule(ctx: Ctx, input: unknown) {
  requirePermission(ctx, "appointments.book");
  const f = RescheduleSchema.parse(input);
  const a = await loadAppointment(ctx, f.appointmentId);
  if (a.status === "CANCELLED") throw new HttpError(409, "This appointment was cancelled. Book a new one instead.");
  const u = await employee(ctx, a.userId);
  const { start, end, zone } = toRange(f.date, f.time, f.minutes, a.timezone);
  if (start.getTime() < Date.now() - 60_000) throw new HttpError(422, "That time is in the past. Pick a later time.");
  if (f.override && !can(ctx, "leads.reassign")) throw new HttpError(403, "Only managers can book over a busy time.");
  const fb = await freeBusy(u.id, start, end, a.id);
  const clash = fb.busy.find((b) => b.start < end && b.end > start);
  if (clash && !f.override) throw new HttpError(409, `${u.name} is busy ${formatTimeInZone(clash.start, zone)}–${formatTimeInZone(clash.end, zone)}. Pick another time.`);

  try {
    await patchEvent(u.id, a.googleEventId, { summary: a.title, description: `Rescheduled in Amanat by ${ctx.name}. ${appUrl()}/contacts/${a.contactId}`, start, end, timeZone: zone });
  } catch (e) {
    throw new HttpError(e instanceof ReconnectNeeded ? 409 : 502, `Not rescheduled. ${(e as Error).message}`);
  }
  // Conditional on the old time, so two people rescheduling at once cannot silently overwrite each other (Q4).
  const { count } = await prisma.appointment.updateMany({
    where: { id: a.id, workspaceId: ctx.workspaceId, startUtc: a.startUtc, status: { not: "CANCELLED" } },
    data: { startUtc: start, endUtc: end, status: "RESCHEDULED" },
  });
  if (!count) throw new HttpError(409, "Someone else changed this appointment. Reload to see their change.");
  forgetBusy(u.id);
  const msg = `Rescheduled from ${formatInZone(a.startUtc, zone)} to ${formatInZone(start, zone)} (${zone}) by ${ctx.name}`;
  await timeline.add({ workspaceId: ctx.workspaceId, actorId: ctx.userId, type: "appointment", contactId: a.contactId, opportunityId: a.opportunityId, summary: msg, data: { appointmentId: a.id } });
  await audit.record({ workspaceId: ctx.workspaceId, actorId: ctx.userId, actorLabel: ctx.name, action: "appointment.rescheduled", targetType: "Appointment", targetId: a.id, before: { startUtc: a.startUtc.toISOString(), endUtc: a.endUtc.toISOString() }, after: { startUtc: start.toISOString(), endUtc: end.toISOString() } });
  await leads.markActed({ workspaceId: ctx.workspaceId, contactId: a.contactId, userId: ctx.userId, action: "appointment" });
  return { message: msg + "." };
}

export async function cancel(ctx: Ctx, appointmentId: string) {
  requirePermission(ctx, "appointments.book");
  const a = await loadAppointment(ctx, appointmentId);
  if (a.status === "CANCELLED") throw new HttpError(409, "This appointment is already cancelled.");
  try {
    await deleteEvent(a.userId, a.googleEventId);
  } catch (e) {
    throw new HttpError(e instanceof ReconnectNeeded ? 409 : 502, `Not cancelled. ${(e as Error).message}`);
  }
  const { count } = await prisma.appointment.updateMany({ where: { id: a.id, workspaceId: ctx.workspaceId, status: { not: "CANCELLED" } }, data: { status: "CANCELLED" } });
  if (!count) throw new HttpError(409, "This appointment is already cancelled.");
  forgetBusy(a.userId);
  const msg = `Appointment on ${formatInZone(a.startUtc, a.timezone)} (${a.timezone}) cancelled by ${ctx.name}`;
  await timeline.add({ workspaceId: ctx.workspaceId, actorId: ctx.userId, type: "appointment", contactId: a.contactId, opportunityId: a.opportunityId, summary: msg, data: { appointmentId: a.id } });
  await audit.record({ workspaceId: ctx.workspaceId, actorId: ctx.userId, actorLabel: ctx.name, action: "appointment.cancelled", targetType: "Appointment", targetId: a.id, before: { status: a.status } , after: { status: "CANCELLED" } });
  return { message: msg + ". It was removed from the calendar." };
}

export const ListQuery = z.object({ contactId: z.string().max(40).optional().catch(undefined), opportunityId: z.string().max(40).optional().catch(undefined) });

/** Appointments for the contact / opportunity pages. Shown in the viewer's zone and the employee's zone (I3.5). */
export async function listAppointments(ctx: Ctx, raw: Record<string, string | undefined>) {
  requirePermission(ctx, "crm.view");
  const f = ListQuery.parse(raw);
  const where: Prisma.AppointmentWhereInput = { ...(f.contactId ? { contactId: f.contactId } : {}), ...(f.opportunityId ? { opportunityId: f.opportunityId } : {}) };
  const rows = await scoped(ctx).appointment.findMany({ where, orderBy: { startUtc: "desc" }, take: 50, include: { contact: { select: { name: true } } } });
  const users = await scoped(ctx).user.findMany({ where: { id: { in: Array.from(new Set(rows.flatMap((r) => [r.userId, r.createdById]))) } }, select: { id: true, name: true } });
  const names = new Map(users.map((u) => [u.id, u.name]));
  const viewerTz = isValidZone(ctx.timezone) ? ctx.timezone : "UTC";
  return {
    canChange: can(ctx, "appointments.book"),
    canOverride: can(ctx, "leads.reassign"),
    viewerTimezone: viewerTz,
    items: rows.map((a) => ({
      id: a.id, title: a.title, status: a.status, contact: a.contact.name, employee: names.get(a.userId) ?? "Unknown",
      bookedBy: names.get(a.createdById) ?? "Unknown", timezone: a.timezone, startUtc: a.startUtc, endUtc: a.endUtc,
      minutes: Math.round((a.endUtc.getTime() - a.startUtc.getTime()) / 60_000),
      viewerLabel: `${formatInZone(a.startUtc, viewerTz)}–${formatTimeInZone(a.endUtc, viewerTz)} (${viewerTz})`,
      employeeLabel: a.timezone !== viewerTz ? `${formatInZone(a.startUtc, a.timezone)}–${formatTimeInZone(a.endUtc, a.timezone)} (${a.timezone}, employee's time)` : null,
      upcoming: a.endUtc.getTime() > Date.now() && a.status !== "CANCELLED",
      demo: a.googleEventId.startsWith("demo_"),
    })),
  };
}
