import { NextResponse } from "next/server";
import { withErrors } from "../../../lib/apiHandler";
import { hitLimit, tooMany } from "../../../lib/rateLimit";
import { guest, vote } from "../../../lib/committeeEngine";
import type { VoteKind } from "../../../lib/committeeCore";

/** POST { token, itemId, vote, comment } — an external member votes through their guest link (their committee only). */
async function POST_handler(req: Request) {
  const b = await req.json().catch(() => ({}));
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  { const rl = await hitLimit(`guest-vote:${ip}`, 60, 600_000).catch(() => ({ ok: true, retryAfter: 0 })); if (!rl.ok) return tooMany(rl.retryAfter); }
  const g = await guest(String(b.token || ""));
  if (!g) return NextResponse.json({ error: "This link is not valid any more. Ask the committee's Convener for a new one." }, { status: 403 });
  try {
    await vote(g.member.id, String(b.itemId || ""), b.vote as VoteKind, String(b.comment || ""));
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
export const POST = withErrors(POST_handler);
