"use client";
// P3 owns. The customer's side of the chat: a short start form, then a live conversation.
import { useCallback, useEffect, useId, useRef, useState } from "react";

type Msg = { id: string; from: "you" | "team"; sender: string; body: string; at: string; read: boolean };

const input = "w-full rounded-lg border border-stone-300 bg-white px-3 py-2.5 text-base focus:outline-none focus:ring-2 focus:ring-emerald-700";

function time(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export function ChatClient({ slug, company }: { slug: string; company: string }) {
  const base = `/api/webhooks/webchat/${slug}`;
  const storeKey = `amanat-chat-${slug}`;
  const [token, setToken] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [optedOut, setOptedOut] = useState(false);

  useEffect(() => {
    try { setToken(localStorage.getItem(storeKey)); } catch { /* private mode: chat still works until reload */ }
    setReady(true);
  }, [storeKey]);

  const endChat = useCallback(() => {
    try { localStorage.removeItem(storeKey); } catch { /* ignore */ }
    setToken(null); setMessages([]); setError(null);
  }, [storeKey]);

  // Poll for new messages every 2 seconds while a chat is open.
  useEffect(() => {
    if (!token) return;
    let stop = false;
    async function load() {
      try {
        const r = await fetch(`${base}/messages`, { headers: { "x-chat-token": token! }, cache: "no-store" });
        const j = await r.json().catch(() => ({}));
        if (stop) return;
        if (r.status === 401) { endChat(); setError("Your chat session expired. Please start a new chat."); return; }
        if (!r.ok) { setError(j.error ?? "Could not load messages."); return; }
        setError(null); setMessages(j.messages); setOptedOut(!!j.optedOut);
      } catch {
        if (!stop) setError("Connection problem. Trying again…");
      }
    }
    load();
    const t = setInterval(load, 2000);
    return () => { stop = true; clearInterval(t); };
  }, [token, base, endChat]);

  return (
    <main className="flex min-h-dvh flex-col items-center bg-stone-100 text-stone-900 sm:p-6">
      <div className="flex min-h-dvh w-full max-w-md flex-col overflow-hidden bg-white shadow-sm sm:min-h-0 sm:h-[44rem] sm:max-h-[90dvh] sm:rounded-2xl sm:border sm:border-stone-200">
        <header className="flex items-center justify-between gap-2 bg-emerald-800 px-4 py-3 text-white">
          <div className="min-w-0">
            <h1 className="truncate text-base font-semibold">{company}</h1>
            <p className="text-xs text-emerald-100">{token ? "We reply here as soon as we can" : "Chat with our team"}</p>
          </div>
          {token && (
            <button type="button" onClick={() => { if (confirm("End this chat and start a new one? Your earlier messages stay with the company.")) endChat(); }}
              className="shrink-0 rounded border border-emerald-300 px-2 py-1 text-xs hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-white">
              New chat
            </button>
          )}
        </header>
        {!ready ? <p className="p-4 text-sm text-stone-600">Loading…</p>
          : token ? <Conversation base={base} token={token} messages={messages} error={error} optedOut={optedOut} onExpired={endChat} />
          : <StartForm base={base} company={company} initialError={error} onStarted={(t) => { try { localStorage.setItem(storeKey, t); } catch { /* ignore */ } setError(null); setToken(t); }} />}
      </div>
    </main>
  );
}

function StartForm({ base, company, initialError, onStarted }: { base: string; company: string; initialError: string | null; onStarted: (token: string) => void }) {
  const ids = { name: useId(), phone: useId(), msg: useId() };
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(initialError);
  return (
    <form className="flex flex-1 flex-col gap-3 overflow-y-auto p-4"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true); setError(null);
        try {
          const r = await fetch(`${base}/start`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(Object.fromEntries(new FormData(e.currentTarget))) });
          const j = await r.json().catch(() => ({}));
          if (!r.ok) setError(j.error ?? "Could not start the chat. Please try again.");
          else onStarted(j.token);
        } catch {
          setError("Could not reach the server. Check your internet connection and try again.");
        } finally {
          setBusy(false);
        }
      }}>
      <p className="text-sm text-stone-700">Hi! Tell {company} what you need. A team member will reply here in a few minutes.</p>
      <div className="space-y-1">
        <label htmlFor={ids.name} className="block text-sm font-medium">Your name</label>
        <input id={ids.name} name="name" required minLength={2} maxLength={80} autoComplete="name" placeholder="e.g. Ahmed Raza" className={input} />
      </div>
      <div className="space-y-1">
        <label htmlFor={ids.phone} className="block text-sm font-medium">Your phone number</label>
        <input id={ids.phone} name="phone" type="tel" required maxLength={30} autoComplete="tel" placeholder="e.g. 0300 1234567" className={input} aria-describedby={`${ids.phone}-h`} />
        <p id={`${ids.phone}-h`} className="text-xs text-stone-600">So the team can follow up if we get disconnected.</p>
      </div>
      <div className="space-y-1">
        <label htmlFor={ids.msg} className="block text-sm font-medium">How can we help?</label>
        <textarea id={ids.msg} name="message" required maxLength={1000} rows={4} placeholder="e.g. Hi, I need a quote for a 5kW solar system." className={`${input} resize-y`} />
      </div>
      {/* Honeypot: hidden from people, bots fill it in */}
      <div aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
        <label>Website<input name="website" tabIndex={-1} autoComplete="off" /></label>
      </div>
      {error && <p role="alert" className="rounded border border-red-300 bg-red-50 p-2 text-sm text-red-900"><span aria-hidden="true">⚠ </span>{error}</p>}
      <button type="submit" disabled={busy} className="mt-auto rounded-lg bg-emerald-800 px-4 py-3 text-base font-medium text-white hover:bg-emerald-900 focus:outline-none focus:ring-2 focus:ring-emerald-700 focus:ring-offset-2 disabled:opacity-60">
        {busy ? "Starting…" : "Start chat"}
      </button>
    </form>
  );
}

