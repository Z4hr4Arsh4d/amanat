// P3 owns. Provider delivery-status words → our MessageStatus. `rank` stops late or out-of-order
// callbacks from moving a message backwards (delivered must never become sent again).
export const STATUS_MAP: Record<string, { status: "QUEUED" | "SENT" | "DELIVERED" | "READ" | "FAILED"; rank: number }> = {
  accepted: { status: "QUEUED", rank: 0 },
  scheduled: { status: "QUEUED", rank: 0 },
  queued: { status: "QUEUED", rank: 0 },
  sending: { status: "QUEUED", rank: 0 },
  sent: { status: "SENT", rank: 1 },
  delivered: { status: "DELIVERED", rank: 2 },
  read: { status: "READ", rank: 3 },
  failed: { status: "FAILED", rank: 4 },
  undelivered: { status: "FAILED", rank: 4 },
};
