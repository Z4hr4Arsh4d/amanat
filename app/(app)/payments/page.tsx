// P3 owns. Payments: collected vs projected (I2.6), every payment with its Stripe reference (I2.7), new requests (I2.1).
import { requireUserPage, can } from "@/lib/shared/contracts";
import { PaymentsClient } from "./PaymentsClient";

export const dynamic = "force-dynamic";

export default async function PaymentsPage({ searchParams }: { searchParams: Promise<{ month?: string; status?: string }> }) {
  const ctx = await requireUserPage();
  const sp = await searchParams;
  if (!can(ctx, "crm.view")) {
    return (
      <section className="mx-auto max-w-3xl space-y-2">
        <h1 className="text-2xl font-semibold">Payments</h1>
        <p role="alert" className="rounded border border-red-300 bg-red-50 p-3 text-sm text-red-900"><span aria-hidden="true">⚠ </span>You don&apos;t have permission to view CRM records. Ask an admin to give your role “View CRM records”.</p>
      </section>
    );
  }
  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <header>
        <h1 className="text-2xl font-semibold">Payments</h1>
        <p className="text-sm text-stone-600">Stripe payment links and their status. Updates live when Stripe confirms a payment or refund.</p>
      </header>
      <PaymentsClient initial={{ month: sp.month === "current" ? "current" : "", status: sp.status ?? "" }} canRequest={can(ctx, "payments.request")} />
    </div>
  );
}
