import { prisma } from "../../../../../../lib/db";
import { courseChain } from "../../../../../../lib/outcomeFlow";
import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../../../lib/session";
import { requireInstructorCourse } from "../../../../../../lib/instructorGuard";
import { db, getCourseResult, approversFor, notify, logResult, resultSummary } from "../../../../../../lib/resultApproval";
import { withErrors } from "../../../../../../lib/apiHandler";

// POST { action: "submit" | "withdraw" } — the Instructor sends the course result for approval, or takes it back
// (only while it is still waiting).
async function POST_handler(req: NextRequest, { params }: { params: { courseId: string } }) {
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

  // A CLO that no assessment measures cannot have an attainment — fix the plan before submitting.
  { const chain = await courseChain(course.id, "INSTRUCTOR").catch(() => null);
    const unassessed = (chain?.clos || []).filter((c) => !chain!.assessments.some((a) => a.cloId === c.id)).map((c) => c.code);
    if (unassessed.length) return NextResponse.json({ error: `${unassessed.join(", ")} ${unassessed.length > 1 ? "are" : "is"} not measured by any assessment. Link an assessment to its topics (Assessments tab) before submitting.` }, { status: 400 }); }
  // Combined theory + lab (Adeel prompt §31.3): the theory teacher submits only when the lab marks of every student are in.
  { const db2 = prisma as unknown as Record<string, any>;
    const links = ((await db2.labTheorySetting?.findMany({ where: { theoryCourseId: course.id, intoTheory: true } }).catch(() => [])) || []) as { labCourseId: string }[];
    for (const l of links) {
      const lab = await prisma.course.findUnique({ where: { id: l.labCourseId }, select: { code: true } });
      const [en, withMarks] = await Promise.all([prisma.studentEnrollment.count({ where: { courseId: l.labCourseId, status: { not: "WITHDRAWN" } } }), prisma.labMark.groupBy({ by: ["studentId"], where: { courseId: l.labCourseId } }).then((x) => x.length).catch(() => 0)]);
      if (en && withMarks < en) return NextResponse.json({ error: `Lab marks are missing for ${en - withMarks} of ${en} students in ${lab?.code || "the lab"}. The lab teacher enters them first; you can't change them here.` }, { status: 409 });
    }
  }
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
export const POST = withErrors(POST_handler);
