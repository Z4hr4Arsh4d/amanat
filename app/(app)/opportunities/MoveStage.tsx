"use client";
// P1 owns. F2.4 "Move to ▼" — works with keyboard and on mobile. Shows the 422 "fill X first" message.
import { useAction } from "@/components/ui/useAction";
import { ui } from "@/components/ui/styles";
import { moveOpportunity } from "./actions";

export function MoveStage({ opportunityId, version, stageId, stages, label = "Move to", compact = false }: {
  opportunityId: string; version: number; stageId: string; stages: { id: string; name: string }[]; label?: string; compact?: boolean;
}) {
  const { pending, run } = useAction();
  const id = `mv-${opportunityId}`;
  return (
    <div className={compact ? "flex items-center gap-2 border-t border-stone-100 pt-2.5" : ui.field}>
      <label htmlFor={id} className={compact ? "shrink-0 text-xs font-semibold text-stone-500" : ui.label}>{label}</label>
      <select
        id={id}
        value={stageId}
        disabled={pending}
        onChange={(e) => {
          const to = stages.find((s) => s.id === e.target.value);
          run(() => moveOpportunity({ opportunityId, version, stageId: e.target.value }), { success: `Moved to ${to?.name ?? "new stage"}.` });
        }}
        className={compact ? `${ui.inputSm} !w-full` : ui.input}
      >
        {stages.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
      </select>
    </div>
  );
}
