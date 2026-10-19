"use client";
// P3 owns this slot. P1 places it on the contact / opportunity pages. Keep the props stable.
// Payments for this contact or opportunity, live (status changes from Stripe appear without a refresh).
import { PaymentListView } from "@/lib/integrations/ui/Payments";
import { Panel } from "@/components/ui/Kit";

export function PaymentsSlot(props: { contactId?: string; opportunityId?: string }) {
  const query: Record<string, string> = {
    ...(props.contactId ? { contactId: props.contactId } : {}),
    ...(props.opportunityId ? { opportunityId: props.opportunityId } : {}),
  };
  return (
    <Panel id="pay-list" title="Payments">
      <PaymentListView query={query} compact={!!props.opportunityId} emptyText="No payment requests yet." />
    </Panel>
  );
}
