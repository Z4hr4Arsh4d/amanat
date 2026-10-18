// P2 owns. Dashboard tile ids and names (kept out of actions.ts: a "use server" file may only export functions).
export const TILES = [
  { id: "newLeads", label: "New leads today" },
  { id: "pipeline", label: "Open pipeline value by stage" },
  { id: "firstResponse", label: "Average time to first response" },
  { id: "recovery", label: "Recovery queue" },
  { id: "escalations", label: "Escalations in the last 24 hours" },
  { id: "availability", label: "Employee availability" },
  { id: "appointments", label: "Upcoming appointments" },
  { id: "payments", label: "Payments received this month" },
  { id: "atRisk", label: "Revenue at risk (extra)" },
] as const;
