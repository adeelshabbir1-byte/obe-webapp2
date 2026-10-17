import { examChairman } from "../../../../lib/examBranch";
import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../lib/session";
import { xdb, loadSession, readSettings } from "../../../../lib/exams";

async function own(id: string) {
  const user = await getAuthenticatedUser();
  const cid = user ? await examChairman(user) : null;
  if (!user || !cid) return null;
  const s = await loadSession(id);
  return s && s.chairmanId === cid ? { user, s } : null;
}
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const o = await own(params.id);
  if (!o) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const r = readSettings(await req.json().catch(() => ({})));
  if ("error" in r) return NextResponse.json({ error: r.error }, { status: 400 });
  await xdb.examSession.update({ where: { id: o.s.id }, data: r.data });
  return NextResponse.json({ ok: true });
}
export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const o = await own(params.id);
  if (!o) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  await xdb.examPaper.deleteMany({ where: { sessionId: o.s.id } });
  await xdb.examSession.delete({ where: { id: o.s.id } });
  return NextResponse.json({ ok: true });
}
