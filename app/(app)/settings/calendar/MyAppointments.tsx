"use client";
// P3 owns. Upcoming appointments with the logged-in employee (live).
import { AppointmentList } from "@/lib/integrations/ui/Calendar";

export function MyAppointments() {
  return <AppointmentList query={{ mine: "1" }} emptyText="No upcoming appointments with you. Book one from a contact or opportunity page." />;
}
