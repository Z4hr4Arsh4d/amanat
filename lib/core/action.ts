// P1 owns. Server actions return a result object instead of throwing, because
// Next.js hides thrown error messages in production. Use with useAction() on the client.
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { HttpError } from "./errors";

export type ActionResult<T = null> =
  | { ok: true; data: T }
  | { ok: false; error: string; status: number; data?: unknown };

function isNextControlFlow(e: unknown) {
  const d = (e as { digest?: unknown } | null)?.digest;
  return typeof d === "string" && (d.startsWith("NEXT_REDIRECT") || d.startsWith("NEXT_HTTP_ERROR_FALLBACK") || d === "NEXT_NOT_FOUND");
}

export async function act<T>(fn: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    return { ok: true, data: await fn() };
  } catch (e) {
    if (isNextControlFlow(e)) throw e; // let redirect()/notFound() work
    if (e instanceof HttpError) return { ok: false, error: e.message, status: e.status, data: e.data };
    if (e instanceof z.ZodError) {
      return { ok: false, error: e.issues[0]?.message ?? "Some details are not valid. Check the form and try again.", status: 422 };
    }
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return { ok: false, error: "That already exists. Use a different name or email.", status: 409 };
    }
    console.error(e);
    return { ok: false, error: "Something went wrong on our side. Please try again.", status: 500 };
  }
}
