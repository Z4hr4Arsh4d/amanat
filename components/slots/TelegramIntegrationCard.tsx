"use client";
// P2 owns this slot. P3 places <TelegramIntegrationCard canManage/> on /integrations.
// <TelegramConnectButton/> can also go on the profile page (I4.3).
import { useState } from "react";
import useSWR from "swr";
import { useAction } from "@/components/ui/useAction";
import { ui } from "@/components/ui/styles";
import { connectTelegram, disconnectTelegram, getTelegramStatus, sendTelegramTest, startTelegramLink, type TelegramStatus } from "@/app/(app)/leads/telegram-actions";

async function fetchStatus(): Promise<TelegramStatus> {
  const r = await getTelegramStatus();
  if (!r.ok) throw new Error(r.error);
  return r.data;
}

const CHIP = {
  NOT_CONNECTED: "○ Not connected", CONNECTED: "✓ Connected", ERROR: "⚠ Error",
} as const;

/** "Connect Telegram" + "Send test alert" for the logged-in person. */
export function TelegramConnectButton() {
  const { data, mutate } = useSWR("telegram-status", fetchStatus, { refreshInterval: 3000 });
  const { pending, run } = useAction();
  if (!data?.connected) return <p className={ui.muted}>Telegram alerts are not set up yet. Ask an admin to connect Telegram.</p>;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button" className={ui.btn} disabled={pending}
        onClick={() => run(() => startTelegramLink(), { success: "Opening Telegram. Press Start in the bot.", onSuccess: (d) => { window.open(d.url, "_blank", "noopener"); mutate(); } })}
      >
        {data.iAmLinked ? "Reconnect Telegram" : "Connect Telegram"}
      </button>
      {data.iAmLinked && (
        <button type="button" className={ui.btn} disabled={pending} onClick={() => run(() => sendTelegramTest(), { success: (d) => d.message })}>
          Send test alert
        </button>
      )}
      <span className={ui.muted}>{data.iAmLinked ? "✓ Your Telegram is linked." : "Not linked yet."}</span>
    </div>
  );
}

export function TelegramIntegrationCard({ canManage }: { canManage: boolean }) {
  const { data, error, mutate } = useSWR("telegram-status", fetchStatus, { refreshInterval: 3000 });
  const { pending, run } = useAction();
  const [token, setToken] = useState("");

  return (
    <section className={`${ui.card} space-y-3`} aria-label="Telegram">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold text-stone-900">Telegram</h2>
        {data && <span className="rounded-full border border-stone-300 px-2 py-0.5 text-xs text-stone-800">{CHIP[data.status]}</span>}
      </div>
      <div className="rounded-md bg-stone-50 p-3 text-sm text-stone-700">
        <p className="font-medium text-stone-800">What this can and can&apos;t do</p>
        <p>Each employee must press Start on the bot once to receive alerts.</p>
      </div>
      {error && <p role="alert" className="text-sm text-red-800">Could not load Telegram. {error.message}</p>}
      {data?.lastError && <p role="alert" className="text-sm text-red-800">⚠ Last error: {data.lastError}</p>}

      {data?.connected && (
        <p className="text-sm text-stone-800">
          Bot: <span className="font-medium">@{data.botUsername}</span> · Token: <span className="font-mono">{data.maskedToken}</span>
          {data.lastSuccessAt && <> · Last worked {new Date(data.lastSuccessAt).toLocaleTimeString()}</>}
        </p>
      )}

      {canManage && (
        <form
          className="space-y-2"
          onSubmit={(e) => {
            e.preventDefault();
            run(() => connectTelegram({ botToken: token }), { success: "Telegram connected.", onSuccess: () => { setToken(""); mutate(); } });
          }}
        >
          <label htmlFor="tg-token" className={ui.label}>{data?.connected ? "Replace bot token" : "Bot token from @BotFather"}</label>
          <input id="tg-token" type="password" autoComplete="off" value={token} onChange={(e) => setToken(e.target.value)} className={ui.input} placeholder="123456:ABC…" />
          <div className="flex flex-wrap gap-2">
            <button type="submit" disabled={pending || token.trim() === ""} className={ui.btnPrimary}>{pending ? "Working…" : data?.connected ? "Update" : "Connect"}</button>
            {data?.connected && (
              <button type="button" disabled={pending} className={ui.btnDanger} onClick={() => run(() => disconnectTelegram(), { success: "Telegram disconnected.", onSuccess: () => mutate() })}>
                Disconnect
              </button>
            )}
          </div>
        </form>
      )}

      <div>
        <h3 className="text-sm font-medium text-stone-800">Your Telegram</h3>
        <TelegramConnectButton />
      </div>

      {data && data.failedAlerts.length > 0 && (
        <div>
          <h3 className="text-sm font-medium text-stone-800">Failed alerts</h3>
          <ul className="mt-1 space-y-1">
            {data.failedAlerts.map((f) => (
              <li key={f.id} className="text-sm text-red-800">✗ {f.title} · {new Date(f.at).toLocaleString()} · {f.error}</li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
