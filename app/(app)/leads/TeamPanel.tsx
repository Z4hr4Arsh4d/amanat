"use client";
// P2 owns. Team panel for admins: see everyone's status and open leads, change anyone's status (F3.2).
import useSWR from "swr";
import { useAction } from "@/components/ui/useAction";
import { ui } from "@/components/ui/styles";
import { Avatar, Notice } from "@/components/ui/Kit";
import { listTeam, setUserStatus } from "./team-actions";
import { STATUS_DOT, STATUS_OPTIONS } from "./StatusSelector";

export function TeamPanel() {
  const { data, error, mutate } = useSWR("team", async () => {
    const r = await listTeam();
    if (!r.ok) throw new Error(r.error);
    return r.data;
  }, { refreshInterval: 3000 });
  const { pending, run } = useAction();

  return (
    <section className={ui.cardFlush} aria-labelledby="team-h">
      <div className="border-b border-stone-200 px-5 py-4">
        <h2 id="team-h" className={ui.h2}>Team</h2>
        <p className="mt-0.5 text-sm text-stone-600">Who can take new leads right now.</p>
      </div>
      {error && <div className="p-4"><Notice tone="bad">Could not load the team. {error.message}</Notice></div>}
      {!data && !error && <p className="px-5 py-4 text-sm text-stone-600">Loading team…</p>}
      <ul className="divide-y divide-stone-100">
        {data?.map((m) => (
          <li key={m.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
            <Avatar name={m.name} size="sm" />
            <span className="min-w-0 flex-1 text-sm">
              <span className="block truncate font-semibold text-stone-900">{m.name}{m.isYou && <span className="font-normal text-stone-500"> (you)</span>}</span>
              <span className="text-xs tabular-nums text-stone-600">{m.openLeads} open {m.openLeads === 1 ? "lead" : "leads"}</span>
            </span>
            <span className="relative">
              <span aria-hidden="true" className={`pointer-events-none absolute left-2.5 top-1/2 z-10 h-2 w-2 -translate-y-1/2 rounded-full ${STATUS_DOT[m.status] ?? "bg-stone-400"}`} />
              <label htmlFor={`st-${m.id}`} className="sr-only">Status for {m.name}</label>
              <select id={`st-${m.id}`} className={`${ui.inputSm} !pl-7`} value={m.status} disabled={pending}
                onChange={(e) => run(() => setUserStatus({ userId: m.id, status: e.target.value }), { success: `${m.name}'s status updated.`, onSuccess: () => mutate() })}>
                {STATUS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
