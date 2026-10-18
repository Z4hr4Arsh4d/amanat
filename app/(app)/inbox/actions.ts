"use server";
// P3 owns. Inbox server actions. Visibility (I1.6) is checked inside lib/integrations/inbox.ts.
import { z } from "zod";
import { requireUser } from "@/lib/shared/contracts";
import { safe, type ActionResult } from "@/lib/integrations/action";
import * as inbox from "@/lib/integrations/inbox";

const Id = z.string().min(1).max(40);

type SendData = { messageId?: string; delayed?: boolean };
export async function sendMessageAction(input: unknown): Promise<ActionResult<SendData>> {
  return safe<SendData>(async () => {
    const ctx = await requireUser();
    const r = await inbox.sendMessage(ctx, input);
    if (r.ok) {
      return r.error
        ? { ok: true, message: `Not sent yet: ${r.error} We will retry automatically.`, data: { messageId: r.messageId, delayed: true } }
        : { ok: true, message: "Message sent.", data: { messageId: r.messageId, delayed: false } };
    }
    return { ok: false, error: r.error ?? "The message could not be sent." };
  });
}

export async function retryMessageAction(messageId: unknown): Promise<ActionResult> {
  return safe(async () => {
    const ctx = await requireUser();
    const r = await inbox.retryMessage(ctx, Id.parse(messageId));
    return r.ok ? { ok: true, message: r.error ? `Retrying: ${r.error}` : "Message sent again." } : { ok: false, error: r.error ?? "Retry failed." };
  });
}

export async function setAssigneeAction(conversationId: unknown, userId: unknown): Promise<ActionResult> {
  return safe(async () => {
    const ctx = await requireUser();
    const uid = z.union([Id, z.literal("")]).parse(userId);
    return inbox.setAssignee(ctx, Id.parse(conversationId), uid || null);
  });
}
