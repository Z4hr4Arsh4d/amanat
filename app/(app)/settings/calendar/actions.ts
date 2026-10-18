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
