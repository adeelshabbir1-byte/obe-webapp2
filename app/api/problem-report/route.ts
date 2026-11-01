import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../lib/session";
import { fileReport } from "../../../lib/problemReports";
import { hitLimit, tooMany } from "../../../lib/rateLimit";
import { withErrors } from "../../../lib/apiHandler";

export const maxDuration = 30;

// POST { note, kind: BUG | CONFUSING | MISSING, url, browser, screenshot (data URL) } — "Report a problem" from any page.
async function POST_handler(req: Request) {
  const user = await getAuthenticatedUser();
  if (!user || !user.mfaVerified) return NextResponse.json({ error: "Sign in first." }, { status: 403 });
  const limit = await hitLimit(`problem:${user.id}`, 30, 3600_000);
  if (!limit.ok) return tooMany(limit.retryAfter);
  const b = await req.json().catch(() => ({}));
  try { return NextResponse.json({ ok: true, ...(await fileReport(user, { note: String(b.note || ""), kind: String(b.kind || "BUG"), url: String(b.url || "/"), browser: String(b.browser || req.headers.get("user-agent") || ""), screenshot: typeof b.screenshot === "string" ? b.screenshot : null })) }); }
  catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 400 }); }
}
export const POST = withErrors(POST_handler);
