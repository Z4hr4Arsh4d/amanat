// P3 owns. STUBS. Signatures are CONTRACTS (used by P2's dashboard).
/** Collected revenue (Section 7): payments confirmed by Stripe webhook minus confirmed refunds, in minor units. */
export async function collected(workspaceId: string, from: Date, to: Date, userId?: string): Promise<number> {
  void workspaceId; void from; void to; void userId;
  return 0;
}
/** Projected revenue (Section 7): open opportunity values + unpaid payment requests. */
export async function projected(workspaceId: string, userId?: string): Promise<number> {
  void workspaceId; void userId;
  return 0;
}
