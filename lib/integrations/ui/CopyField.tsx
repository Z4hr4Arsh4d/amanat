"use client";
// P3 owns. A read-only value with a Copy button (webhook URLs, payment links).
import { useId } from "react";
import { toast } from "sonner";

export function CopyField({ label, value, hint }: { label: string; value: string; hint?: string }) {
  const id = useId();
  return (
    <div className="space-y-1">
      <label htmlFor={id} className="block text-xs font-medium text-stone-700">{label}</label>
      <div className="flex min-w-0 gap-2">
        <input id={id} readOnly value={value} onFocus={(e) => e.currentTarget.select()}
          className="min-w-0 flex-1 rounded border border-stone-300 bg-stone-50 px-2 py-1.5 font-mono text-xs focus:outline-none focus:ring-2 focus:ring-emerald-700" />
        <button type="button"
          onClick={() => navigator.clipboard.writeText(value).then(() => toast.success("Copied."), () => toast.error("Could not copy. Select the text and copy it by hand."))}
          className="shrink-0 rounded border border-stone-300 px-3 py-1.5 text-xs font-medium hover:bg-stone-100 focus:outline-none focus:ring-2 focus:ring-emerald-700">
          Copy
        </button>
      </div>
      {hint && <p className="text-xs text-stone-600">{hint}</p>}
    </div>
  );
}
