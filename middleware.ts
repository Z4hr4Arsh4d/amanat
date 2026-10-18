// P1 owns. Q3 CSRF: state-changing API calls must come from our own origin.
// Webhooks are exempt (they are verified by provider signatures instead).
// Also bounces logged-out visitors to /login (the real check is still on the server).
import { NextResponse, type NextRequest } from "next/server";

const PUBLIC = ["/login", "/signup", "/invite/", "/f/", "/api/webhooks/", "/api/oauth/", "/_next", "/favicon"];

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (pathname.startsWith("/api/") && !pathname.startsWith("/api/webhooks/") && req.method !== "GET") {
    const origin = req.headers.get("origin");
    const allowed = process.env.APP_URL ?? req.nextUrl.origin;
    if (origin && new URL(origin).origin !== new URL(allowed).origin) {
      return NextResponse.json({ error: "Cross-site request blocked." }, { status: 403 });
    }
  }

  const isPublic = pathname === "/" || PUBLIC.some((p) => pathname.startsWith(p));
  if (!isPublic && !pathname.startsWith("/api/") && !req.cookies.get("amanat_session")) {
    return NextResponse.redirect(new URL("/login", req.url));
  }
  return NextResponse.next();
}

export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"] };
