"use client";
// P2 owns. "Reassign to" menu (F3.5). Used on /leads and /recovery. Only shown to people with leads.reassign.
import useSWR from "swr";
import { useAction } from "@/components/ui/useAction";
import { ui } from "@/components/ui/styles";
import { listAssignees, reassignLead } from "./actions";

export function ReassignMenu({ leadId, currentOwnerName, onDone }: { leadId: string; currentOwnerName?: string | null; onDone?: () => void }) {
  const { data } = useSWR("assignees", async () => {
    const r = await listAssignees();
    if (!r.ok) throw new Error(r.error);
    return r.data;
  });
  const { pending, run } = useAction();

  return (
    <span className="inline-flex items-center gap-2">
      <label htmlFor={`re-${leadId}`} className="text-sm font-medium text-stone-800">Reassign to</label>
      <select
        id={`re-${leadId}`} className={`${ui.input} w-auto`} disabled={pending || !data} value=""
        onChange={(e) => {
          const to = data?.find((u) => u.id === e.target.value);
          if (!to) return;
          run(() => reassignLead({ leadId, toUserId: to.id }), { success: `Lead reassigned to ${to.name}.`, onSuccess: () => onDone?.() });
        }}
      >
        <option value="">Choose…</option>
        {data?.filter((u) => u.name !== currentOwnerName).map((u) => <option key={u.id} value={u.id}>{u.name}{u.status === "AVAILABLE" ? "" : ` (${u.status.toLowerCase().replace("_", " ")})`}</option>)}
      </select>
    </span>
  );
}
