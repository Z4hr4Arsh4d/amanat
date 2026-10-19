"use client";
// P1 owns. F2.4 board: drag a card to another column (mouse/touchpad), or use the "Move to" dropdown on each
// card (keyboard and phones). The card moves right away and snaps back if the server refuses (e.g. 422 "Fill X first").
import Link from "next/link";
import { useEffect, useState } from "react";
import { useAction } from "@/components/ui/useAction";
import { Icon } from "@/components/ui/Icon";
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
    <div className="space-y-3">
      <p className="flex items-center gap-1.5 text-xs text-stone-600">
        <Icon name="info" className="h-3.5 w-3.5" />
        {canEdit ? "Drag a card to another column, or use its “Move to” menu." : "You can view the board but not move cards."}
      </p>
      <div className="relative -mx-4 overflow-x-auto px-4 pb-3 sm:mx-0 sm:px-0">
        <div className="flex min-w-max gap-4">
          {stages.map((s) => {
            const col = local.filter((o) => o.stageId === s.id);
            const isOver = over === s.id && dragId !== null;
            const accent = s.kind === "WON" ? "bg-emerald-500" : s.kind === "LOST" ? "bg-red-400" : "bg-stone-300";
            return (
              <section
                key={s.id}
                aria-labelledby={`col-${s.id}`}
                onDragOver={(e) => { if (!canEdit || !dragId) return; e.preventDefault(); e.dataTransfer.dropEffect = "move"; if (over !== s.id) setOver(s.id); }}
                onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOver((o) => (o === s.id ? null : o)); }}
                onDrop={(e) => { e.preventDefault(); drop(s.id); }}
                className={`flex w-[17.5rem] shrink-0 flex-col rounded-xl border transition-colors ${isOver ? "border-emerald-400 bg-emerald-50 ring-2 ring-emerald-200" : "border-stone-200 bg-stone-100/70"}`}
              >
                <span aria-hidden="true" className={`mx-3 mt-0 h-1 rounded-b-full ${accent}`} />
                <h2 id={`col-${s.id}`} className="flex items-center justify-between gap-2 px-3 pb-2 pt-3 text-sm font-bold text-stone-900">
                  <span className="flex min-w-0 items-center gap-1.5">
                    {s.kind === "WON" && <Icon name="trophy" className="h-4 w-4 text-emerald-700" />}
                    {s.kind === "LOST" && <Icon name="xCircle" className="h-4 w-4 text-red-600" />}
                    <span className="truncate">{s.name}</span>
                    {s.kind !== "OPEN" && <span className="sr-only">({s.kind === "WON" ? "won" : "lost"} stage)</span>}
                  </span>
                  <span className="rounded-full bg-white px-2 py-0.5 text-xs font-bold tabular-nums text-stone-600 ring-1 ring-stone-200">{col.length}</span>
                </h2>
                <ul className="min-h-24 flex-1 space-y-2 px-2 pb-2">
                  {col.map((o) => (
                    <li
                      key={o.id}
                      draggable={canEdit}
                      onDragStart={(e) => { setDragId(o.id); e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", o.id); }}
                      onDragEnd={() => { setDragId(null); setOver(null); }}
                      className={`space-y-2.5 rounded-lg border border-stone-200 bg-white p-3 text-sm shadow-xs transition-shadow hover:shadow-md ${canEdit ? "cursor-grab active:cursor-grabbing" : ""} ${dragId === o.id ? "opacity-50" : ""}`}
                    >
                      <div>
                        <Link href={`/opportunities/${o.id}`} className="block break-words font-bold text-stone-900 hover:text-emerald-800 hover:underline" draggable={false}>{o.title}</Link>
                        <p className="mt-0.5 break-words text-xs text-stone-600">{o.contactName}</p>
                      </div>
                      <p className="font-bold tabular-nums text-stone-900">{o.money}</p>
                      {canEdit && <MoveStage opportunityId={o.id} version={o.version} stageId={o.stageId} stages={stages} compact />}
                    </li>
                  ))}
                  {col.length === 0 && <li className="grid h-20 place-items-center rounded-lg border border-dashed border-stone-300 text-xs font-medium text-stone-500">{isOver ? "Drop here" : "No deals"}</li>}
                </ul>
              </section>
            );
          })}
        </div>
      </div>
    </div>
  );
}
