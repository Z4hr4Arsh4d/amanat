// P3 owns. Delivery status callbacks for messages we send (sent / delivered / read / failed).
import { handleStatus, verifyTwilioRequest } from "@/lib/integrations/twilio-inbound";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: Promise<{ integrationId: string }> }) {
  const { integrationId } = await params;
  const v = await verifyTwilioRequest(req, integrationId, "/status", "message.status");
  if (!v.ok) return v.response;
  return handleStatus(v.integration, v.params, new URL(req.url).searchParams.get("m"));
}
