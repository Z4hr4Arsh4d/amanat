// P3 owns. Appointments for a contact or opportunity (polled every 3s).
import { requireUser } from "@/lib/shared/contracts";
import { handler } from "@/lib/core/errors";
import { listAppointments } from "@/lib/integrations/appointments";

export const dynamic = "force-dynamic";
export const GET = handler(async (req: Request) => {
  const ctx = await requireUser();
  return Response.json(await listAppointments(ctx, Object.fromEntries(new URL(req.url).searchParams)));
});
