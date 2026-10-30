import { NextResponse } from "next/server";
import { getAuthenticatedStudent } from "../../../../lib/studentSession";
import { noticesFor, unreadNotices, markNoticesRead } from "../../../../lib/studentNotices";
import { withErrors } from "../../../../lib/apiHandler";

export const dynamic = "force-dynamic";

/** GET — the student's notices and how many are unread. */
async function GET_handler() {
  const st = await getAuthenticatedStudent();
  if (!st) return NextResponse.json({ error: "Sign in." }, { status: 401 });
  const [items, unread] = await Promise.all([noticesFor(st.id), unreadNotices(st.id)]);
  return NextResponse.json({ items, unread });
}
/** POST { id? } — mark one (or all) read. */
async function POST_handler(req: Request) {
  const st = await getAuthenticatedStudent();
  if (!st) return NextResponse.json({ error: "Sign in." }, { status: 401 });
  const b = await req.json().catch(() => ({}));
  await markNoticesRead(st.id, typeof b.id === "string" ? b.id : undefined);
  return NextResponse.json({ ok: true });
}
export const GET = withErrors(GET_handler);
export const POST = withErrors(POST_handler);
