// P3 owns. Google OAuth callback (I3.1, I3.2): verify state (signature, expiry, browser nonce, same user),
// exchange the code, store the refresh token encrypted. Tokens never reach the browser.
import { NextResponse, type NextRequest } from "next/server";
import { requireUser, type Ctx } from "@/lib/shared/contracts";

const currentUser = (): Promise<Ctx | null> => requireUser().catch(() => null);
import { appUrl } from "@/lib/integrations/store";
import { exchangeCode, readState } from "@/lib/integrations/google";
import { saveGoogleConnection } from "@/lib/integrations/appointments";
import { logEvent } from "@/lib/integrations/log";

export const dynamic = "force-dynamic";

const back = (q: string) => {
  const res = NextResponse.redirect(`${appUrl()}/settings/calendar?${q}`);
  res.cookies.set("g_oauth_nonce", "", { path: "/api/oauth/google", maxAge: 0 });
  return res;
};

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  const ctx = await currentUser();
  if (!ctx) return NextResponse.redirect(`${appUrl()}/login`);
  const st = readState(q.get("state"), req.cookies.get("g_oauth_nonce")?.value);
  if (!st || st.userId !== ctx.userId) return back(`error=${encodeURIComponent("The sign-in link was not valid or has expired. Press Connect again.")}`);
  if (q.get("error")) return back(`error=${encodeURIComponent(q.get("error") === "access_denied" ? "You did not allow calendar access. Press Connect again and allow it." : `Google said: ${q.get("error")}`)}`);
  const code = q.get("code");
  if (!code) return back(`error=${encodeURIComponent("Google did not return a code. Press Connect again.")}`);
  try {
    const t = await exchangeCode(code);
    await saveGoogleConnection(ctx.userId, t.email, t.refresh_token, t.access_token, t.expires_in);
    await logEvent({ workspaceId: ctx.workspaceId, provider: "GOOGLE", direction: "IN", type: "oauth.callback", status: "PROCESSED", payload: { userId: ctx.userId, googleEmail: t.email } });
    return back("connected=1");
  } catch (e) {
    await logEvent({ workspaceId: ctx.workspaceId, provider: "GOOGLE", direction: "IN", type: "oauth.callback", status: "FAILED", error: (e as Error).message, payload: { userId: ctx.userId } });
    return back(`error=${encodeURIComponent(`Could not connect: ${(e as Error).message}`)}`);
  }
}
