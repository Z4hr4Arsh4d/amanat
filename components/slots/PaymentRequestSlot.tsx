"use client";
// P3 owns this slot. P1 places it on the opportunity page. Keep the props stable.
// Create a Stripe payment link for this opportunity, then copy it or send it on WhatsApp (I2.1).
import { useSWRConfig } from "swr";
import { PaymentRequestForm } from "@/lib/integrations/ui/Payments";
import { Panel } from "@/components/ui/Kit";

export function PaymentRequestSlot(props: { opportunityId: string }) {
  const { mutate } = useSWRConfig();
  return (
    <Panel id="pay-req" title="Request a payment">
      <PaymentRequestForm opportunityId={props.opportunityId}
        onCreated={() => mutate((k) => typeof k === "string" && k.startsWith("/payments/data?"))} />
    </Panel>
  );
}
