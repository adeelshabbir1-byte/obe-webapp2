import { NextRequest, NextResponse } from "next/server";
import { getState, saveDraft, saveState, MISSING } from "../../../../../lib/topicPlan";
import { forbidden, wsUser } from "../../../../../lib/topicApi";
import { withErrors } from "../../../../../lib/apiHandler";

// The person's last set of open courses (PUT {open}) and their one draft (POST {draft} / DELETE).
async function GET_handler() {
  const user = await wsUser();
  if (!user) return forbidden();
  return NextResponse.json(await getState(user.id));
}
async function PUT_handler(req: NextRequest) {
  const user = await wsUser();
  if (!user) return forbidden();
  const b = await req.json().catch(() => ({}));
  try { await saveState(user.id, b.open); return NextResponse.json({ ok: true }); } catch { return NextResponse.json({ error: MISSING }, { status: 500 }); }
}
async function POST_handler(req: NextRequest) {
  const user = await wsUser();
  if (!user) return forbidden();
  const b = await req.json().catch(() => ({}));
  try { await saveDraft(user.id, b.draft || null); return NextResponse.json({ ok: true, at: new Date() }); } catch { return NextResponse.json({ error: MISSING }, { status: 500 }); }
}
async function DELETE_handler() {
  const user = await wsUser();
  if (!user) return forbidden();
  await saveDraft(user.id, null).catch(() => null);
  return NextResponse.json({ ok: true });
}
export const GET = withErrors(GET_handler);
export const PUT = withErrors(PUT_handler);
export const POST = withErrors(POST_handler);
export const DELETE = withErrors(DELETE_handler);
