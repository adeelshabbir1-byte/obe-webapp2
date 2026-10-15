import { prisma } from "./db";
import { chairmanIdFor } from "./reportScope";
import { omcCourseScope } from "./omcScope";
import { getPassingCriteria } from "./passingCriteria";
import { isExamTopic, norm } from "./teachingAnalysis";
import { rowsForTopic } from "./topicLinks";
import { keyOf } from "./courseKeys";

// Remediation: students who did not attain topics (and so CLOs / PLOs) of a course get a targeted fix instead of a
// full retake. The OMC (or the Program Lead / department Chairman) plans either a dedicated tutorial or a "junior
// class sitting" (attending the lectures that teach the topics in a junior offering of the course), names the teacher
// and the fee, and enrols the students. After it, the teacher gives a micro-assessment (a short quiz or assignment);
// a student who passes it clears the topics: their CLO and PLO attainment for the course is raised on the transcript
// (the grade is not changed) and any STRONG prerequisite those topics held up is released. Students pay a small fee;
// the teacher is paid a share of the fees collected.

type Who = { id: string; role: string; managedById: string | null; departmentId?: string | null };

export const REMEDIATION_KINDS: Record<string, string> = { TUTORIAL: "Remediation tutorial", JUNIOR_SITTING: "Junior class sitting" };
export const PLAN_STATUS: Record<string, string> = { PLANNED: "Planned", RUNNING: "Running", COMPLETED: "Completed", CANCELLED: "Cancelled" };

/** What this person may see and do in remediation. */
export async function remediationScope(user: Who) {
  const chairmanId = user.role === "CHAIRMAN" ? user.id : await chairmanIdFor(user);
  let programs: string[] | null = null; // null = every program of the institute
  if (user.role === "PROGRAM_COORDINATOR") programs = [user.id];
  else if (user.role === "HEAD_OF_DEPARTMENT") programs = (await prisma.user.findMany({ where: { role: "PROGRAM_COORDINATOR", managedById: chairmanId, departmentId: user.departmentId || "none" }, select: { id: true } })).map((u) => u.id);
  else if (user.role === "OMC" && user.departmentId) programs = Array.from(new Set((await prisma.course.findMany({ where: { coordinator: { managedById: chairmanId }, ...omcCourseScope(user) }, select: { coordinatorId: true } })).map((c) => c.coordinatorId)));
  const canPlan = ["OMC", "PROGRAM_COORDINATOR", "HEAD_OF_DEPARTMENT", "CHAIRMAN"].includes(user.role);
  const canCollect = ["FINANCE_OFFICER", "CHAIRMAN"].includes(user.role);
  return { chairmanId, programs, canPlan, canCollect, seesAll: canPlan || canCollect };
}
export type RemediationScope = Awaited<ReturnType<typeof remediationScope>>;

/** Plans this person can see: in their programs (planners), all (finance), or the ones they teach. */
export async function plansFor(user: Who, scope: RemediationScope) {
  const where = scope.seesAll
    ? { chairmanId: scope.chairmanId, ...(scope.programs && !scope.canCollect ? { coordinatorId: { in: scope.programs.concat(["none"]) } } : {}) }
    : { chairmanId: scope.chairmanId, instructorId: user.id };
  return prisma.remediationPlan.findMany({ where, orderBy: [{ status: "asc" }, { createdAt: "desc" }] });
}
export const canManagePlan = (scope: RemediationScope, plan: { chairmanId: string; coordinatorId: string }) =>
  scope.canPlan && plan.chairmanId === scope.chairmanId && (!scope.programs || scope.programs.includes(plan.coordinatorId));

// ---------------------------------------------------------------------------
// Finding the students

export type TopicColumn = { topic: string; lectures: number[]; items: string[]; strong: boolean; below: number; assessed: number };
export type StudentRow = { id: string; name: string; rollNumber: string; pcts: (number | null)[] };

