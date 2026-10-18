// P2 owns. STUBS — replace bodies (PLAN.md §3). Signatures are CONTRACTS.

/** Create a lead for a contact and assign it immediately. Called by the web form, manual entry and P3's WhatsApp webhook. */
export { intake } from "./intake";

/** Any recorded action on a contact (note, message, stage change, appointment, call) counts as acknowledgement of that user's open lead. */
export async function markActed(input: { workspaceId: string; contactId: string; userId: string; action: string }): Promise<void> {
  void input;
}

/** Explicit Acknowledge click (web or Telegram button). */
export async function acknowledge(input: { workspaceId: string; leadId: string; userId: string }): Promise<{ ok: boolean; message: string }> {
  void input;
  return { ok: false, message: "not implemented" };
}

/** Called by setStatus() when someone goes On leave / Offline (F3.6). */
export async function handleAbsence(input: { workspaceId: string; userId: string }): Promise<void> {
  void input;
}
