import { NextResponse } from "next/server";
import { notifyUsers, holdersOf } from "../../../../../../lib/notifications";
import { getAuthenticatedUser } from "../../../../../../lib/session";
import { prisma } from "../../../../../../lib/db";
import { requireOwnedCourse } from "../../../../../../lib/subjectExpertGuard";
import { writeAuditLog } from "../../../../../../lib/audit";
import { snapshotTemplate, diffTemplates } from "../../../../../../lib/templateDiff";
import { ploCoverageShortfalls } from "../../../../../../lib/ploCoverage";
import { questionShortfalls } from "../../../../../../lib/examQuestions";

export async function POST(req: Request, { params }: { params: { courseId: string } }) {
  const user = await getAuthenticatedUser();
  const course = await requireOwnedCourse(user, params.courseId);
  if (!course || !user) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  if (!(await (await import("../../../../../../lib/feedForward")).startReadDone(course.id, user.id).catch(() => true))) return NextResponse.json({ error: "Read the notes from last time first: check in on each (Start of semester) on the CLO page, then submit." }, { status: 409 });

  const clos = await prisma.cLO.findMany({ where: { courseId: course.id, source: "SE" } });
  const lectureRows = await prisma.lectureRow.findMany({ where: { courseId: course.id, source: "SE" } });
  if (clos.length === 0 || lectureRows.length === 0) {
    return NextResponse.json({ error: "add at least one CLO and one lecture row before submitting" }, { status: 400 });
  }

  // Where multiple CLOs map to the same PLO, their contribution % must sum to 100.
  const byPlo: Record<string, number> = {};
  for (const c of clos) {
    if (c.mappedPloId) byPlo[c.mappedPloId] = (byPlo[c.mappedPloId] || 0) + (c.ploContributionPct || 0);
  }
  const badTotals = Object.entries(byPlo).filter(([, total]) => total !== 100);
  if (badTotals.length > 0) {
    return NextResponse.json({
      error: `CLO contribution percentages must sum to 100% per GA — ${badTotals.length} GA(s) don't add up correctly yet`,
    }, { status: 400 });
  }

  // The OMC's coverage rules: every PLO the course serves needs enough marks and enough assessment items.
  const coverage = await ploCoverageShortfalls(course.id, "SE");
  if (coverage.short.length > 0) {
    return NextResponse.json({ error: `The plan doesn't meet the OMC's minimums yet - ${coverage.short.join("; ")}` }, { status: 400 });
  }

  // The OMC's minimum number of questions in the Midterm and Final papers.
  const questions = await questionShortfalls(course.id, "SE");
  if (questions.short.length > 0) {
    return NextResponse.json({ error: `The paper distribution doesn't meet the OMC's minimums yet - ${questions.short.join("; ")}. Add questions on the Paper Distribution tab.` }, { status: 400 });
  }

  // The OMC's locked assessment limits for this kind of course.
  const limits = await (await import("../../../../../../lib/omcRules")).limitBreaches(course.id, "SE");
  if (limits.length > 0) return NextResponse.json({ error: `The plan is outside the OMC's assessment limits — ${limits.join("; ")}.` }, { status: 400 });

  // An approved template is locked: it can only be reopened through an approved change request.
  if (course.templateStatus === "approved") {
    return NextResponse.json({ error: "This template is already approved and locked. Request a change if something must be edited." }, { status: 409 });
  }
  const updated = await prisma.course.update({ where: { id: course.id }, data: { templateStatus: "submitted" } });
  // Each submission is a new voting round for the OMC (votes of the last round stay on record).
  await (await import("../../../../../../lib/sePlan")).newRound(course.id).catch(() => null);
  // Resubmitting a reopened template: record exactly what changed, for the semester's improvement log.
  if (course.templateStatus === "reopened") {
    const open = await prisma.templateChangeRequest.findFirst({ where: { courseId: course.id, status: "approved" }, orderBy: { createdAt: "desc" } });
    if (open && open.beforeJson) {
      const changes = diffTemplates(JSON.parse(open.beforeJson), await snapshotTemplate(course.id));
      await prisma.templateChangeRequest.update({ where: { id: open.id }, data: { status: "completed", changesJson: JSON.stringify(changes), completedAt: new Date() } });
    }
  }
  await writeAuditLog({ actorUserId: user.id, action: "TEMPLATE_SUBMITTED", entityType: "Course", entityId: course.id });
  {
    const lead = await prisma.user.findUnique({ where: { id: course.coordinatorId }, select: { managedById: true } });
    const omc = await (await import("../../../../../../lib/omcMembers")).omcOfCourse(course.id).catch(() => null);
    if (lead?.managedById) await notifyUsers(omc?.members.length ? omc.members.map((m) => m.id) : await holdersOf(lead.managedById, "OMC"), { kind: "TEMPLATE", title: `Course plan to review: ${course.code} ${course.title}`, body: `${user.name} submitted the plan of ${course.code} ${course.title} to the OMC.`, href: `/omc/templates/${course.id}`, exceptId: user.id });
  }

  return NextResponse.json({ course: updated });
}
