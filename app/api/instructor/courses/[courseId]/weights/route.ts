import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../../../lib/session";
import { prisma } from "../../../../../../lib/db";
import { requireInstructorCourse } from "../../../../../../lib/instructorGuard";
import { ensureInstructorCopy } from "../../../../../../lib/instructorCopy";
import { writeAuditLog } from "../../../../../../lib/audit";
import { getPolicyForCourse, checkPolicyCompliance } from "../../../../../../lib/weightPolicy";

export async function PUT(req: NextRequest, { params }: { params: { courseId: string } }) {
  const user = await getAuthenticatedUser();
  const course = await requireInstructorCourse(user, params.courseId);
  if (!course || !user) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  await ensureInstructorCopy(course.id);

  const body = await req.json();
  const fields = ["assignmentPct", "quizPct", "projectPct", "labPct", "midtermPct", "finalPct"];
  const vals: Record<string, number> = {};
  for (const f of fields) vals[f] = parseInt(body[f] ?? 0, 10) || 0;
  const total = fields.reduce((sum, f) => sum + vals[f], 0);
  if (total !== 100) return NextResponse.json({ error: `weights must total 100%, currently ${total}%` }, { status: 400 });

  const courseWithCoordinator = await prisma.course.findUnique({ where: { id: course.id }, include: { coordinator: true } });
  const policy = await getPolicyForCourse(courseWithCoordinator?.coordinator.managedById || null, course.courseType);
  const violations = checkPolicyCompliance(vals as any, policy, course.hasLab);

  if (violations.length > 0) {
    // Out of policy range — don't apply directly, same as the SE's flow.
    // The current live (Course description forms etc.) weights stay
    // unchanged until the OMC approves this.
    await prisma.weightExceptionRequest.upsert({
      where: { courseId_source: { courseId: course.id, source: "INSTRUCTOR" } },
      create: {
        courseId: course.id, source: "INSTRUCTOR", requestedById: user.id,
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

    await writeAuditLog({ actorUserId: user.id, action: "INSTRUCTOR_WEIGHT_EXCEPTION_REQUESTED", entityType: "Course", entityId: course.id, metadata: { violations: violations.join("; ") } });

    return NextResponse.json({
      pendingApproval: true, violations,
      message: "These weights fall outside the OMC policy for this course type. A request has been sent to the OMC for approval — your current saved weights are unchanged until then.",
    }, { status: 202 });
  }

  const updated = await prisma.course.update({
    where: { id: course.id },
    data: {
      instructorAssignmentPct: vals.assignmentPct, instructorQuizPct: vals.quizPct, instructorProjectPct: vals.projectPct,
      instructorLabPct: vals.labPct, instructorMidtermPct: vals.midtermPct, instructorFinalPct: vals.finalPct,
    },
  });
  await writeAuditLog({ actorUserId: user.id, action: "INSTRUCTOR_WEIGHTS_UPDATED", entityType: "Course", entityId: course.id });
  return NextResponse.json({ course: updated, pendingApproval: false });
}
