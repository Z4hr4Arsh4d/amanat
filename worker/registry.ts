// APPEND-ONLY. Jobs the worker runs every tick (2s). Each job must be safe to run
// twice at the same time (use conditional updates with `version`) — Q5.
import { retryDue } from "@/lib/integrations/outbox";
<<<<<<< HEAD
import { escalationSweep } from "@/lib/leads/escalate";
import { retryNotifications } from "@/lib/notify";
=======
import { markAbandonedPayments } from "@/lib/integrations/payments-sweeper";
>>>>>>> origin/main

export type Job = { name: string; run: () => Promise<void> };

export const JOBS: Job[] = [
  // P2: { name: "escalation-sweep", run: escalationSweep },
  // P2: { name: "notification-retry", run: retryNotifications },
  { name: "outbox-retry", run: retryDue }, // P3
  // P3: { name: "stripe-abandoned", run: markAbandonedPayments },
<<<<<<< HEAD
  { name: "escalation-sweep", run: escalationSweep }, // P2
  { name: "notification-retry", run: retryNotifications }, // P2
=======
  { name: "stripe-abandoned", run: markAbandonedPayments }, // P3
>>>>>>> origin/main
];
