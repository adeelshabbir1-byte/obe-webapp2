import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../lib/session";
import { prisma } from "../../../lib/db";
import { writeAuditLog } from "../../../lib/audit";
import { notifyUsers } from "../../../lib/notifications";
import { canManagePlan, cloCodesForTopics, hostLectures, money, recordMicroAssessment, remediationScope, REMEDIATION_KINDS } from "../../../lib/remediation";

const str = (v: unknown, max = 300) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const num = (v: unknown, d = 0) => { const n = Number(v); return Number.isFinite(n) ? n : d; };
const bad = (error: string, status = 400) => NextResponse.json({ error }, { status });
const ids = (v: unknown) => (Array.isArray(v) ? Array.from(new Set(v.map((x) => String(x)).filter(Boolean))).slice(0, 500) : []);

export async function POST(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user) return bad("not logged in", 401);
  const scope = await remediationScope(user);
  const b = await req.json().catch(() => ({}));
  const action = String(b.action || "");
  const inInstitute = async (studentIds: string[]) => prisma.student.findMany({ where: { id: { in: studentIds }, batch: { coordinator: { managedById: scope.chairmanId } } }, select: { id: true } });
  try {
    if (action === "createPlan") {
      if (!scope.canPlan) return bad("Only the OMC, the Program Lead or the department Chairman plans remediation.", 403);
      const course = await prisma.course.findFirst({ where: { id: str(b.courseId, 60), coordinator: { managedById: scope.chairmanId } }, select: { id: true, code: true, title: true, coordinatorId: true } });
      if (!course || (scope.programs && !scope.programs.includes(course.coordinatorId))) return bad("Choose a course of your programs.", 403);
      const topics = Array.isArray(b.topics) ? b.topics.map((t: unknown) => str(t, 200)).filter(Boolean).slice(0, 30) : [];
      if (!topics.length) return bad("Choose the topics to remediate.");
      const kind = b.kind === "JUNIOR_SITTING" ? "JUNIOR_SITTING" : "TUTORIAL";
      const instructorId = str(b.instructorId, 60) || null;
      if (instructorId && !(await prisma.user.findFirst({ where: { id: instructorId, isActive: true, OR: [{ managedById: scope.chairmanId }, { managedBy: { managedById: scope.chairmanId } }] }, select: { id: true } }))) return bad("Choose a teacher of your institute.");
      let hostCourseId: string | null = null, lectureNumbers: number[] = [];
      if (kind === "JUNIOR_SITTING") {
        const host = await prisma.course.findFirst({ where: { id: str(b.hostCourseId, 60), coordinator: { managedById: scope.chairmanId } }, select: { id: true, instructorId: true } });
        if (!host) return bad("Choose the junior offering whose lectures the students will attend.");
        hostCourseId = host.id;
        lectureNumbers = await hostLectures(host.id, topics);
        if (!lectureNumbers.length) return bad("That offering's lecture plan doesn't teach these topics. Choose another offering, or plan a tutorial.");
      }
      const fee = Math.max(0, num(b.feePerStudent)), share = Math.min(100, Math.max(0, num(b.instructorSharePct, 70)));
      // Students flagged for these topics of this course (by advisors, teachers or the OMC) join the plan automatically.
      const flagRows = ((await (prisma as unknown as Record<string, any>).remediationFlag.findMany({ where: { chairmanId: scope.chairmanId, courseCode: course.code, status: "OPEN" } }).catch(() => [])) as { id: string; studentId: string; topicsJson: string; flaggedById: string }[]).filter((f) => (JSON.parse(f.topicsJson) as string[]).some((t) => topics.includes(t)));
      const students = await inInstitute(Array.from(new Set([...ids(b.studentIds), ...flagRows.map((f) => f.studentId)])));
      const plan = await prisma.remediationPlan.create({
        data: {
          chairmanId: scope.chairmanId, coordinatorId: course.coordinatorId, courseCode: course.code, courseTitle: course.title, topics, cloCodes: await cloCodesForTopics(course.id, topics),
          kind, title: str(b.title, 160) || `${REMEDIATION_KINDS[kind]}: ${course.code} — ${topics.slice(0, 2).join(", ")}${topics.length > 2 ? "…" : ""}`,
          instructorId, hostCourseId, lectureNumbers, schedule: str(b.schedule, 2000) || null, startDate: /^\d{4}-\d{2}-\d{2}$/.test(str(b.startDate, 10)) ? new Date(str(b.startDate, 10) + "T00:00:00Z") : null,
          feePerStudent: fee, instructorSharePct: share, assessmentTitle: str(b.assessmentTitle, 160) || null, createdById: user.id,
        },
      });
      if (students.length) await prisma.remediationEnrollment.createMany({ data: students.map((s) => ({ planId: plan.id, studentId: s.id, sourceCourseId: course.id, feeAmount: fee })), skipDuplicates: true });
      if (flagRows.length) {
        await (prisma as unknown as Record<string, any>).remediationFlag.updateMany({ where: { id: { in: flagRows.map((f) => f.id) } }, data: { status: "PLANNED", planId: plan.id } });
        await notifyUsers(Array.from(new Set(flagRows.map((f) => f.flaggedById))), { kind: "REMEDIATION", title: `Remediation planned: ${course.code}`, body: `The students you flagged on ${topics.join(", ")} are in "${plan.title}".`, href: `/remediation/${plan.id}`, exceptId: user.id });
      }
      await notifyUsers([instructorId], { kind: "REMEDIATION", title: `You teach a remediation ${kind === "TUTORIAL" ? "tutorial" : "sitting"}: ${course.code}`, body: `${topics.join(", ")} — ${students.length} student(s). Give the micro-assessment afterwards and record the scores.`, href: `/remediation/${plan.id}`, exceptId: user.id });
      await writeAuditLog({ actorUserId: user.id, action: "REMEDIATION_PLANNED", entityType: "RemediationPlan", entityId: plan.id, metadata: { course: course.code, students: students.length } });
      return NextResponse.json({ plan, enrolled: students.length });
    }

    // Everything else acts on a plan (or an enrolment in one).
    const enr = b.enrollmentId ? await prisma.remediationEnrollment.findUnique({ where: { id: str(b.enrollmentId, 60) } }) : null;
    const plan = await prisma.remediationPlan.findUnique({ where: { id: enr?.planId || str(b.planId, 60) } });
    if (!plan || plan.chairmanId !== scope.chairmanId) return bad("not found", 404);
    const manages = canManagePlan(scope, plan);
    const teaches = plan.instructorId === user.id;
    const audit = (m: Record<string, string | number | boolean> = {}) => writeAuditLog({ actorUserId: user.id, action: `REMEDIATION_${action.toUpperCase()}`, entityType: "RemediationPlan", entityId: plan.id, metadata: m });

    switch (action) {
      case "addStudents": {
        if (!manages) return bad("forbidden", 403);
        const rolls = typeof b.rollNumbers === "string" ? b.rollNumbers.split(/[\s,;]+/).map((x: string) => x.trim()).filter(Boolean).slice(0, 200) : [];
        const byRoll = rolls.length ? (await prisma.student.findMany({ where: { rollNumber: { in: rolls }, batch: { coordinator: { managedById: scope.chairmanId } } }, select: { id: true } })).map((s) => s.id) : [];
        const students = await inInstitute([...ids(b.studentIds), ...byRoll]);
        if (!students.length) return bad(rolls.length ? "No student of your institute has those roll numbers." : "Choose the students.");
        const source = await prisma.course.findFirst({ where: { coordinatorId: plan.coordinatorId, code: plan.courseCode }, orderBy: { createdAt: "desc" }, select: { id: true } });
        await prisma.remediationEnrollment.createMany({ data: students.map((s) => ({ planId: plan.id, studentId: s.id, sourceCourseId: source?.id || null, feeAmount: plan.feePerStudent })), skipDuplicates: true });
        await audit({ added: students.length });
        return NextResponse.json({ added: students.length });
      }
      case "withdraw": {
        if (!manages || !enr) return bad("forbidden", 403);
        if (enr.scorePct !== null) return bad("This student has already been assessed.");
        await prisma.remediationEnrollment.update({ where: { id: enr.id }, data: { status: "WITHDRAWN" } });
        return NextResponse.json({ ok: true });
      }
      case "status": {
        if (!manages) return bad("forbidden", 403);
        const status = ["PLANNED", "RUNNING", "COMPLETED", "CANCELLED"].includes(b.status) ? b.status : null;
        if (!status) return bad("unknown status");
        await prisma.remediationPlan.update({ where: { id: plan.id }, data: { status } });
        await audit({ status });
        return NextResponse.json({ ok: true });
      }
      case "fee": {
        if (!enr) return bad("not found", 404);
        const status = ["PAID", "WAIVED", "UNPAID"].includes(b.feeStatus) ? b.feeStatus : null;
        if (!status) return bad("unknown fee status");
        // The finance office records payments; a waiver may also come from whoever planned the remediation.
        if (!(scope.canCollect || (status === "WAIVED" && manages))) return bad("Fees are recorded by the Finance Officer.", 403);
        const receipt = str(b.receiptNo, 60) || str(b.note, 60);
        if (status === "PAID" && !receipt) return bad("Enter the receipt number.");
        await prisma.remediationEnrollment.update({ where: { id: enr.id }, data: { feeStatus: status, receiptNo: status === "PAID" ? receipt : null, paidAt: status === "PAID" ? new Date() : null, feeById: user.id } });
        await audit({ feeStatus: status });
        return NextResponse.json({ ok: true });
      }
      case "score": {
        if (!enr) return bad("not found", 404);
        if (!teaches && !manages) return bad("Only the remediation teacher records the micro-assessment.", 403);
        if (enr.status === "WITHDRAWN") return bad("This student was withdrawn.");
        const r = await recordMicroAssessment(enr.id, num(b.scorePct, NaN), user.id);
        if ("error" in r) return bad(r.error as string);
        await audit({ cleared: r.cleared, transcriptUpdated: r.transcriptUpdated });
        return NextResponse.json(r);
      }
      case "payout": {
        if (!scope.canCollect) return bad("Payouts are recorded by the Finance Officer.", 403);
        const all = await prisma.remediationEnrollment.findMany({ where: { planId: plan.id } });
        const m = money(plan, all);
        const amount = Math.max(0, num(b.amount, m.owed));
        if (amount <= 0) return bad("Nothing is owed to the teacher yet.");
        await prisma.remediationPlan.update({ where: { id: plan.id }, data: { payoutAmount: (plan.payoutAmount || 0) + amount, payoutAt: new Date(), payoutById: user.id } });
        await notifyUsers([plan.instructorId], { kind: "REMEDIATION", title: `Remediation payment recorded: PKR ${Math.round(amount).toLocaleString("en-US")}`, body: plan.title, href: `/remediation/${plan.id}`, exceptId: user.id });
        await audit({ amount });
        return NextResponse.json({ ok: true });
      }
      default:
        return bad("unknown action");
    }
  } catch (e) {
    const msg = String((e as Error)?.message || "");
    if (msg.includes("does not exist")) return bad("Remediation is not set up in the database yet — run prisma/migration_master_spec.sql in Supabase.", 500);
    console.error("remediation", action, msg);
    return bad("Could not save.", 500);
  }
}
