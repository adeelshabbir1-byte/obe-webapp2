import { NextRequest, NextResponse } from "next/server";
import { getState, saveDraft, saveState, MISSING } from "../../../../../lib/topicPlan";
import { forbidden, wsUser } from "../../../../../lib/topicApi";

// The person's last set of open courses (PUT {open}) and their one draft (POST {draft} / DELETE).
export async function GET() {
  const user = await wsUser();
  if (!user) return forbidden();
  return NextResponse.json(await getState(user.id));
}
export async function PUT(req: NextRequest) {
  const user = await wsUser();
  if (!user) return forbidden();
  const b = await req.json().catch(() => ({}));
  try { await saveState(user.id, b.open); return NextResponse.json({ ok: true }); } catch { return NextResponse.json({ error: MISSING }, { status: 500 }); }
}
export async function POST(req: NextRequest) {
  const user = await wsUser();
  if (!user) return forbidden();
  const b = await req.json().catch(() => ({}));
  try { await saveDraft(user.id, b.draft || null); return NextResponse.json({ ok: true, at: new Date() }); } catch { return NextResponse.json({ error: MISSING }, { status: 500 }); }
}
export async function DELETE() {
  const user = await wsUser();
  if (!user) return forbidden();
  await saveDraft(user.id, null).catch(() => null);
  return NextResponse.json({ ok: true });
}
