// P1 owns. STUB — replace body. Signature is a CONTRACT.
// Everyone calls this to put something on a contact's / opportunity's history (F2.7).
import type { Prisma } from "@prisma/client";

export type TimelineType =
  | "note" | "stage_change" | "assignment" | "field_edit" | "message" | "payment"
  | "appointment" | "lead_created" | "escalation" | "acknowledged" | "opt_out";

export type TimelineInput = {
  workspaceId: string;
  actorId: string | null; // null = system
  type: TimelineType;
  summary: string; // human sentence, e.g. "Payment of PKR 50,000 received"
  contactId?: string | null;
  opportunityId?: string | null;
  leadId?: string | null;
  data?: Prisma.InputJsonValue;
};

export async function add(input: TimelineInput): Promise<void> {
  console.log("[timeline stub]", input.type, input.summary);
}
