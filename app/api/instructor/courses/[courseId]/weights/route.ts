import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../../../lib/session";
import { prisma } from "../../../../../../lib/db";
import { requireInstructorCourse } from "../../../../../../lib/instructorGuard";
import { ensureInstructorCopy } from "../../../../../../lib/instructorCopy";
import { writeAuditLog } from "../../../../../../lib/audit";
import { getPolicyForCourse, checkPolicyCompliance } from "../../../../../../lib/weightPolicy";
import { ensureAllInstrumentCounts } from "../../../../../../lib/instrumentAutoFill";
import { planFor } from "../../../../../../lib/assessmentWeights";
import { withErrors } from "../../../../../../lib/apiHandler";

// The Instructor's own number of items per category (never below the OMC's minimum) and "best of" for quizzes / assignments.
const COUNT_FIELDS: { field: string; column: string; policyMinKey: string }[] = [
  { field: "assignmentCount", column: "instructorAssignmentCount", policyMinKey: "assignmentMinCount" },
  { field: "quizCount", column: "instructorQuizCount", policyMinKey: "quizMinCount" },
  { field: "projectCount", column: "instructorProjectCount", policyMinKey: "projectMinCount" },
  { field: "labCount", column: "instructorLabCount", policyMinKey: "labMinCount" },
  { field: "midtermCount", column: "instructorMidtermCount", policyMinKey: "midtermMinCount" },
  { field: "finalCount", column: "instructorFinalCount", policyMinKey: "finalMinCount" },
];

async function PUT_handler(req: NextRequest, { params }: { params: { courseId: string } }) {
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
  // Same percentages as the ones already approved for this instructor: no new OMC request needed.
  const instField = (f: string) => "instructor" + f[0].toUpperCase() + f.slice(1);
  // (Keeping the Subject Expert's own approved split also needs no new request.)
  const alreadyApproved = (!!(course as any).instructorWeightsConfirmedAt && fields.every((f) => (course as any)[instField(f)] === vals[f]))
    || (!!course.weightsConfirmedAt && fields.every((f) => (course as any)[f] === vals[f]));
  const violations = alreadyApproved ? [] : checkPolicyCompliance(vals as any, policy, course.hasLab);
  // The OMC's locked assessment limits for this kind of course: outside them, the change goes to the OMC as an exception.
  if (!alreadyApproved) violations.push(...(await (await import("../../../../../../lib/omcRules")).limitBreaches(course.id, "INSTRUCTOR", { quiz: vals.quizPct, assignment: vals.assignmentPct, midterm: vals.midtermPct, final: vals.finalPct, project: vals.projectPct, lab: vals.labPct }).catch(() => [] as string[])));

  // Counts and best-of are only changed when the form sends them (older clients sent percentages only).
  const counts: Record<string, number> = {};
  const hasCounts = COUNT_FIELDS.some(({ field }) => body[field] !== undefined);
  if (hasCounts) {
    for (const { field, column, policyMinKey } of COUNT_FIELDS) {
      const raw = parseInt(body[field] ?? 0, 10) || 0;
      const min = policy ? (policy as any)[policyMinKey] || 0 : 0;
      counts[column] = Math.max(raw, min);
    }
    for (const [field, column, countColumn] of [["quizBestOf", "instructorQuizBestOf", "instructorQuizCount"], ["assignmentBestOf", "instructorAssignmentBestOf", "instructorAssignmentCount"]] as const) {
      const raw = body[field];
      const n = raw === undefined || raw === null || raw === "" ? NaN : parseInt(raw, 10);
      (counts as Record<string, number | null>)[column] = isNaN(n) ? null : Math.max(1, Math.min(n, counts[countColumn] || n));
    }
  }

  if (violations.length > 0) {
    // Counts are not subject to the percentage policy: keep them, and build the items with the percentages already in force.
    if (hasCounts) {
      const saved = await prisma.course.update({ where: { id: course.id }, data: counts });
      await ensureAllInstrumentCounts(course.id, "INSTRUCTOR", planFor(saved, "INSTRUCTOR"));
    }
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
      instructorWeightsConfirmedAt: new Date(),
      ...counts,
    },
  });
  await writeAuditLog({ actorUserId: user.id, action: "INSTRUCTOR_WEIGHTS_UPDATED", entityType: "Course", entityId: course.id });
  // Same as the Subject Expert's page: the Assessments tab gets exactly the chosen number of quizzes, assignments and exam questions.
  if (hasCounts) await ensureAllInstrumentCounts(course.id, "INSTRUCTOR", planFor(updated, "INSTRUCTOR"));
  return NextResponse.json({ course: updated, pendingApproval: false });
}
export const PUT = withErrors(PUT_handler);
