import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../lib/session";
import { prisma } from "../../../../lib/db";
import { db, getCourseResult, canDecide, notify, logResult, resultSummary } from "../../../../lib/resultApproval";
import { chairmanIdFor } from "../../../../lib/reportScope";
import { alertStudents } from "../../../../lib/messaging";
import { recordPloChange, PLO_DROP_ALERT } from "../../../../lib/ploDelta";
import { withErrors } from "../../../../lib/apiHandler";

export const maxDuration = 60;

// POST { courseId, action: "approve" | "return", note } — the Chairman (Head of Department) or Institute Head decides a
// submitted course result. Returning needs a note; the Instructor sees it and the marks unlock.
async function POST_handler(req: NextRequest) {
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
  // The CLO method and settings in force are saved with this term; later changes never silently change it.
  await import("../../../../lib/cloMethods").then((m) => m.lockTerm(courseId)).catch(() => null);
  if (course?.instructorId) await notify(await chairmanIdFor(user), user.id, [course.instructorId], `Result approved: ${course.code}`, `${user.name} approved the result of ${course.code} ${course.title}. Marks are now locked; any change needs a grade change request.`, `/instructor/courses/${courseId}/marks`);
  // Cohort PLO change caused by this course; a drop beyond the threshold alerts the OMC and the Program Lead.
  try {
    const ch = await recordPloChange(courseId);
    const drops = (ch?.deltas || []).filter((d) => d.before != null && d.after != null && d.before - d.after >= PLO_DROP_ALERT);
    if (ch && drops.length) {
      const head = await chairmanIdFor(user);
      const batch = await prisma.batch.findUnique({ where: { id: ch.batchId }, select: { coordinatorId: true, batchName: true } });
      const omc = await prisma.user.findMany({ where: { isActive: true, OR: [{ role: "OMC" }, { omcHat: true }], AND: [{ OR: [{ managedById: head }, { managedBy: { managedById: head } }] }] } as never, select: { id: true } });
      const to = Array.from(new Set([...(batch ? [batch.coordinatorId] : []), ...omc.map((u) => u.id)]));
      const text = drops.map((d) => `PLO-${d.plo} ${d.before}% → ${d.after}%`).join(", ");
      if (to.length) await notify(head, user.id, to, `GA drop after ${ch.code}`, `Approving ${ch.code} lowered ${batch?.batchName || "the batch"}'s GA attainment: ${text}. Consider a CQI action.`, `/plo-progress?batchId=${ch.batchId}`);
    }
  } catch { /* the approval itself already succeeded */ }
  // How students did on each topic, kept per offering for the Topic Workspace (history, heat colours).
  await import("../../../../lib/topicPerformance").then((m) => m.storeTopicPerformance(courseId)).catch(() => 0);
  // Students (and, if turned on, parents) hear that the result is out.
  try { const ids = (await prisma.studentEnrollment.findMany({ where: { courseId }, select: { studentId: true } })).map((e) => e.studentId); await alertStudents(await chairmanIdFor(user), ids, "RESULT_STUDENT", `Result out: ${course?.code || "course"}`, "Your result is approved. See My Transcript in the student portal."); } catch { /* best effort */ }
  return NextResponse.json({ ok: true, status: "APPROVED" });
}
export const POST = withErrors(POST_handler);
