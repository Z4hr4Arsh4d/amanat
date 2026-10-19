"use client";
// P3 owns. A read-only value with a Copy button (webhook URLs, payment links).
import { useId, useState } from "react";
import { toast } from "sonner";
import { Icon } from "@/components/ui/Icon";
import { ui } from "@/components/ui/styles";

export function CopyField({ label, value, hint }: { label: string; value: string; hint?: string }) {
  const id = useId();
  const [copied, setCopied] = useState(false);
  return (
    <div className={ui.field}>
      <label htmlFor={id} className={ui.labelSm}>{label}</label>
      <div className="flex min-w-0 gap-2">
        <input id={id} readOnly value={value} onFocus={(e) => e.currentTarget.select()}
          className={`${ui.input} flex-1 !bg-stone-50 font-mono !text-xs`} />
        <button type="button"
          onClick={() => navigator.clipboard.writeText(value).then(() => { toast.success("Copied."); setCopied(true); setTimeout(() => setCopied(false), 1500); }, () => toast.error("Could not copy. Select the text and copy it by hand."))}
          className={ui.btn}>
          <Icon name={copied ? "check" : "copy"} className="h-4 w-4" />{copied ? "Copied" : "Copy"}
        </button>
      </div>
      {hint && <p className={ui.hint}>{hint}</p>}
    </div>
  );
}
