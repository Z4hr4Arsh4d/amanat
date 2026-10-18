// P2 owns. THE ONLY PLACE dashboard figures are computed (F5.2, Q12, Section 7 definitions).
// Lists and drill-downs must call the same functions so numbers always match.
export type Scope = { workspaceId: string; userId?: string }; // userId set → personal figures (F5.4)

export async function newLeadsToday(s: Scope) { void s; return 0; }
export async function avgFirstResponseSeconds(s: Scope) { void s; return null as number | null; }
export async function escalationsLast24h(s: Scope) { void s; return 0; }
export async function recoveryQueue(s: Scope) { void s; return [] as { leadId: string; reason: string }[]; }
