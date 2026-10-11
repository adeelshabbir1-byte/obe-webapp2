import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../../../lib/session";
import { requireInstructorCourse } from "../../../../../../lib/instructorGuard";
import { db, getCourseResult, approversFor, notify, logResult, resultSummary } from "../../../../../../lib/resultApproval";

// POST { action: "submit" | "withdraw" } — the Instructor sends the course result for approval, or takes it back
// (only while it is still waiting).
export async function POST(req: NextRequest, { params }: { params: { courseId: string } }) {
  const user = await getAuthenticatedUser();
  const course = await requireInstructorCourse(user, params.courseId);
  if (!course || !user) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const b = await req.json().catch(() => ({}));
  const current = await getCourseResult(course.id);

  if (b.action === "withdraw") {
    if (current?.status !== "SUBMITTED") return NextResponse.json({ error: "Only a result that is waiting for approval can be withdrawn." }, { status: 409 });
    await db.courseResult.update({ where: { courseId: course.id }, data: { status: "DRAFT" } });
    await logResult(user.id, "RESULT_WITHDRAWN", course.id);
    return NextResponse.json({ ok: true, status: "DRAFT" });
  }
  if (b.action !== "submit") return NextResponse.json({ error: "unknown action" }, { status: 400 });
  if (current?.status === "SUBMITTED") return NextResponse.json({ error: "Already waiting for approval." }, { status: 409 });
  if (current?.status === "APPROVED") return NextResponse.json({ error: "Already approved. Use a grade change request for any change." }, { status: 409 });

  const summary = await resultSummary(course.id);
  if (!summary.students) return NextResponse.json({ error: "No students are enrolled in this course." }, { status: 400 });
  if (summary.withMarks < summary.students) return NextResponse.json({ error: `Marks are missing for ${summary.students - summary.withMarks} of ${summary.students} students. Enter them first.` }, { status: 400 });

  const data = {
    status: "SUBMITTED", termName: course.offeredTermName, termYear: course.offeredTermYear,
    submittedById: user.id, submittedAt: new Date(), decidedById: null, decidedAt: null, summaryJson: JSON.stringify(summary),
  };
  await db.courseResult.upsert({ where: { courseId: course.id }, update: data, create: { courseId: course.id, ...data } });
  await logResult(user.id, "RESULT_SUBMITTED", course.id, { students: summary.students, passRate: summary.passRate, mean: summary.mean });
  const ap = await approversFor(course.id);
  await notify(ap.chairmanId, user.id, ap.ids, `Result to approve: ${course.code} ${course.title}`,
    `${user.name} submitted the result of ${course.code} (${summary.students} students, mean ${summary.mean}%, pass rate ${summary.passRate}%). Please approve it or return it with a note.`, "/results-approval");
  return NextResponse.json({ ok: true, status: "SUBMITTED" });
}
