"use client";
// P3 owns this slot. P1 places it on the contact / opportunity pages. Keep the props stable.
// Appointments in your time zone (and the employee's, if different), with reschedule and cancel (I3.5, I3.6).
import { AppointmentList } from "@/lib/integrations/ui/Calendar";

export function AppointmentsSlot(props: { contactId?: string; opportunityId?: string }) {
  const query: Record<string, string> = {
    ...(props.contactId ? { contactId: props.contactId } : {}),
    ...(props.opportunityId ? { opportunityId: props.opportunityId } : {}),
  };
  return (
    <section aria-labelledby="appts" className="space-y-2">
      <h2 id="appts" className="text-lg font-semibold">Appointments</h2>
      <AppointmentList query={query} emptyText="No appointments yet." />
    </section>
  );
}
