"use server";
// P3 owns. Calendar actions. Permissions and workspace checks are inside lib/integrations/appointments.ts.
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/shared/contracts";
import { safe, type ActionResult } from "@/lib/integrations/action";
import * as appts from "@/lib/integrations/appointments";

export async function connectDemoCalendarAction(): Promise<ActionResult> {
  return safe(async () => {
    const ctx = await requireUser();
    const r = await appts.connectDemo(ctx);
    revalidatePath("/settings/calendar");
    return { ok: true, message: r.message };
  });
}

export async function disconnectCalendarAction(): Promise<ActionResult> {
  return safe(async () => {
    const ctx = await requireUser();
    const r = await appts.disconnectCalendar(ctx);
    revalidatePath("/settings/calendar");
    return { ok: true, message: r.message };
  });
}

export async function bookAppointmentAction(input: unknown): Promise<ActionResult> {
  return safe(async () => {
    const ctx = await requireUser();
    const r = await appts.book(ctx, input);
    return { ok: true, message: r.message };
  });
}

export async function rescheduleAppointmentAction(input: unknown): Promise<ActionResult> {
  return safe(async () => {
    const ctx = await requireUser();
    const r = await appts.reschedule(ctx, input);
    return { ok: true, message: r.message };
  });
}

export async function cancelAppointmentAction(appointmentId: unknown): Promise<ActionResult> {
  return safe(async () => {
    const ctx = await requireUser();
    const r = await appts.cancel(ctx, z.string().min(1).max(40).parse(appointmentId));
    return { ok: true, message: r.message };
  });
}

type Check = Awaited<ReturnType<typeof appts.checkMyCalendar>>;
export async function checkCalendarAction(): Promise<ActionResult<Check>> {
  return safe<Check>(async () => {
    const ctx = await requireUser();
    const r = await appts.checkMyCalendar(ctx);
    return { ok: true, message: r.steps.every((s) => s.ok) ? "Your calendar works." : "Some checks failed. See the details below.", data: r };
  });
}

type TestEvent = { start: string; end: string; link: string | null; demo: boolean };
export async function addTestEventAction(): Promise<ActionResult<TestEvent>> {
  return safe<TestEvent>(async () => {
    const ctx = await requireUser();
    const r = await appts.addMyTestEvent(ctx);
    return { ok: true, message: r.message, data: { start: r.start.toISOString(), end: r.end.toISOString(), link: r.link, demo: r.demo } };
  });
}
