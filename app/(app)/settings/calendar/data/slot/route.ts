// P3 owns. Live conflict check for a chosen slot (I3.4).
import { requireUser } from "@/lib/shared/contracts";
import { handler } from "@/lib/core/errors";
import { checkSlot } from "@/lib/integrations/appointments";

export const dynamic = "force-dynamic";
export const GET = handler(async (req: Request) => {
  const ctx = await requireUser();
  return Response.json(await checkSlot(ctx, Object.fromEntries(new URL(req.url).searchParams)));
});
