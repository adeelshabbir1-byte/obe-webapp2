import { NextRequest, NextResponse } from "next/server";
import { getSignedInUser } from "../../../lib/session";
import { latest, unreadCount, markRead } from "../../../lib/notifications";
import { withErrors } from "../../../lib/apiHandler";

export const dynamic = "force-dynamic";

// GET: the latest notifications and the unread count. POST { id } marks one read, { all: true } marks all read.
async function GET_handler() {
  const user = await getSignedInUser();
  if (!user) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const [items, unread] = await Promise.all([latest(user.id, 20), unreadCount(user.id)]);
  return NextResponse.json({ unread, items });
}
async function POST_handler(req: NextRequest) {
  const user = await getSignedInUser();
  if (!user) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const b = await req.json().catch(() => ({}));
  await markRead(user.id, b.all ? undefined : String(b.id || "none"));
  return NextResponse.json({ ok: true, unread: await unreadCount(user.id) });
}
export const GET = withErrors(GET_handler);
export const POST = withErrors(POST_handler);
