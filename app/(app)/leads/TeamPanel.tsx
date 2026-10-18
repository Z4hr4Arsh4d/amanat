"use client";
// P2 owns. Team panel for admins: see everyone's status and open leads, change anyone's status (F3.2).
import useSWR from "swr";
import { useAction } from "@/components/ui/useAction";
import { ui } from "@/components/ui/styles";
import { listTeam, setUserStatus } from "./team-actions";
import { STATUS_OPTIONS } from "./StatusSelector";

export function TeamPanel() {
  const { data, error, mutate } = useSWR("team", async () => {
    const r = await listTeam();
    if (!r.ok) throw new Error(r.error);
    return r.data;
  }, { refreshInterval: 3000 });
  const { pending, run } = useAction();

  return (
    <section className={ui.card} aria-label="Team">
      <h2 className="font-semibold text-stone-900">Team</h2>
      {error && <p role="alert" className="mt-1 text-sm text-red-800">Could not load the team. {error.message}</p>}
      {!data && !error && <p className={ui.muted}>Loading team…</p>}
      <ul className="mt-2 divide-y divide-stone-200">
        {data?.map((m) => (
          <li key={m.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
            <span className="text-sm text-stone-900">{m.name}{m.isYou ? " (you)" : ""} <span className="text-stone-600">· {m.openLeads} open</span></span>
            <span>
              <label htmlFor={`st-${m.id}`} className="sr-only">Status for {m.name}</label>
              <select id={`st-${m.id}`} className={`${ui.input} w-auto`} value={m.status} disabled={pending}
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
