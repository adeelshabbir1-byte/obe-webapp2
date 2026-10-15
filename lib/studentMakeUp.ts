import { prisma } from "./db";
import { getPassingCriteria } from "./passingCriteria";
import { strongPrereqIssues } from "./prereqCascade";

// A student's make-up picture: for each PLO and CLO they are behind on, can a course still ahead of them make it up
// (it maps CLOs to the same PLO), or is remediation needed now? Also the strong prerequisites that block their next
// courses, and the remediation they are enrolled in.

type Att = { code?: string; label?: string; pct: number; passed: boolean };
const parse = (s: string): Att[] => { try { const x = JSON.parse(s || "[]"); return Array.isArray(x) ? x : []; } catch { return []; } };
const ploNum = (label: string) => { const m = /^PLO-(\d+)$/.exec(label || ""); return m ? Number(m[1]) : null; };

export async function makeUpPlan(student: { id: string; batchId: string; currentSemesterNumber: number }) {
  const batch = await prisma.batch.findUnique({ where: { id: student.batchId }, select: { coordinatorId: true, coordinator: { select: { managedById: true } } } });
  const chairmanId = batch?.coordinator.managedById || "";
  const crit = await getPassingCriteria(chairmanId);
  const records = await prisma.studentTranscriptRecord.findMany({ where: { studentId: student.id }, orderBy: [{ termYear: "asc" }, { termName: "asc" }] });
  const taken = new Set(records.map((r) => r.courseCode.toUpperCase()));
  const passed = new Set(records.filter((r) => (r.gpaPoints ?? 0) > 0 || r.grade === "P").map((r) => r.courseCode.toUpperCase()));

  // Courses still ahead and the PLOs their CLOs serve.
  const ahead = await prisma.course.findMany({
    where: { batchId: student.batchId, semesterNumber: { gte: student.currentSemesterNumber } },
    select: { id: true, code: true, title: true, semesterNumber: true, clos: { where: { source: "SE", mappedPloId: { not: null } }, select: { mappedPlo: { select: { number: true } } } } },
    orderBy: [{ semesterNumber: "asc" }, { code: "asc" }],
  });
  const future = ahead.filter((c) => !taken.has(c.code.toUpperCase()));
  const makeUpFor = (n: number) => future.filter((c) => c.clos.some((x) => x.mappedPlo?.number === n)).map((c) => ({ code: c.code, title: c.title, semester: c.semesterNumber }));

  // PLOs: average over the courses that touched them.
  const sums = new Map<number, { t: number; n: number }>();
  for (const r of records) for (const e of parse(r.ploAttainmentJson)) { const n = ploNum(e.label || ""); if (n === null) continue; const s = sums.get(n) || { t: 0, n: 0 }; s.t += e.pct; s.n++; sums.set(n, s); }
  const plos = Array.from(sums.entries()).map(([n, s]) => ({ number: n, pct: Math.round((s.t / s.n) * 10) / 10 })).filter((p) => p.pct < crit.ploPct).sort((a, b) => a.number - b.number)
    .map((p) => { const by = makeUpFor(p.number); return { ...p, makeUp: by, verdict: by.length ? ("COMPENSABLE" as const) : ("REMEDIATE" as const) }; });

  // CLOs not attained, course by course (latest attempt), with the PLO each serves.
  const latest = new Map<string, (typeof records)[number]>();
  for (const r of records) latest.set(r.courseCode.toUpperCase(), r);
  const courseIds = (await prisma.course.findMany({ where: { batchId: student.batchId, code: { in: Array.from(latest.keys()), mode: "insensitive" } }, select: { id: true, code: true } }));
  const cloPlo = await prisma.cLO.findMany({ where: { courseId: { in: courseIds.map((c) => c.id).concat(["none"]) }, mappedPloId: { not: null } }, select: { courseId: true, code: true, mappedPlo: { select: { number: true } } } });
  const codeOfId = new Map(courseIds.map((c) => [c.id, c.code.toUpperCase()]));
  const clos: { course: string; title: string; clo: string; pct: number; plo: number | null; verdict: "COMPENSABLE" | "REMEDIATE"; makeUp: string[] }[] = [];
  for (const [code, r] of Array.from(latest.entries())) {
    for (const e of parse(r.cloAttainmentJson)) {
      if (e.passed || !e.code) continue;
      const plo = cloPlo.find((x) => codeOfId.get(x.courseId) === code && x.code === e.code)?.mappedPlo?.number ?? null;
      const by = plo ? makeUpFor(plo).map((c) => c.code) : [];
      clos.push({ course: r.courseCode, title: r.courseTitle, clo: e.code, pct: Math.round(e.pct * 10) / 10, plo, verdict: by.length ? "COMPENSABLE" : "REMEDIATE", makeUp: by });
    }
  }

  // Strong prerequisites blocking the next semester's courses.
  const next = future.filter((c) => (c.semesterNumber ?? 99) <= student.currentSemesterNumber + 1);
  const blocks: { code: string; title: string; reasons: string[] }[] = [];
  for (const c of next) {
    const reasons = await strongPrereqIssues({ studentId: student.id, batchId: student.batchId, chairmanId, courseId: c.id, passed, takenTogether: () => false, allowTogether: false }).catch(() => []);
    if (reasons.length) blocks.push({ code: c.code, title: c.title, reasons });
  }

  // Remediation the student is enrolled in.
  let remediation: { id: string; title: string; kind: string; courseCode: string; topics: string[]; schedule: string | null; startDate: Date | null; status: string; feeAmount: number; feeStatus: string; result: string; scorePct: number | null; host: string | null; lectures: number[] }[] = [];
  try {
    const enr = await prisma.remediationEnrollment.findMany({ where: { studentId: student.id, status: { not: "WITHDRAWN" } }, orderBy: { createdAt: "desc" } });
    const plans = await prisma.remediationPlan.findMany({ where: { id: { in: enr.map((e) => e.planId).concat(["none"]) }, status: { not: "CANCELLED" } } });
    const hosts = new Map((await prisma.course.findMany({ where: { id: { in: plans.map((p) => p.hostCourseId).filter((x): x is string => !!x).concat(["none"]) } }, select: { id: true, code: true, batch: { select: { degreeProgram: true, batchName: true } } } })).map((h) => [h.id, `${h.code} (${h.batch?.degreeProgram || ""} ${h.batch?.batchName || ""})`]));
    remediation = enr.map((e) => {
      const p = plans.find((x) => x.id === e.planId);
      return p ? { id: e.id, title: p.title, kind: p.kind, courseCode: p.courseCode, topics: p.topics, schedule: p.schedule, startDate: p.startDate, status: p.status, feeAmount: e.feeAmount, feeStatus: e.feeStatus, result: e.status, scorePct: e.scorePct, host: p.hostCourseId ? hosts.get(p.hostCourseId) || null : null, lectures: p.lectureNumbers } : null;
    }).filter((x): x is NonNullable<typeof x> => !!x);
  } catch { /* remediation tables not created yet */ }

  return { plos, clos, blocks, remediation, ploPct: crit.ploPct, cloPct: crit.cloPct };
}
