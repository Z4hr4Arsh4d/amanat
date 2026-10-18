// P3 owns. WhatsApp Cloud API (Meta) webhook. Paste this URL + the verify token into
// Meta app → WhatsApp → Configuration → Webhook, and subscribe to the "messages" field.
import { handleMetaVerify, handleMetaWebhook } from "@/lib/integrations/meta-inbound";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type P = { params: Promise<{ integrationId: string }> };

export async function GET(req: Request, { params }: P) {
  return handleMetaVerify(req, (await params).integrationId);
}

export async function POST(req: Request, { params }: P) {
  return handleMetaWebhook(req, (await params).integrationId);
}
