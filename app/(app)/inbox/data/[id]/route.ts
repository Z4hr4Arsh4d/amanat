// P3 owns. One conversation's messages (polled every 3s). 404 if not visible to you.
import { z } from "zod";
import { requireUser } from "@/lib/shared/contracts";
import { handler, NotFound } from "@/lib/core/errors";
import { getThread } from "@/lib/integrations/inbox";

export const dynamic = "force-dynamic";

export const GET = handler(async (_req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const ctx = await requireUser();
  const id = z.string().min(1).max(40).safeParse((await params).id);
  if (!id.success) throw NotFound();
  return Response.json(await getThread(ctx, id.data));
});
