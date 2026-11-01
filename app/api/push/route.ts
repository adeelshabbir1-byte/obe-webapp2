import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../lib/session";
import { getAuthenticatedStudent } from "../../../lib/studentSession";
import { setFlag } from "../../../lib/scopedSettings";
import { pushReady, subscribe, PUSH_KINDS } from "../../../lib/webPush";
import { withErrors } from "../../../lib/apiHandler";

export const dynamic = "force-dynamic";

// GET — the VAPID public key (or null) and the kinds; POST { subscription } — save this browser / phone;
// PUT { kinds[] } — which kinds this person wants (staff).
async function GET_handler() {
  return NextResponse.json({ key: pushReady() ? process.env.VAPID_PUBLIC_KEY : null, kinds: PUSH_KINDS });
}
async function POST_handler(req: NextRequest) {
  const b = (await req.json().catch(() => ({}))) as { subscription?: { endpoint: string; keys: { p256dh: string; auth: string } } };
  if (!b.subscription?.endpoint || !b.subscription.keys) return NextResponse.json({ error: "No subscription." }, { status: 400 });
  const user = await getAuthenticatedUser().catch(() => null);
  const student = user ? null : await getAuthenticatedStudent().catch(() => null);
  if (!user && !student) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  await subscribe(user ? { userId: user.id } : { studentId: student!.id }, b.subscription);
  return NextResponse.json({ ok: true });
}
async function PUT_handler(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const kinds = (((await req.json().catch(() => ({}))) as { kinds?: string[] }).kinds || []).filter((k) => PUSH_KINDS.some(([x]) => x === k));
  await setFlag(user.id, "push:kinds", JSON.stringify(kinds));
  return NextResponse.json({ ok: true });
}
export const GET = withErrors(GET_handler);
export const POST = withErrors(POST_handler);
export const PUT = withErrors(PUT_handler);
