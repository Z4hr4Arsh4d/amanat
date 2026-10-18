// P3 owns. The WhatsApp conversation for a contact page (ConversationSlot).
import { z } from "zod";
import { requireUser } from "@/lib/shared/contracts";
import { handler, NotFound } from "@/lib/core/errors";
import { threadForContact } from "@/lib/integrations/inbox";

export const dynamic = "force-dynamic";

export const GET = handler(async (_req: Request, { params }: { params: Promise<{ contactId: string }> }) => {
  const ctx = await requireUser();
  const id = z.string().min(1).max(40).safeParse((await params).contactId);
  if (!id.success) throw NotFound();
  return Response.json(await threadForContact(ctx, id.data));
});
