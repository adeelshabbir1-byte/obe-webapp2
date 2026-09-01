import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../../../lib/session";
import { prisma } from "../../../../../../lib/db";
import { requireOwnedCourse } from "../../../../../../lib/subjectExpertGuard";
import { writeAuditLog } from "../../../../../../lib/audit";
import { getPolicyForCourse, checkPolicyCompliance } from "../../../../../../lib/weightPolicy";

export async function PUT(req: NextRequest, { params }: { params: { courseId: string } }) {
  const user = await getAuthenticatedUser();
  const course = await requireOwnedCourse(user, params.courseId);
  if (!course || !user) return NextResponse.json({ error: "forbidden" }, { status: 403 });

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
  const violations = checkPolicyCompliance(vals as any, policy);

  if (violations.length > 0) {
    // Out of policy range — don't apply directly. Create/update a pending
    // exception request for the OMC to approve instead.
    await prisma.weightExceptionRequest.upsert({
      where: { courseId: course.id },
      create: {
        courseId: course.id, requestedById: user.id,
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

  const updated = await prisma.course.update({ where: { id: course.id }, data: vals });
  await writeAuditLog({ actorUserId: user.id, action: "WEIGHTS_UPDATED", entityType: "Course", entityId: course.id });

  return NextResponse.json({ course: updated, pendingApproval: false });
}
