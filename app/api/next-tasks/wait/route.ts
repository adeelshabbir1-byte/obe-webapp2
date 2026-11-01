import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../lib/session";
import { setFlag } from "../../../../lib/scopedSettings";
import { forgetMenuState } from "../../../../lib/menuStatus";
import { taskKey } from "../../../../lib/menuStatusCore";
import { notifyUsers } from "../../../../lib/notifications";
import { withErrors } from "../../../../lib/apiHandler";

export const dynamic = "force-dynamic";

// POST { title, href, reason, onUserId?, days? } — "waiting on someone else" (Adeel prompt §1): the task turns grey for
// this person until the recheck date (default 3 days), and is red for the person it waits on. { clear: true } undoes it.
async function POST_handler(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user || !user.mfaVerified) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const b = (await req.json().catch(() => ({}))) as { title?: string; href?: string; reason?: string; onUserId?: string; days?: number; clear?: boolean };
  if (!b.title || !b.href) return NextResponse.json({ error: "Which task?" }, { status: 400 });
  const key = `wait:${taskKey({ title: b.title, href: b.href })}`;
  if (b.clear) { await setFlag(user.id, key, null); forgetMenuState(user.id); return NextResponse.json({ ok: true }); }
  const reason = String(b.reason || "").trim().slice(0, 200);
  if (!reason) return NextResponse.json({ error: "Say what you are waiting for." }, { status: 400 });
  const days = Math.min(30, Math.max(1, Number(b.days) || 3));
  const until = new Date(Date.now() + days * 864e5).toISOString();
  await setFlag(user.id, key, JSON.stringify({ reason, onUserId: b.onUserId || null, until, title: b.title }));
  forgetMenuState(user.id);
  if (b.onUserId) { forgetMenuState(b.onUserId); await notifyUsers([b.onUserId], { kind: "WAITING", title: `${user.name} is waiting on you`, body: `${b.title} — ${reason}`, href: b.href, exceptId: user.id }).catch(() => null); }
  return NextResponse.json({ ok: true, until });
}
export const POST = withErrors(POST_handler);
