import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../lib/session";
import { prisma } from "../../../lib/db";
import { writeAuditLog } from "../../../lib/audit";
import { keyOf } from "../../../lib/courseKeys";
import { reviewMarker, setReviewMarker } from "../../../lib/prereqCascade";
import { rowsForTopic } from "../../../lib/topicLinks";
import { withErrors } from "../../../lib/apiHandler";

const bad = (error: string, status = 400) => NextResponse.json({ error }, { status });

// The teacher of a dependent course plans the review of a MILD / WEAK prerequisite topic in one of their lectures
// (the lecture's plan shows it), marks it done, or takes it back out.
async function POST_handler(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user) return bad("not logged in", 401);
  const b = await req.json().catch(() => ({}));
  const course = await prisma.course.findUnique({ where: { id: String(b.courseId || "") }, select: { id: true, instructorId: true, coordinatorId: true } });
  if (!course) return bad("course not found", 404);
  if (course.instructorId !== user.id && course.coordinatorId !== user.id) return bad("Only the course's teacher (or its Program Lead) plans its reviews.", 403);
  try {
    const link = await prisma.topicPrerequisite.findUnique({ where: { id: String(b.linkId || "") } });
    const key = await keyOf(course.id);
    if (!link || !key || link.coordinatorId !== key.coordinatorId || link.dependentCourseCode !== key.code) return bad("This prerequisite does not apply to this course.", 404);
    if (link.strength === "STRONG") return bad("A strong prerequisite is enforced at registration; no review is planned for it.");
    const marker = reviewMarker(link);
    const existing = await prisma.prereqReviewPlan.findUnique({ where: { linkId_courseId: { linkId: link.id, courseId: course.id } } });
    if (b.action === "remove") {
      if (existing) {
        await setReviewMarker(course.id, existing.lectureNumber, marker, false);
        await prisma.prereqReviewPlan.delete({ where: { id: existing.id } });
      }
      return NextResponse.json({ ok: true });
    }
    const lectureNumber = Math.round(Number(b.lectureNumber));
    const row = Number.isFinite(lectureNumber) ? await prisma.lectureRow.findFirst({ where: { courseId: course.id, source: "INSTRUCTOR", lectureNumber } }) : null;
    if (!row) return bad("Choose one of your lectures for the review.");
    const status = b.status === "DONE" ? "DONE" : "PLANNED";
    const note = typeof b.note === "string" ? b.note.trim().slice(0, 500) || null : null;
    if (existing && existing.lectureNumber !== lectureNumber) await setReviewMarker(course.id, existing.lectureNumber, marker, false);
    await setReviewMarker(course.id, lectureNumber, marker, true);
    const plan = await prisma.prereqReviewPlan.upsert({
      where: { linkId_courseId: { linkId: link.id, courseId: course.id } },
      create: { linkId: link.id, courseId: course.id, lectureNumber, status, note, byId: user.id },
      update: { lectureNumber, status, note, byId: user.id },
    });
    await writeAuditLog({ actorUserId: user.id, action: "PREREQ_REVIEW_PLANNED", entityType: "PrereqReviewPlan", entityId: plan.id, metadata: { lectureNumber, status } });
    // The review should come before the topic that needs it.
    const depRows = await prisma.lectureRow.findMany({ where: { courseId: course.id, source: "INSTRUCTOR" }, select: { lectureNumber: true, topic: true } });
    const first = Math.min(...rowsForTopic(depRows, link.dependentTopic).map((r) => r.lectureNumber), Infinity);
    return NextResponse.json({ plan, warning: lectureNumber > first ? `Lecture ${lectureNumber} comes after "${link.dependentTopic}" (lecture ${first}). Plan the review before it.` : null });
  } catch {
    return bad("Run prisma/migration_master_spec.sql in Supabase first.", 500);
  }
}
export const POST = withErrors(POST_handler);
