// P3 owns. Public customer chat page. Share this link with customers (or open it yourself to test).
import { chatWorkspace } from "@/lib/integrations/webchat";
import { ChatClient } from "./ChatClient";

export const dynamic = "force-dynamic";
export const metadata = { title: "Chat with us", robots: { index: false } };

export default async function ChatPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const ws = await chatWorkspace(slug).catch(() => null);
  if (!ws || !ws.enabled) {
    return (
      <main className="grid min-h-dvh place-items-center bg-stone-50 p-4 text-stone-900">
        <div className="max-w-sm rounded-xl border border-stone-200 bg-white p-6 text-center shadow-sm">
          <h1 className="text-lg font-semibold">Chat is not available</h1>
          <p className="mt-2 text-sm text-stone-600">{ws ? "The chat is switched off right now." : "We could not find this company."} Please contact them another way.</p>
        </div>
      </main>
    );
  }
  return <ChatClient slug={slug} company={ws.name} />;
}
