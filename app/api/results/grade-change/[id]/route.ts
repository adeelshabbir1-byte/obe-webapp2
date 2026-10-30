import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../../lib/session";
import { prisma } from "../../../../../lib/db";
import { db, canDecide, notify, logResult, type GradeChangeRow } from "../../../../../lib/resultApproval";
import { chairmanIdFor } from "../../../../../lib/reportScope";
import { withErrors } from "../../../../../lib/apiHandler";

// POST { action: "approve" | "reject", note } — decide one grade change request.
async function POST_handler(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const b = await req.json().catch(() => ({}));
  const gc = (await db.gradeChangeRequest.findUnique({ where: { id: params.id } })) as GradeChangeRow | null;
  if (!gc) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (!(await canDecide(user, gc.courseId))) return NextResponse.json({ error: "You can't decide this grade change." }, { status: 403 });
  if (gc.status !== "PENDING") return NextResponse.json({ error: "Already decided." }, { status: 409 });
  const note = String(b.note || "").trim().slice(0, 1000);
  const approve = b.action === "approve";
  if (!approve && b.action !== "reject") return NextResponse.json({ error: "unknown action" }, { status: 400 });
  if (!approve && note.length < 5) return NextResponse.json({ error: "Give a reason for rejecting it." }, { status: 400 });
  await db.gradeChangeRequest.update({ where: { id: gc.id }, data: { status: approve ? "APPROVED" : "REJECTED", decidedById: user.id, decidedAt: new Date(), decisionNote: note || null } });
  const [course, student] = await Promise.all([
    prisma.course.findUnique({ where: { id: gc.courseId }, select: { code: true, instructorId: true } }),
    prisma.student.findUnique({ where: { id: gc.studentId }, select: { rollNumber: true, name: true } }),
  ]);
  await logResult(user.id, approve ? "GRADE_CHANGE_APPROVED" : "GRADE_CHANGE_REJECTED", gc.courseId, { studentId: gc.studentId, rollNumber: student?.rollNumber || null, oldGrade: gc.oldGrade, newGrade: gc.newGrade, note: note || null });
  if (course?.instructorId) await notify(await chairmanIdFor(user), user.id, [course.instructorId], `Grade change ${approve ? "approved" : "rejected"}: ${course.code} — ${student?.rollNumber || ""}`,
    `${user.name} ${approve ? "approved" : "rejected"} the change of ${student?.name || "the student"} from ${gc.oldGrade} to ${gc.newGrade}${note ? `: ${note}` : "."}`, `/instructor/courses/${gc.courseId}/marks`);
  return NextResponse.json({ ok: true });
}
export const POST = withErrors(POST_handler);
