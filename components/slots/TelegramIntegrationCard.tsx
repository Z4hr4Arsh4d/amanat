"use client";
// P2 owns this slot. P3 places <TelegramIntegrationCard canManage/> on /integrations.
// <TelegramConnectButton/> can also go on the profile page (I4.3).
import { useState } from "react";
import useSWR from "swr";
import { useAction } from "@/components/ui/useAction";
import { ui } from "@/components/ui/styles";
import { Icon } from "@/components/ui/Icon";
import { Notice } from "@/components/ui/Kit";
import { Spinner } from "@/components/ui/Spinner";
import { connectTelegram, disconnectTelegram, getTelegramStatus, sendTelegramTest, startTelegramLink, type TelegramStatus } from "@/app/(app)/leads/telegram-actions";

async function fetchStatus(): Promise<TelegramStatus> {
  const r = await getTelegramStatus();
  if (!r.ok) throw new Error(r.error);
  return r.data;
}

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
        <Icon name="send" className="h-4 w-4" />{data.iAmLinked ? "Reconnect Telegram" : "Connect Telegram"}
      </button>
      {data.iAmLinked && (
        <button type="button" className={ui.btn} disabled={pending} onClick={() => run(() => sendTelegramTest(), { success: (d) => d.message })}>
          Send test alert
        </button>
      )}
      <span className={`inline-flex items-center gap-1.5 text-sm ${data.iAmLinked ? "font-semibold text-emerald-800" : "text-stone-600"}`}>
        <Icon name={data.iAmLinked ? "checkCircle" : "circle"} className="h-4 w-4" />{data.iAmLinked ? "Your Telegram is linked." : "Not linked yet."}
      </span>
    </div>
  );
}

export function TelegramIntegrationCard({ canManage }: { canManage: boolean }) {
  const { data, error, mutate } = useSWR("telegram-status", fetchStatus, { refreshInterval: 3000 });
  const { pending, run } = useAction();
  const [token, setToken] = useState("");

  return (
    <section className="space-y-4" aria-label="Telegram settings">
      {error && <Notice tone="bad">Could not load Telegram. {error.message}</Notice>}
      {data?.lastError && <Notice tone="bad" title="Last error">{data.lastError}</Notice>}

      {data?.connected && (
        <dl className="grid grid-cols-1 gap-1.5 rounded-lg border border-stone-200 p-3 text-sm sm:grid-cols-2">
          <div><dt className="inline text-stone-500">Bot: </dt><dd className="inline font-semibold">@{data.botUsername}</dd></div>
          <div><dt className="inline text-stone-500">Token: </dt><dd className="inline font-mono">{data.maskedToken}</dd></div>
        </dl>
      )}

      {canManage && (
        <form
          className={ui.field}
          onSubmit={(e) => {
            e.preventDefault();
            run(() => connectTelegram({ botToken: token }), { success: "Telegram connected.", onSuccess: () => { setToken(""); mutate(); } });
          }}
        >
          <label htmlFor="tg-token" className={ui.label}>{data?.connected ? "Replace bot token" : "Bot token from @BotFather"}</label>
          <input id="tg-token" type="password" autoComplete="off" value={token} onChange={(e) => setToken(e.target.value)} className={ui.input} placeholder="123456:ABC…" />
          <div className="flex flex-wrap gap-2 pt-1">
            <button type="submit" disabled={pending || token.trim() === ""} className={ui.btnPrimary}>{pending && <Spinner />}{pending ? "Working…" : data?.connected ? "Update" : "Connect"}</button>
            {data?.connected && (
              <button type="button" disabled={pending} className={ui.btnDanger} onClick={() => run(() => disconnectTelegram(), { success: "Telegram disconnected.", onSuccess: () => mutate() })}>
                Disconnect
              </button>
            )}
          </div>
        </form>
      )}

      <div className="space-y-2">
        <h3 className={ui.h3}>Your Telegram</h3>
        <TelegramConnectButton />
      </div>

      {data && data.failedAlerts.length > 0 && (
        <div className="space-y-2">
          <h3 className={ui.h3}>Failed alerts</h3>
          <ul className="space-y-1.5">
            {data.failedAlerts.map((f) => (
              <li key={f.id} className="flex items-start gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-900">
                <Icon name="xCircle" className="mt-0.5 h-4 w-4 text-red-600" />
                <span className="min-w-0 break-words"><strong>{f.title}</strong> · {new Date(f.at).toLocaleString()} · {f.error}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
