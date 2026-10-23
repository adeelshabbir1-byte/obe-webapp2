import { NextResponse } from "next/server";
import { getAuthenticatedStudent } from "../../../../lib/studentSession";
import { noticesFor, unreadNotices, markNoticesRead } from "../../../../lib/studentNotices";

export const dynamic = "force-dynamic";

/** GET — the student's notices and how many are unread. */
export async function GET() {
  const st = await getAuthenticatedStudent();
  if (!st) return NextResponse.json({ error: "Sign in." }, { status: 401 });
  const [items, unread] = await Promise.all([noticesFor(st.id), unreadNotices(st.id)]);
  return NextResponse.json({ items, unread });
}
/** POST { id? } — mark one (or all) read. */
export async function POST(req: Request) {
  const st = await getAuthenticatedStudent();
  if (!st) return NextResponse.json({ error: "Sign in." }, { status: 401 });
  const b = await req.json().catch(() => ({}));
  await markNoticesRead(st.id, typeof b.id === "string" ? b.id : undefined);
  return NextResponse.json({ ok: true });
}
