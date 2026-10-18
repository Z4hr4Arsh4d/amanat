// P3 owns. Server actions return { ok, message } / { ok:false, error } instead of throwing,
// so the browser always gets a plain sentence to show in a toast (Q10).
import { z } from "zod";
import { HttpError } from "@/lib/core/errors";

export type ActionResult<T = undefined> = { ok: true; message?: string; data?: T } | { ok: false; error: string };

export async function safe<T>(fn: () => Promise<ActionResult<T>>): Promise<ActionResult<T>> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof HttpError) return { ok: false, error: e.message };
    if (e instanceof z.ZodError) return { ok: false, error: e.issues[0]?.message ?? "Some details are not valid." };
    console.error("[action]", e);
    return { ok: false, error: "Something went wrong on our side. Please try again." };
  }
}
