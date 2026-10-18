// P3 owns. Starts "Connect Google Calendar" (I3.1): signed state + a nonce cookie bound to this browser.
import { NextResponse } from "next/server";
import { requireUser, type Ctx } from "@/lib/shared/contracts";

const currentUser = (): Promise<Ctx | null> => requireUser().catch(() => null);
import { appUrl } from "@/lib/integrations/store";
import { authUrl, googleConfigured, makeState } from "@/lib/integrations/google";

export const dynamic = "force-dynamic";

export async function GET() {
  const ctx = await currentUser();
  if (!ctx) return NextResponse.redirect(`${appUrl()}/login`);
  if (!googleConfigured()) {
    return NextResponse.redirect(`${appUrl()}/settings/calendar?error=${encodeURIComponent("Google sign-in is not set up on this server (GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET). Use the demo calendar or ask the admin.")}`);
  }
  const { state, nonce } = makeState(ctx.userId);
  const res = NextResponse.redirect(authUrl(state));
  res.cookies.set("g_oauth_nonce", nonce, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/api/oauth/google", maxAge: 600 });
  return res;
}
