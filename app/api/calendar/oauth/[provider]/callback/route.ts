import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../../../lib/session";
import { withErrors } from "../../../../../../lib/apiHandler";
import { asProvider, finishLink, linkProviders, readState } from "../../../../../../lib/calendarLink";

/** GET — the Google / Outlook sign-in comes back here; only the refresh token is kept, encrypted. */
async function GET_handler(req: Request, { params }: { params: { provider: string } }) {
  const url = new URL(req.url);
  const back = (q: string) => NextResponse.redirect(new URL(`/my-calendar?link=${q}`, req.url));
  const user = await getAuthenticatedUser();
  if (!user || !user.mfaVerified) return NextResponse.redirect(new URL("/login", req.url));
  const p = asProvider(params.provider);
  if (!p || !linkProviders().includes(p)) return back("off");
  if (readState(url.searchParams.get("state") || "") !== user.id) return back("expired");
  const code = url.searchParams.get("code");
  if (!code) return back("cancelled");
  const redirect = new URL(`/api/calendar/oauth/${params.provider}/callback`, process.env.NEXT_PUBLIC_APP_URL || req.url).toString();
  try { await finishLink(p, user.id, code, redirect); } catch (e) { console.warn("calendar link:", (e as Error).message); return back("failed"); }
  return back("ok");
}
export const GET = withErrors(GET_handler);
