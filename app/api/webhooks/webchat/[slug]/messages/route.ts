// P3 owns. Public: a customer reads (GET) or sends (POST) messages in their own chat session.
// The session token travels in the X-Chat-Token header; it is signed, so it cannot be guessed or edited.
import { ChatError, chatMessages, sendChat } from "@/lib/integrations/webchat";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type P = { params: Promise<{ slug: string }> };
const fail = (e: unknown) => {
  if (e instanceof ChatError) return Response.json({ error: e.message }, { status: e.status });
  console.error("[webchat]", e);
  return Response.json({ error: "Something went wrong on our side. Please try again in a moment." }, { status: 500 });
};

export async function GET(req: Request, { params }: P) {
  try {
    return Response.json(await chatMessages((await params).slug, req.headers.get("x-chat-token")));
  } catch (e) {
    return fail(e);
  }
}

export async function POST(req: Request, { params }: P) {
  try {
    const body = await req.json().catch(() => null);
    return Response.json(await sendChat((await params).slug, req.headers.get("x-chat-token"), body));
  } catch (e) {
    return fail(e);
  }
}
