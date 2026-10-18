"use client";
// P3 owns this slot. P1 places it on the opportunity page. Keep the props stable.
// Create a Stripe payment link for this opportunity, then copy it or send it on WhatsApp (I2.1).
import { useSWRConfig } from "swr";
import { PaymentRequestForm } from "@/lib/integrations/ui/Payments";

export function PaymentRequestSlot(props: { opportunityId: string }) {
  const { mutate } = useSWRConfig();
  return (
    <section aria-labelledby="pay-req" className="space-y-2">
      <h2 id="pay-req" className="text-lg font-semibold">Request a payment</h2>
      <PaymentRequestForm opportunityId={props.opportunityId}
        onCreated={() => mutate((k) => typeof k === "string" && k.startsWith("/payments/data?"))} />
    </section>
  );
}
