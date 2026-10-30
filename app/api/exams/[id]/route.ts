import { examChairman } from "../../../../lib/examBranch";
import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../lib/session";
import { xdb, loadSession, readSettings } from "../../../../lib/exams";
import { withErrors } from "../../../../lib/apiHandler";

async function own(id: string) {
  const user = await getAuthenticatedUser();
  const cid = user ? await examChairman(user) : null;
  if (!user || !cid) return null;
  const s = await loadSession(id);
  return s && s.chairmanId === cid ? { user, s } : null;
}
async function PATCH_handler(req: NextRequest, { params }: { params: { id: string } }) {
  const o = await own(params.id);
  if (!o) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const r = readSettings(await req.json().catch(() => ({})));
  if ("error" in r) return NextResponse.json({ error: r.error }, { status: 400 });
  await xdb.examSession.update({ where: { id: o.s.id }, data: r.data });
  return NextResponse.json({ ok: true });
}
async function DELETE_handler(_req: NextRequest, { params }: { params: { id: string } }) {
  const o = await own(params.id);
  if (!o) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  await xdb.examPaper.deleteMany({ where: { sessionId: o.s.id } });
  await xdb.examSession.delete({ where: { id: o.s.id } });
  return NextResponse.json({ ok: true });
}
export const PATCH = withErrors(PATCH_handler);
export const DELETE = withErrors(DELETE_handler);
