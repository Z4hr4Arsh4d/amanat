// P3 owns. Incoming WhatsApp messages. Paste this URL into Twilio → Sandbox → "When a message comes in".
// Steps: 1) verify signature  2) dedupe by MessageSid  3) process  4) log IntegrationEvent.
import { handleInbound, verifyTwilioRequest } from "@/lib/integrations/twilio-inbound";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: Promise<{ integrationId: string }> }) {
  const { integrationId } = await params;
  const v = await verifyTwilioRequest(req, integrationId, "", "message.inbound");
  if (!v.ok) return v.response;
  return handleInbound(v.integration, v.params);
}
