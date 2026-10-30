import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../../lib/session";
import { withErrors } from "../../../../../lib/apiHandler";
import { asProvider, authUrl, linkProviders } from "../../../../../lib/calendarLink";

/** GET — starts the read-only Google / Outlook sign-in (free/busy only). */
async function GET_handler(req: Request, { params }: { params: { provider: string } }) {
  const user = await getAuthenticatedUser();
  if (!user || !user.mfaVerified) return NextResponse.redirect(new URL("/login", req.url));
  const p = asProvider(params.provider);
  if (!p || !linkProviders().includes(p)) return NextResponse.redirect(new URL("/my-calendar?link=off", req.url));
  const redirect = new URL(`/api/calendar/oauth/${params.provider}/callback`, process.env.NEXT_PUBLIC_APP_URL || req.url).toString();
  return NextResponse.redirect(authUrl(p, user.id, redirect));
}
export const GET = withErrors(GET_handler);
