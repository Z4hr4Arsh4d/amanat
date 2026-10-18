// P3 owns. Opportunities you may request a payment for (picker + default amount).
import { z } from "zod";
import { requireUser } from "@/lib/shared/contracts";
import { handler } from "@/lib/core/errors";
import { requestableOpportunities } from "@/lib/integrations/payments";

export const dynamic = "force-dynamic";
const Q = z.object({ q: z.string().trim().max(80).optional().catch(undefined), id: z.string().max(40).optional().catch(undefined) });

export const GET = handler(async (req: Request) => {
  const ctx = await requireUser();
  const f = Q.parse(Object.fromEntries(new URL(req.url).searchParams));
  return Response.json({ items: await requestableOpportunities(ctx, f.q, f.id) });
});
