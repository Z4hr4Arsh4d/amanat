// P3 owns. JSON for the sync history table (polled every 3s by SWR).
import { requireUser } from "@/lib/shared/contracts";
import { handler } from "@/lib/core/errors";
import { listEvents } from "@/lib/integrations/history";

export const dynamic = "force-dynamic";

export const GET = handler(async (req: Request) => {
  const ctx = await requireUser();
  const params = Object.fromEntries(new URL(req.url).searchParams);
  return Response.json(await listEvents(ctx, params));
});
