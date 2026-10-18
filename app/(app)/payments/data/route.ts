// P3 owns. Payments list + collected/projected summary (polled every 3s).
import { requireUser } from "@/lib/shared/contracts";
import { handler } from "@/lib/core/errors";
import { listPayments } from "@/lib/integrations/payments";

export const dynamic = "force-dynamic";

export const GET = handler(async (req: Request) => {
  const ctx = await requireUser();
  return Response.json(await listPayments(ctx, Object.fromEntries(new URL(req.url).searchParams)));
});
