// P3 owns. Stripe webhook endpoint. Add it in Stripe → Developers → Webhooks with the events listed on /integrations.
// Steps: 1) verify signature on the raw body  2) dedupe by event id  3) process  4) log IntegrationEvent.
import { handleStripeWebhook } from "@/lib/integrations/stripe-webhook";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: Promise<{ integrationId: string }> }) {
  return handleStripeWebhook(req, (await params).integrationId);
}
