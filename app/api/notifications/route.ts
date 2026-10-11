import { NextRequest, NextResponse } from "next/server";
import { getSignedInUser } from "../../../lib/session";
import { latest, unreadCount, markRead } from "../../../lib/notifications";

export const dynamic = "force-dynamic";

// GET: the latest notifications and the unread count. POST { id } marks one read, { all: true } marks all read.
export async function GET() {
  const user = await getSignedInUser();
  if (!user) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const [items, unread] = await Promise.all([latest(user.id, 20), unreadCount(user.id)]);
  return NextResponse.json({ unread, items });
}
export async function POST(req: NextRequest) {
  const user = await getSignedInUser();
  if (!user) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const b = await req.json().catch(() => ({}));
  await markRead(user.id, b.all ? undefined : String(b.id || "none"));
  return NextResponse.json({ ok: true, unread: await unreadCount(user.id) });
}
