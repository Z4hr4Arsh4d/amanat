"use client";
// P1 owns. Shared hook: spinner state + success toast + error toast with the server's message (Q10).
import { useTransition } from "react";
import { toast } from "sonner";
import type { ActionResult } from "@/lib/core/action";

type Opts<T> = {
  success?: string | ((data: T) => string);
  onSuccess?: (data: T) => void;
  onError?: (r: Extract<ActionResult<T>, { ok: false }>) => void;
};

export function useAction() {
  const [pending, startTransition] = useTransition();

  function run<T>(fn: () => Promise<ActionResult<T>>, opts: Opts<T> = {}) {
    return new Promise<ActionResult<T>>((resolve) => {
      startTransition(async () => {
        let r: ActionResult<T>;
        try {
          r = await fn();
        } catch {
          r = { ok: false, error: "Could not reach the server. Check your connection and try again.", status: 0 };
        }
        if (r.ok) {
          const msg = typeof opts.success === "function" ? opts.success(r.data) : opts.success;
          if (msg) toast.success(msg);
          opts.onSuccess?.(r.data);
        } else {
          toast.error(r.error);
          opts.onError?.(r);
        }
        resolve(r);
      });
    });
  }

  return { pending, run };
}
