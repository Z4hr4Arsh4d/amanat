// P3 owns. STUBS. Signatures are CONTRACTS.
/** Send a WhatsApp message on a conversation (respects opt-out, goes through the outbox). */
export async function send(input: { workspaceId: string; contactId: string; body: string; userId: string | null }): Promise<{ ok: boolean; messageId?: string; error?: string }> {
  void input;
  return { ok: false, error: "not implemented" };
}
/** Tell the customer their lead changed hands, e.g. "Hina is unavailable; Omar is now handling your request." */
export async function notifyHandoff(input: { workspaceId: string; contactId: string; newOwnerName: string }): Promise<void> {
  void input;
}
