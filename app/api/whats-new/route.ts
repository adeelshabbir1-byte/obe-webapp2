import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../lib/session";
import { getFlag, setFlag } from "../../../lib/scopedSettings";
import { unseen, WHATS_NEW } from "../../../lib/whatsNew";
import { withErrors } from "../../../lib/apiHandler";

export const dynamic = "force-dynamic";

// GET — the "What's new" entries this person hasn't dismissed (for their role). POST — dismiss them all.
async function GET_handler() {
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ entries: [] });
  const last = await getFlag(user.id, "whatsnew").catch(() => null);
  return NextResponse.json({ entries: unseen(user.role, ((user as { extraRoles?: string[] }).extraRoles) || [], last) });
}
async function POST_handler() {
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  await setFlag(user.id, "whatsnew", WHATS_NEW[0].id).catch(() => null);
  return NextResponse.json({ ok: true });
}
export const GET = withErrors(GET_handler);
export const POST = withErrors(POST_handler);