/** Every student's score on every taught topic of a course offering (marks on the items linked to the topic's lectures). */
export async function topicScoresByStudent(courseId: string, chairmanId: string): Promise<{ topics: TopicColumn[]; students: StudentRow[]; passPct: number }> {
  const passPct = (await getPassingCriteria(chairmanId)).cloPct;
  const rows = await prisma.lectureRow.findMany({
    where: { courseId, source: "INSTRUCTOR", topic: { not: "" } },
    select: { topic: true, lectureNumber: true, instrumentLinks: { select: { instrumentId: true, instrument: { select: { type: true, label: true, maxScore: true } } } } },
    orderBy: { lectureNumber: "asc" },
  });
  const groups: { topic: string; lectures: number[]; items: Map<string, { label: string; max: number }> }[] = [];
  for (const r of rows) {
    if (isExamTopic(r.topic)) continue;
    let g = groups.find((x) => norm(x.topic) === norm(r.topic));
    if (!g) { g = { topic: r.topic, lectures: [], items: new Map() }; groups.push(g); }
    g.lectures.push(r.lectureNumber);
    for (const k of r.instrumentLinks) g.items.set(k.instrumentId, { label: k.instrument.type === "Midterm" || k.instrument.type === "Final" ? `${k.instrument.type} Q${k.instrument.label}` : k.instrument.label, max: k.instrument.maxScore });
  }
  const assessed = groups.filter((g) => g.items.size > 0);
  const [enrolled, marks] = await Promise.all([
    prisma.studentEnrollment.findMany({ where: { courseId, status: { not: "WITHDRAWN" } }, select: { student: { select: { id: true, name: true, rollNumber: true } } }, orderBy: { student: { rollNumber: "asc" } } }),
    prisma.studentMark.findMany({ where: { courseId }, select: { studentId: true, instrumentId: true, score: true } }),
  ]);
  const markOf = new Map(marks.map((m) => [`${m.studentId}|${m.instrumentId}`, m.score]));
  // STRONG prerequisite topics of this course (they hold up registration for a later course).
  const key = await keyOf(courseId);
  const seRows = await prisma.lectureRow.findMany({ where: { courseId, source: "SE" }, select: { topic: true, lectureNumber: true } });
  const strongTopics = key ? (await prisma.topicPrerequisite.findMany({ where: { coordinatorId: key.coordinatorId, prereqCourseCode: key.code, strength: "STRONG", orphanedAt: null }, select: { prereqTopic: true } }).catch(() => [])).map((l) => l.prereqTopic) : [];
  const students: StudentRow[] = enrolled.map(({ student: s }) => ({
    id: s.id, name: s.name, rollNumber: s.rollNumber,
    pcts: assessed.map((g) => {
      let got = 0, max = 0;
      for (const [iid, it] of Array.from(g.items.entries())) { const sc = markOf.get(`${s.id}|${iid}`); if (sc !== undefined) { got += sc; max += it.max; } }
      return max > 0 ? Math.round((1000 * got) / max) / 10 : null;
    }),
  }));
  const topics: TopicColumn[] = assessed.map((g, i) => ({
    topic: g.topic, lectures: g.lectures, items: Array.from(g.items.values()).map((x) => x.label),
    // Matched by wording, or by lecture when the teacher's copy still uses older wording than the Subject Expert's plan.
    strong: strongTopics.some((t) => rowsForTopic([{ topic: g.topic }], t).length > 0 || rowsForTopic(seRows, t).some((r) => g.lectures.includes(r.lectureNumber))),
    below: students.filter((s) => s.pcts[i] !== null && s.pcts[i]! < passPct).length,
    assessed: students.filter((s) => s.pcts[i] !== null).length,
  }));
  return { topics, students, passPct };
}

/** CLO codes the topics are taught under (from the lecture plan rows' CLOs). */
export async function cloCodesForTopics(courseId: string, topics: string[]) {
  const rows = await prisma.lectureRow.findMany({ where: { courseId, source: { in: ["INSTRUCTOR", "SE"] } }, select: { topic: true, source: true, clo: { select: { code: true } } } });
  const codes = new Set<string>();
  for (const t of topics) for (const r of rowsForTopic(rows, t)) if (r.clo?.code) codes.add(r.clo.code);
  return Array.from(codes).sort();
}

/** Lectures of a (junior) offering that teach the topics — where a student sits in. */
export async function hostLectures(hostCourseId: string, topics: string[]) {
  const rows = await prisma.lectureRow.findMany({ where: { courseId: hostCourseId, source: "INSTRUCTOR" }, select: { topic: true, lectureNumber: true } });
  const use = rows.length ? rows : await prisma.lectureRow.findMany({ where: { courseId: hostCourseId, source: "SE" }, select: { topic: true, lectureNumber: true } });
  return Array.from(new Set(topics.flatMap((t) => rowsForTopic(use, t).map((r) => r.lectureNumber)))).sort((a, b) => a - b);
}

// ---------------------------------------------------------------------------
// The micro-assessment

type Att = { code?: string; label?: string; pct: number; passed: boolean };
const parse = (s: string | null | undefined): Att[] => { try { const x = JSON.parse(s || "[]"); return Array.isArray(x) ? x : []; } catch { return []; } };

