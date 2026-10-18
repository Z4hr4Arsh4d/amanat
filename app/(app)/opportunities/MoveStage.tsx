"use client";
// P1 owns. F2.4 "Move to ▼" — works with keyboard and on mobile. Shows the 422 "fill X first" message.
import { useAction } from "@/components/ui/useAction";
import { ui } from "@/components/ui/styles";
import { moveOpportunity } from "./actions";

export function MoveStage({ opportunityId, version, stageId, stages, label = "Move to" }: {
  opportunityId: string; version: number; stageId: string; stages: { id: string; name: string }[]; label?: string;
}) {
  const { pending, run } = useAction();
  const id = `mv-${opportunityId}`;
  return (
    <div className="space-y-1">
      <label htmlFor={id} className="block text-xs font-medium text-stone-700">{label}</label>
      <select
        id={id}
        value={stageId}
        disabled={pending}
        onChange={(e) => {
          const to = stages.find((s) => s.id === e.target.value);
          run(() => moveOpportunity({ opportunityId, version, stageId: e.target.value }), { success: `Moved to ${to?.name ?? "new stage"}.` });
        }}
        className={ui.input}
      >
        {stages.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
      </select>
    </div>
  );
}
