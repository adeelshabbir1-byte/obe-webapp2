import { NextRequest, NextResponse } from "next/server";
import { prisma } from "../../../../../../lib/db";
import { getAuthenticatedUser } from "../../../../../../lib/session";
import { applySuggested, suggestFor } from "../../../../../../lib/suggestPlan";
import { notifyStudents } from "../../../../../../lib/studentNotices";
import { withErrors } from "../../../../../../lib/apiHandler";

export const dynamic = "force-dynamic";

// POST { min, max, excluded[], apply? } — the advisor's "Suggest plan" (Adeel prompt §21.3–4). Without apply: a preview.
// With apply: the plan is saved as a new version (each move recorded with the reason "Suggest plan").
async function POST_handler(req: NextRequest, { params }: { params: { studentId: string } }) {
  const user = await getAuthenticatedUser();
  if (!user || !user.mfaVerified) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const s = await prisma.student.findUnique({ where: { id: params.studentId }, select: { id: true, batch: { select: { advisorId: true } } } });
  if (!s || s.batch?.advisorId !== user.id) return NextResponse.json({ error: "not found" }, { status: 404 });
  const b = (await req.json().catch(() => ({}))) as { min?: number; max?: number; excluded?: number[]; apply?: boolean };
  const min = Math.max(0, Number(b.min) || 15), max = Math.min(24, Math.max(min, Number(b.max) || 18));
  const r = await suggestFor(s.id, { min, max, excluded: (b.excluded || []).map(Number).filter(Boolean) });
  if (!r) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (!b.apply) return NextResponse.json(r);
  const moved = await applySuggested(s.id, r.bySem, r.ids, user.id);
  await notifyStudents([s.id], { kind: "PLAN", title: "Your advisor updated your degree plan", body: `${moved} course(s) moved. Open your degree plan to see it and comment.`, href: "/student/degree-plan" }).catch(() => null);
  return NextResponse.json({ ...r, moved });
}
export const POST = withErrors(POST_handler);