/**
 * Records a student's micro-assessment. Passing clears the plan's topics: the CLOs they are taught under are raised to
 * the score on the student's transcript record of the course (never lowered), and each PLO those CLOs feed is raised
 * to the average of its CLOs. The previous figures are kept on the enrolment.
 */
export async function recordMicroAssessment(enrollmentId: string, scorePct: number, actorId: string) {
  const enr = await prisma.remediationEnrollment.findUnique({ where: { id: enrollmentId } });
  if (!enr) return { error: "enrolment not found" };
  const plan = await prisma.remediationPlan.findUnique({ where: { id: enr.planId } });
  if (!plan) return { error: "plan not found" };
  if (!Number.isFinite(scorePct) || scorePct < 0 || scorePct > 100) return { error: "The score must be between 0 and 100%." };
  if (enr.feeAmount > 0 && enr.feeStatus === "UNPAID") return { error: "The remediation fee is not paid yet (or waived), so the result can't be recorded." };
  const crit = await getPassingCriteria(plan.chairmanId);
  const cleared = scorePct >= crit.cloPct;
  let beforeJson: string | null = enr.beforeJson;
  let updated = false;
  if (cleared && plan.cloCodes.length) {
    const rec = await prisma.studentTranscriptRecord.findFirst({ where: { studentId: enr.studentId, courseCode: { equals: plan.courseCode, mode: "insensitive" } }, orderBy: [{ termYear: "desc" }, { snapshotAt: "desc" }] });
    if (rec) {
      const clos = parse(rec.cloAttainmentJson), plos = parse(rec.ploAttainmentJson);
      if (!beforeJson) beforeJson = JSON.stringify({ recordId: rec.id, clo: rec.cloAttainmentJson, plo: rec.ploAttainmentJson });
      for (const e of clos) if (e.code && plan.cloCodes.includes(e.code) && e.pct < scorePct) { e.pct = Math.round(scorePct * 10) / 10; e.passed = true; updated = true; }
      if (updated) {
        // CLO -> PLO for this course (the offering the student took, else any copy in the program).
        const courseIds = enr.sourceCourseId ? [enr.sourceCourseId] : (await prisma.course.findMany({ where: { coordinatorId: plan.coordinatorId, code: plan.courseCode }, select: { id: true } })).map((c) => c.id);
        const map = await prisma.cLO.findMany({ where: { courseId: { in: courseIds.concat(["none"]) }, mappedPloId: { not: null } }, select: { code: true, mappedPlo: { select: { number: true } } } });
        const ploOf = new Map(map.map((c) => [c.code, c.mappedPlo?.number]));
        const affected = new Set(plan.cloCodes.map((c) => ploOf.get(c)).filter((n): n is number => !!n));
        for (const n of Array.from(affected)) {
          const mine = clos.filter((c) => c.code && ploOf.get(c.code) === n);
          if (!mine.length) continue;
          const avg = Math.round((mine.reduce((a, c) => a + c.pct, 0) / mine.length) * 10) / 10;
          const label = `PLO-${n}`;
          const p = plos.find((x) => x.label === label);
          if (p && p.pct < avg) { p.pct = avg; p.passed = avg >= crit.ploPct; }
          else if (!p) plos.push({ label, pct: avg, passed: avg >= crit.ploPct });
        }
        await prisma.studentTranscriptRecord.update({ where: { id: rec.id }, data: { cloAttainmentJson: JSON.stringify(clos), ploAttainmentJson: JSON.stringify(plos) } });
      }
    }
  }
  const row = await prisma.remediationEnrollment.update({
    where: { id: enr.id },
    data: { scorePct: Math.round(scorePct * 10) / 10, status: cleared ? "CLEARED" : "NOT_CLEARED", assessedAt: new Date(), assessedById: actorId, beforeJson },
  });
  return { enrollment: row, cleared, transcriptUpdated: updated, passPct: crit.cloPct };
}

/** Fees and the teacher's share for a plan. */
export function money(plan: { feePerStudent: number; instructorSharePct: number; payoutAmount: number | null }, enrolments: { feeAmount: number; feeStatus: string; status: string }[]) {
  const live = enrolments.filter((e) => e.status !== "WITHDRAWN");
  const collected = live.filter((e) => e.feeStatus === "PAID").reduce((n, e) => n + e.feeAmount, 0);
  const due = live.filter((e) => e.feeStatus === "UNPAID").reduce((n, e) => n + e.feeAmount, 0);
  const share = Math.round((collected * plan.instructorSharePct) / 100);
  return { collected, due, share, paidOut: plan.payoutAmount || 0, owed: Math.max(0, share - (plan.payoutAmount || 0)) };
}
