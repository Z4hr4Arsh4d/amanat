// Throw these from server code; route handlers convert them with toResponse().
export class HttpError extends Error {
  constructor(public status: number, message: string, public data?: unknown) {
    super(message);
  }
}
export const Unauthorized = () => new HttpError(401, "Please log in.");
export const Forbidden = (what = "do this") => new HttpError(403, `You don't have permission to ${what}.`);
export const NotFound = () => new HttpError(404, "Not found."); // also used for other workspaces' ids (F1.6)
export const Conflict = (msg = "Someone else changed this record. Reload to see their change.") => new HttpError(409, msg);

export function toResponse(e: unknown): Response {
  if (e instanceof HttpError) return Response.json({ error: e.message, data: e.data }, { status: e.status });
  console.error(e);
  return Response.json({ error: "Something went wrong on our side. Please try again." }, { status: 500 });
}

/** Wrap an API route handler: errors become JSON responses with the right status. */
export function handler<A extends unknown[]>(fn: (...args: A) => Promise<Response>) {
  return async (...args: A) => {
    try { return await fn(...args); } catch (e) { return toResponse(e); }
  };
}
