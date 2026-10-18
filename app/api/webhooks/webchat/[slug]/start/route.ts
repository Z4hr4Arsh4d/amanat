// P3 owns. Public: a customer starts a chat. Validated, rate limited, honeypot-protected (see lib/integrations/webchat.ts).
import { ChatError, startChat } from "@/lib/integrations/webchat";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  try {
    const body = await req.json().catch(() => null);
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() || "unknown";
    return Response.json(await startChat((await params).slug, body, ip));
  } catch (e) {
    if (e instanceof ChatError) return Response.json({ error: e.message }, { status: e.status });
    console.error("[webchat start]", e);
    return Response.json({ error: "Something went wrong on our side. Please try again in a moment." }, { status: 500 });
  }
}
