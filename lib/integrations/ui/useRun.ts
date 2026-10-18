"use client";
// P3 owns. Runs a server action with a loading state and a success / failure toast (Q10).
import { useState } from "react";
import { toast } from "sonner";
import type { ActionResult } from "../action";

export function useRun() {
  const [pending, setPending] = useState<string | null>(null);
  async function run<T>(key: string, fn: () => Promise<ActionResult<T>>, opts?: { success?: string; onOk?: (r: ActionResult<T>) => void }) {
    setPending(key);
    try {
      const r = await fn();
      if (r.ok) {
        toast.success(r.message ?? opts?.success ?? "Done.");
        opts?.onOk?.(r);
      } else toast.error(r.error);
      return r;
    } catch {
      toast.error("Could not reach the server. Check your internet connection and try again.");
      return { ok: false, error: "network" } as ActionResult<T>;
    } finally {
      setPending(null);
    }
  }
  return { pending, run };
}
