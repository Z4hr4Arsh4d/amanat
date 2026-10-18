"use client";
// P3 owns this slot. P1 places it on the contact / opportunity pages. Keep the props stable.
// Payments for this contact or opportunity, live (status changes from Stripe appear without a refresh).
import { PaymentListView } from "@/lib/integrations/ui/Payments";

export function PaymentsSlot(props: { contactId?: string; opportunityId?: string }) {
  const query: Record<string, string> = {
    ...(props.contactId ? { contactId: props.contactId } : {}),
    ...(props.opportunityId ? { opportunityId: props.opportunityId } : {}),
  };
  return (
    <section aria-labelledby="pay-list" className="space-y-2">
      <h2 id="pay-list" className="text-lg font-semibold">Payments</h2>
      <PaymentListView query={query} compact={!!props.opportunityId} emptyText="No payment requests yet." />
    </section>
  );
}
