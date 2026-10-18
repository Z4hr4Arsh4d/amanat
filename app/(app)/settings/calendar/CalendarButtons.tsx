"use client";
// P3 owns.
import { useRouter } from "next/navigation";
import { useRun } from "@/lib/integrations/ui/useRun";
import { Spinner } from "@/lib/integrations/ui/Spinner";
import { connectDemoCalendarAction, disconnectCalendarAction } from "./actions";

const btn = "inline-flex items-center gap-2 rounded px-3 py-2 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-emerald-700 disabled:opacity-60";

export function CalendarButtons({ connected, needsReconnect, googleReady, demoAllowed }: { connected: boolean; needsReconnect: boolean; googleReady: boolean; demoAllowed: boolean }) {
  const { pending, run } = useRun();
  const router = useRouter();
  return (
    <div className="flex flex-wrap gap-2">
      {googleReady ? (
        <a href="/api/oauth/google/start" className={`${btn} bg-emerald-800 text-white hover:bg-emerald-900`}>
          {needsReconnect ? "Reconnect Google Calendar" : connected ? "Connect a different Google account" : "Connect Google Calendar"}
        </a>
      ) : (
        <p className="w-full text-sm text-stone-600">Google sign-in is not set up on this server yet (the admin adds GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET).</p>
      )}
      {demoAllowed && !connected && (
        <button type="button" disabled={!!pending} className={`${btn} border border-stone-300 bg-white hover:bg-stone-100`}
          onClick={() => run("demo", connectDemoCalendarAction, { onOk: () => router.refresh() })}>
          {pending === "demo" && <Spinner />}Use a demo calendar (no Google)
        </button>
      )}
      {connected && (
        <button type="button" disabled={!!pending} className={`${btn} border border-red-300 bg-white text-red-800 hover:bg-red-50`}
          onClick={() => { if (confirm("Disconnect your calendar? Customers can no longer be booked with you until you connect again.")) run("disc", disconnectCalendarAction, { onOk: () => router.refresh() }); }}>
          {pending === "disc" && <Spinner />}Disconnect
        </button>
      )}
    </div>
  );
}
