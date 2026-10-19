"use client";
// P3 owns.
import { useRouter } from "next/navigation";
import { useRun } from "@/lib/integrations/ui/useRun";
import { Spinner } from "@/lib/integrations/ui/Spinner";
import { Icon } from "@/components/ui/Icon";
import { ui } from "@/components/ui/styles";
import { connectDemoCalendarAction, disconnectCalendarAction } from "./actions";


export function CalendarButtons({ connected, needsReconnect, googleReady, demoAllowed }: { connected: boolean; needsReconnect: boolean; googleReady: boolean; demoAllowed: boolean }) {
  const { pending, run } = useRun();
  const router = useRouter();
  return (
    <div className="flex flex-wrap gap-2">
      {googleReady ? (
        <a href="/api/oauth/google/start" className={ui.btnPrimary}>
          <Icon name="calendar" className="h-4 w-4" />
          {needsReconnect ? "Reconnect Google Calendar" : connected ? "Connect a different Google account" : "Connect Google Calendar"}
        </a>
      ) : (
        <p className="w-full text-sm text-stone-500">Google sign-in is not set up on this server yet (the admin adds GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET).</p>
      )}
      {demoAllowed && !connected && (
        <button type="button" disabled={!!pending} className={ui.btn}
          onClick={() => run("demo", connectDemoCalendarAction, { onOk: () => router.refresh() })}>
          {pending === "demo" && <Spinner />}Use a demo calendar (no Google)
        </button>
      )}
      {connected && (
        <button type="button" disabled={!!pending} className={ui.btnDanger}
          onClick={() => { if (confirm("Disconnect your calendar? Customers can no longer be booked with you until you connect again.")) run("disc", disconnectCalendarAction, { onOk: () => router.refresh() }); }}>
          {pending === "disc" && <Spinner />}Disconnect
        </button>
      )}
    </div>
  );
}
