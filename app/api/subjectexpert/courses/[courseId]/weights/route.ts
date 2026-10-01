import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../../../lib/session";
import { prisma } from "../../../../../../lib/db";
import { requireOwnedCourse } from "../../../../../../lib/subjectExpertGuard";
import { blockedAsNonBaseCourse, syncCourseContentToLinkedCourses } from "../../../../../../lib/contentSync";
import { writeAuditLog } from "../../../../../../lib/audit";
import { getPolicyForCourse, checkPolicyCompliance } from "../../../../../../lib/weightPolicy";
import { ensureAllInstrumentCounts } from "../../../../../../lib/instrumentAutoFill";

const COUNT_FIELDS: { field: string; policyMinKey: string }[] = [
  { field: "assignmentCount", policyMinKey: "assignmentMinCount" },
  { field: "quizCount", policyMinKey: "quizMinCount" },
  { field: "projectCount", policyMinKey: "projectMinCount" },
  { field: "labCount", policyMinKey: "labMinCount" },
  { field: "midtermCount", policyMinKey: "midtermMinCount" },
  { field: "finalCount", policyMinKey: "finalMinCount" },
];

export async function PUT(req: NextRequest, { params }: { params: { courseId: string } }) {
  const user = await getAuthenticatedUser();
  const course = await requireOwnedCourse(user, params.courseId);
  if (!course || !user) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const blocked = await blockedAsNonBaseCourse(course.id);
  if (blocked) return NextResponse.json({ error: blocked }, { status: 409 });

  const body = await req.json();
  const fields = ["assignmentPct", "quizPct", "projectPct", "labPct", "midtermPct", "finalPct"];
  const vals: Record<string, number> = {};
  for (const f of fields) vals[f] = parseInt(body[f] ?? 0, 10) || 0;

  const total = fields.reduce((sum, f) => sum + vals[f], 0);
  if (total !== 100) {
    return NextResponse.json({ error: `weights must total 100%, currently ${total}%` }, { status: 400 });
  }

  const courseWithCoordinator = await prisma.course.findUnique({ where: { id: course.id }, include: { coordinator: true } });
  const policy = await getPolicyForCourse(courseWithCoordinator?.coordinator.managedById || null, course.courseType);
  const violations = checkPolicyCompliance(vals as any, policy, course.hasLab);

  // Number of items per category — pre-filled from the OMC's minimum on
  // the form, the SE can raise it. Can't be saved below that minimum.
  const counts: Record<string, number> = {};
  for (const { field, policyMinKey } of COUNT_FIELDS) {
    const raw = parseInt(body[field] ?? 0, 10) || 0;
    const min = policy ? (policy as any)[policyMinKey] || 0 : 0;
    counts[field] = Math.max(raw, min);
  }

  if (violations.length > 0) {
    // Counts aren't subject to the %-range policy (only MinCount applies,
    // already enforced above), so save them regardless of whether the
    // %'s themselves need OMC approval — no reason to make the SE re-type
    // their item counts once the exception is approved.
    await prisma.course.update({ where: { id: course.id }, data: counts });

    // Out of policy range — don't apply directly. Create/update a pending
    // exception request for the OMC to approve instead.
    await prisma.weightExceptionRequest.upsert({
      where: { courseId_source: { courseId: course.id, source: "SE" } },
      create: {
        courseId: course.id, source: "SE", requestedById: user.id,
        assignmentPct: vals.assignmentPct, quizPct: vals.quizPct, projectPct: vals.projectPct,
        labPct: vals.labPct, midtermPct: vals.midtermPct, finalPct: vals.finalPct,
        status: "pending",
      },
      update: {
        assignmentPct: vals.assignmentPct, quizPct: vals.quizPct, projectPct: vals.projectPct,
        labPct: vals.labPct, midtermPct: vals.midtermPct, finalPct: vals.finalPct,
        status: "pending", omcComment: null, reviewedById: null, reviewedAt: null,
      },
    });

    await writeAuditLog({ actorUserId: user.id, action: "WEIGHT_EXCEPTION_REQUESTED", entityType: "Course", entityId: course.id, metadata: { violations: violations.join("; ") } });

    return NextResponse.json({
      pendingApproval: true,
      violations,
      message: "These weights fall outside the OMC policy for this course type. A request has been sent to the OMC for approval — your current saved weights are unchanged until then.",
    }, { status: 202 });
  }

  const updated = await prisma.course.update({ where: { id: course.id }, data: { ...vals, ...counts, weightsConfirmedAt: new Date() } });
  await writeAuditLog({ actorUserId: user.id, action: "WEIGHTS_UPDATED", entityType: "Course", entityId: course.id });

  // Pre-create instruments up to each category's chosen count, splitting
  // the % evenly across them, so the Assessments & Submit tab already has
  // the right number of Quiz/Assignment/exam-question rows waiting.
  await ensureAllInstrumentCounts(course.id, "SE", updated);

  await syncCourseContentToLinkedCourses(course.id);

  return NextResponse.json({ course: updated, pendingApproval: false });
}
