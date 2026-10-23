import { prisma } from "./db";
import { bestAttemptTotals } from "./cgpaMath";
import { attendancePolicy, tally, percentage } from "./attendance";
import { academicRules } from "./academicRules";

// One risk level per student, from what the system already holds — so an advisor hears about a student in week 5,
// not at results time:
//   CGPA below 2.00 (+3) or below 2.50 (+1); attendance below the minimum in a course (+3) or within 5% of it (+1);
//   marks so far under 50% of what has been assessed (+2) or 15 points under the class average (+1) in a course;
//   two or more assessments missed that classmates have marks for (+2).
// HIGH from 5 points, MEDIUM from 3.

export type Risk = { studentId: string; name: string; roll: string; batch: string; advisorId: string | null; level: "HIGH" | "MEDIUM" | "LOW"; points: number; reasons: string[] };

export async function earlyWarning(chairmanId: string, opts: { batchIds?: string[]; limit?: number } = {}): Promise<Risk[]> {
  const leads = (await prisma.user.findMany({ where: { role: "PROGRAM_COORDINATOR", managedById: chairmanId }, select: { id: true } })).map((u) => u.id).concat(["none"]);
  const batches = await prisma.batch.findMany({ where: { coordinatorId: { in: leads }, ...(opts.batchIds ? { id: { in: opts.batchIds.concat(["none"]) } } : {}) }, select: { id: true, degreeProgram: true, batchName: true, advisorId: true } });
  const students = await prisma.student.findMany({ where: { batchId: { in: batches.map((b) => b.id).concat(["none"]) }, status: "ACTIVE" }, select: { id: true, name: true, rollNumber: true, batchId: true }, take: opts.limit || 5000 });
  const sids = students.map((s) => s.id).concat(["none"]);
  const [records, enrolments, pol] = await Promise.all([
    prisma.studentTranscriptRecord.findMany({ where: { studentId: { in: sids } }, select: { studentId: true, courseCode: true, creditHours: true, gpaPoints: true, grade: true } }),
    prisma.studentEnrollment.findMany({ where: { studentId: { in: sids }, status: { not: "WITHDRAWN" }, course: { isOffered: true } }, select: { studentId: true, courseId: true, course: { select: { code: true } } } }),
    attendancePolicy(chairmanId),
  ]);
  const ar = await academicRules(chairmanId);
  const courseIds = Array.from(new Set(enrolments.map((e) => e.courseId))).concat(["none"]);
  const [att, items, marks] = await Promise.all([
    prisma.attendanceRecord.findMany({ where: { courseId: { in: courseIds }, studentId: { in: sids } }, select: { studentId: true, courseId: true, status: true } }),
    prisma.assessmentInstrument.findMany({ where: { courseId: { in: courseIds }, source: "INSTRUCTOR", marksPct: { gt: 0 } }, select: { id: true, courseId: true, maxScore: true, marksPct: true } }),
    prisma.studentMark.findMany({ where: { courseId: { in: courseIds } }, select: { studentId: true, courseId: true, instrumentId: true, score: true } }),
  ]);
  const item = new Map(items.map((i) => [i.id, i]));
  const bySC = new Map<string, { instrumentId: string; score: number }[]>();
  for (const m of marks) { const k = `${m.studentId}|${m.courseId}`; const a = bySC.get(k) || []; a.push(m); bySC.set(k, a); }
  const attBy = new Map<string, string[]>();
  for (const a of att) { const k = `${a.studentId}|${a.courseId}`; const x = attBy.get(k) || []; x.push(a.status); attBy.set(k, x); }
  const recBy = new Map<string, typeof records>();
  for (const r of records) { const x = recBy.get(r.studentId) || []; x.push(r); recBy.set(r.studentId, x); }
  const markedItems = new Map<string, Set<string>>(); // course -> instruments anyone has a mark for
  for (const m of marks) if (item.has(m.instrumentId)) { if (!markedItems.has(m.courseId)) markedItems.set(m.courseId, new Set()); markedItems.get(m.courseId)!.add(m.instrumentId); }
  const pctOf = (sid: string, cid: string) => {
    const ids = Array.from(markedItems.get(cid) || []);
    const w = ids.reduce((a, id) => a + (item.get(id)?.marksPct || 0), 0);
    if (!w) return null;
    const got = (bySC.get(`${sid}|${cid}`) || []).filter((m) => item.has(m.instrumentId)).reduce((a, m) => { const it = item.get(m.instrumentId)!; return a + (m.score / it.maxScore) * it.marksPct; }, 0);
    return (100 * got) / w;
  };
  const classAvg = new Map<string, number>();
  for (const cid of courseIds) {
    const xs = enrolments.filter((e) => e.courseId === cid).map((e) => pctOf(e.studentId, cid)).filter((x): x is number => x !== null);
    if (xs.length) classAvg.set(cid, xs.reduce((a, b) => a + b, 0) / xs.length);
  }
  const bName = new Map(batches.map((b) => [b.id, b]));
  // Risk of dropping out: the Controller of Examinations' dismissal rule already met (CGPA below the dismissal limit
  // after the set number of probation semesters).
  const dropRisk = new Set((await import("./studentStatus").then((m) => m.dismissalSuggestions(chairmanId, opts.batchIds)).catch(() => [])).map((d) => d.studentId));
  const out: Risk[] = [];
  for (const s of students) {
    const reasons: string[] = [];
    let pts = 0;
    const { points, credits } = bestAttemptTotals((recBy.get(s.id) || []) as never);
    const cgpa = credits ? points / credits : null;
    if (dropRisk.has(s.id)) { pts += 3; reasons.push("Risk of dropping out: meets the dismissal rule"); }
    if (cgpa !== null && cgpa < ar.probationCgpa) { pts += 3; reasons.push(`CGPA ${cgpa.toFixed(2)}`); } else if (cgpa !== null && cgpa < ar.warningCgpa) { pts += 1; reasons.push(`CGPA ${cgpa.toFixed(2)}`); }
    for (const e of enrolments.filter((x) => x.studentId === s.id)) {
      const t = tally(attBy.get(`${s.id}|${e.courseId}`) || []);
      const ap = t.marked ? percentage(t, pol) : null;
      if (ap !== null && ap < pol.minPct) { pts += 3; reasons.push(`${e.course.code} attendance ${Math.round(ap)}%`); }
      else if (ap !== null && ap < pol.minPct + 5) { pts += 1; reasons.push(`${e.course.code} attendance ${Math.round(ap)}% (near the limit)`); }
      const p = pctOf(s.id, e.courseId), avg = classAvg.get(e.courseId);
      if (p !== null && p < 50) { pts += 2; reasons.push(`${e.course.code} marks ${Math.round(p)}% so far`); }
      else if (p !== null && avg !== undefined && p < avg - 15) { pts += 1; reasons.push(`${e.course.code} ${Math.round(avg - p)} points under the class`); }
      const mine = new Set((bySC.get(`${s.id}|${e.courseId}`) || []).map((m) => m.instrumentId));
      const missed = Array.from(markedItems.get(e.courseId) || []).filter((id) => !mine.has(id)).length;
      if (missed >= 2) { pts += 2; reasons.push(`${e.course.code}: ${missed} assessments missed`); }
    }
    const b = bName.get(s.batchId);
    out.push({ studentId: s.id, name: s.name, roll: s.rollNumber, batch: b ? `${b.degreeProgram} — ${b.batchName}` : "", advisorId: b?.advisorId || null, level: pts >= 5 ? "HIGH" : pts >= 3 ? "MEDIUM" : "LOW", points: pts, reasons });
  }
  return out.sort((a, b) => b.points - a.points);
}
