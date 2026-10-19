"use client";
// P3 owns this slot. P1 places it on the contact / opportunity pages. Keep the props stable.
// Book an appointment on an employee's calendar, with time zone and conflict checks (I3.3–I3.5, I3.7).
import { BookAppointmentForm } from "@/lib/integrations/ui/Calendar";
import { Panel } from "@/components/ui/Kit";

export function BookAppointmentSlot(props: { contactId: string; opportunityId?: string }) {
  return (
    <Panel id="book-appt" title="Book an appointment">
      <BookAppointmentForm contactId={props.contactId} opportunityId={props.opportunityId} />
    </Panel>
  );
}
