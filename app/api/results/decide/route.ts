import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../lib/session";
import { prisma } from "../../../../lib/db";
import { db, getCourseResult, canDecide, notify, logResult, resultSummary } from "../../../../lib/resultApproval";
import { chairmanIdFor } from "../../../../lib/reportScope";

// POST { courseId, action: "approve" | "return", note } — the Chairman (Head of Department) or Institute Head decides a
// submitted course result. Returning needs a note; the Instructor sees it and the marks unlock.
export async function POST(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const b = await req.json().catch(() => ({}));
  const courseId = String(b.courseId || ""), note = String(b.note || "").trim().slice(0, 1000);
  if (!(await canDecide(user, courseId))) return NextResponse.json({ error: "You can't decide this course's result." }, { status: 403 });
  const r = await getCourseResult(courseId);
  if (r?.status !== "SUBMITTED") return NextResponse.json({ error: "This result is not waiting for approval." }, { status: 409 });
  const course = await prisma.course.findUnique({ where: { id: courseId }, select: { code: true, title: true, instructorId: true } });

  if (b.action === "return") {
    if (note.length < 5) return NextResponse.json({ error: "Say what needs fixing — the Instructor will see your note." }, { status: 400 });
    await db.courseResult.update({ where: { courseId }, data: { status: "RETURNED", decidedById: user.id, decidedAt: new Date(), note } });
    await logResult(user.id, "RESULT_RETURNED", courseId, { note });
    if (course?.instructorId) await notify(await chairmanIdFor(user), user.id, [course.instructorId], `Result returned: ${course.code}`, `${user.name} returned the result of ${course.code} ${course.title}: ${note}`, `/instructor/courses/${courseId}/marks`);
    return NextResponse.json({ ok: true, status: "RETURNED" });
  }
  if (b.action !== "approve") return NextResponse.json({ error: "unknown action" }, { status: 400 });
  const summary = await resultSummary(courseId);
  await db.courseResult.update({ where: { courseId }, data: { status: "APPROVED", decidedById: user.id, decidedAt: new Date(), note: note || null, summaryJson: JSON.stringify(summary) } });
  await logResult(user.id, "RESULT_APPROVED", courseId, { students: summary.students, passRate: summary.passRate, note: note || null });
  if (course?.instructorId) await notify(await chairmanIdFor(user), user.id, [course.instructorId], `Result approved: ${course.code}`, `${user.name} approved the result of ${course.code} ${course.title}. Marks are now locked; any change needs a grade change request.`, `/instructor/courses/${courseId}/marks`);
  return NextResponse.json({ ok: true, status: "APPROVED" });
}
