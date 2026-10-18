// P3 owns. Conversation list JSON (polled every 3s).
import { requireUser } from "@/lib/shared/contracts";
import { handler } from "@/lib/core/errors";
import { listConversations } from "@/lib/integrations/inbox";

export const dynamic = "force-dynamic";

export const GET = handler(async (req: Request) => {
  const ctx = await requireUser();
  return Response.json(await listConversations(ctx, Object.fromEntries(new URL(req.url).searchParams)));
});
