"use client";
// P1 owns. F2.4 board: drag a card to another column (mouse/touchpad), or use the "Move to" dropdown on each
// card (keyboard and phones). The card moves right away and snaps back if the server refuses (e.g. 422 "Fill X first").
import Link from "next/link";
import { useEffect, useState } from "react";
import { useAction } from "@/components/ui/useAction";
import { MoveStage } from "./MoveStage";
import { moveOpportunity } from "./actions";

type Stage = { id: string; name: string; kind: "OPEN" | "WON" | "LOST" };
export type BoardItem = { id: string; title: string; contactName: string; money: string; stageId: string; version: number };

export function Board({ stages, items, canEdit }: { stages: Stage[]; items: BoardItem[]; canEdit: boolean }) {
  const { run } = useAction();
  const [local, setLocal] = useState(items);
  const [dragId, setDragId] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);
  useEffect(() => setLocal(items), [items]); // take fresh server data (auto-refresh / after a move)

  function drop(stageId: string) {
    const card = local.find((c) => c.id === dragId);
    setDragId(null);
    setOver(null);
    if (!card || card.stageId === stageId) return;
    const before = local;
    const target = stages.find((s) => s.id === stageId);
    setLocal((l) => l.map((c) => (c.id === card.id ? { ...c, stageId } : c)));
    run(() => moveOpportunity({ opportunityId: card.id, version: card.version, stageId }), {
      success: `Moved “${card.title}” to ${target?.name ?? "new stage"}.`,
      onError: () => setLocal(before),
    });
  }

  return (
    <div className="overflow-x-auto pb-2">
      <p className="mb-2 text-xs text-stone-600">
        {canEdit ? "Drag a card to another column, or use its “Move to” menu." : "You can view the board but not move cards."}
      </p>
      <div className="flex min-w-max gap-3">
        {stages.map((s) => {
          const col = local.filter((o) => o.stageId === s.id);
          const isOver = over === s.id && dragId !== null;
          return (
            <section
              key={s.id}
              aria-labelledby={`col-${s.id}`}
              onDragOver={(e) => { if (!canEdit || !dragId) return; e.preventDefault(); e.dataTransfer.dropEffect = "move"; if (over !== s.id) setOver(s.id); }}
              onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOver((o) => (o === s.id ? null : o)); }}
              onDrop={(e) => { e.preventDefault(); drop(s.id); }}
              className={`w-72 shrink-0 rounded-xl border p-3 transition-colors ${isOver ? "border-emerald-600 bg-emerald-50" : "border-stone-200 bg-stone-100"}`}
            >
              <h2 id={`col-${s.id}`} className="mb-2 text-sm font-semibold">
                {s.kind === "WON" ? "🏆 " : s.kind === "LOST" ? "✗ " : ""}{s.name} <span className="font-normal text-stone-600">({col.length})</span>
              </h2>
              <ul className="min-h-16 space-y-2">
                {col.map((o) => (
                  <li
                    key={o.id}
                    draggable={canEdit}
                    onDragStart={(e) => { setDragId(o.id); e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", o.id); }}
                    onDragEnd={() => { setDragId(null); setOver(null); }}
                    className={`space-y-2 rounded-lg border border-stone-200 bg-white p-3 text-sm shadow-sm ${canEdit ? "cursor-grab active:cursor-grabbing" : ""} ${dragId === o.id ? "opacity-50" : ""}`}
                  >
                    <Link href={`/opportunities/${o.id}`} className="block break-words font-medium text-emerald-800 underline" draggable={false}>{o.title}</Link>
                    <p className="break-words text-stone-600">{o.contactName} · {o.money}</p>
                    {canEdit && <MoveStage opportunityId={o.id} version={o.version} stageId={o.stageId} stages={stages} />}
                  </li>
                ))}
                {col.length === 0 && <li className="rounded-lg border border-dashed border-stone-300 p-3 text-xs text-stone-500">{isOver ? "Drop here" : "Empty"}</li>}
              </ul>
            </section>
          );
        })}
      </div>
    </div>
  );
}
