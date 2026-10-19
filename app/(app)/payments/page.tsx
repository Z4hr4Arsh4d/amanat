// P3 owns. Payments: collected vs projected (I2.6), every payment with its Stripe reference (I2.7), new requests (I2.1).
import { requireUserPage, can } from "@/lib/shared/contracts";
import { PaymentsClient } from "./PaymentsClient";
import { NoAccess } from "@/components/ui/NoAccess";
import { PageHeader } from "@/components/ui/Kit";

export const dynamic = "force-dynamic";

export default async function PaymentsPage({ searchParams }: { searchParams: Promise<{ month?: string; status?: string }> }) {
  const ctx = await requireUserPage();
  const sp = await searchParams;
  if (!can(ctx, "crm.view")) return <NoAccess what="view payments (this needs the “View CRM records” permission)" />;
  return (
    <div className="space-y-6">
      <PageHeader title="Payments" description="Stripe payment links and their status. Updates live when Stripe confirms a payment or refund." />
      <PaymentsClient initial={{ month: sp.month === "current" ? "current" : "", status: sp.status ?? "" }} canRequest={can(ctx, "payments.request")} />
    </div>
  );
}