function Conversation({ base, token, messages, error, optedOut, onExpired }: { base: string; token: string; messages: Msg[]; error: string | null; optedOut: boolean; onExpired: () => void }) {
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [pending, setPending] = useState<{ id: string; body: string }[]>([]);
  const endRef = useRef<HTMLDivElement>(null);
  const inputId = useId();

  const shown = [...messages];
  // Show what the customer just sent right away, until the server list includes it.
  const known = new Set(messages.filter((m) => m.from === "you").map((m) => m.body));
  const waiting = pending.filter((p) => !known.has(p.body));
  useEffect(() => { endRef.current?.scrollIntoView({ block: "end" }); }, [shown.length, waiting.length]);

  async function send() {
    const body = text.trim();
    if (!body || sending) return;
    setSending(true); setSendError(null);
    const clientId = crypto.randomUUID().replace(/-/g, "");
    setPending((p) => [...p, { id: clientId, body }]);
    setText("");
    try {
      const r = await fetch(`${base}/messages`, { method: "POST", headers: { "Content-Type": "application/json", "x-chat-token": token }, body: JSON.stringify({ text: body, clientId }) });
      const j = await r.json().catch(() => ({}));
      if (r.status === 401) { onExpired(); return; }
      if (!r.ok) { setSendError(j.error ?? "Your message could not be sent."); setPending((p) => p.filter((x) => x.id !== clientId)); setText(body); }
    } catch {
      setSendError("Could not reach the server. Check your internet connection and press Send again.");
      setPending((p) => p.filter((x) => x.id !== clientId)); setText(body);
    } finally {
      setSending(false);
    }
  }

  return (
    <>
      <div className="flex-1 space-y-2 overflow-y-auto bg-stone-50 p-3" role="log" aria-live="polite" aria-label="Chat messages">
        {shown.length === 0 && waiting.length === 0 && <p className="text-center text-sm text-stone-600">Starting your chat…</p>}
        {shown.map((m) => (
          <div key={m.id} className={`flex ${m.from === "you" ? "justify-end" : "justify-start"}`}>
            <div className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm ${m.from === "you" ? "rounded-br-sm bg-emerald-700 text-white" : "rounded-bl-sm border border-stone-200 bg-white"}`}>
              {m.from === "team" && <p className="mb-0.5 text-xs font-semibold text-emerald-800">{m.sender}</p>}
              <p className="whitespace-pre-wrap break-words">{m.body}</p>
              <p className={`mt-1 text-right text-[11px] ${m.from === "you" ? "text-emerald-100" : "text-stone-500"}`}>{time(m.at)}</p>
            </div>
          </div>
        ))}
        {waiting.map((p) => (
          <div key={p.id} className="flex justify-end">
            <div className="max-w-[85%] rounded-2xl rounded-br-sm bg-emerald-700/70 px-3 py-2 text-sm text-white"><p className="whitespace-pre-wrap break-words">{p.body}</p><p className="mt-1 text-right text-[11px] text-emerald-100">Sending…</p></div>
          </div>
        ))}
        <div ref={endRef} />
      </div>
      {(error || sendError) && <p role="alert" className="border-t border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900"><span aria-hidden="true">⚠ </span>{sendError ?? error}</p>}
      {optedOut && <p className="border-t border-stone-200 bg-stone-50 px-3 py-2 text-xs text-stone-700">You asked us to stop messaging you. Send START to chat with us again.</p>}
      <form className="flex items-end gap-2 border-t border-stone-200 p-3" onSubmit={(e) => { e.preventDefault(); send(); }}>
        <label htmlFor={inputId} className="sr-only">Type your message</label>
        <textarea id={inputId} value={text} onChange={(e) => setText(e.target.value)} rows={1} maxLength={1000} placeholder="Type a message…"
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
          className="max-h-32 min-h-[2.75rem] flex-1 resize-none rounded-lg border border-stone-300 px-3 py-2.5 text-base focus:outline-none focus:ring-2 focus:ring-emerald-700" />
        <button type="submit" disabled={sending || !text.trim()} className="h-11 shrink-0 rounded-lg bg-emerald-800 px-4 text-sm font-medium text-white hover:bg-emerald-900 focus:outline-none focus:ring-2 focus:ring-emerald-700 disabled:opacity-60">
          Send
        </button>
      </form>
    </>
  );
}
