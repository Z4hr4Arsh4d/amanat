// P3 owns. STUB. Signature is a CONTRACT (used by P2's routing).
/** Is this employee in a Google Calendar event right now? false if not connected or on any error. */
export async function isBusyNow(userId: string): Promise<false | { until: Date }> {
  void userId;
  return false;
}
