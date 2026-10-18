// P2 owns. STUB. Signature is a CONTRACT.
// In-app notification + Telegram alert (F3.9, I4).
export async function alert(input: {
  workspaceId: string;
  userId: string;
  leadId: string;
  title: string; // "Lead escalated to you"
  reason: string; // "Hina did not acknowledge within 60s (level 2 of 3)"
}): Promise<void> {
  console.log("[notify stub]", input.userId, input.title, input.reason);
}
