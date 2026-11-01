import { prisma } from "./db";
import { ploTranscript } from "./transcriptPlus";
import { chainFor, numberSetting } from "./scopedSettings";
import { footers, type Cell, type MRow, type Rule } from "./gaMatrixCore";

// Loads a student's GA matrix (Adeel prompt §20.7): taken courses with his % per GA (from the PLO transcript), courses in
// progress, and planned courses that map to each GA (their CLOs' GA mapping). The GA rule is the OMC's per program
// ("ga.rule": 0 = credit-weighted average, the default; 1 = count, with "ga.countN" courses), read for the student's
// Program Lead.
export const GA_RULE_KEY = "ga.rule", GA_COUNT_KEY = "ga.countN";

export async function gaMatrix(studentId: string) {
  const st = await prisma.student.findUnique({ where: { id: studentId }, select: { batchId: true, batch: { select: { coordinatorId: true, coordinator: { select: { id: true, role: true, managedById: true, departmentId: true } } } } } });
  if (!st) return null;
  const [lines, recs, plan, enrolled, plos] = await Promise.all([
    ploTranscript(studentId),
    prisma.studentTranscriptRecord.findMany({ where: { studentId }, select: { courseCode: true, courseTitle: true, creditHours: true, grade: true, termName: true, termYear: true } }),
    prisma.degreePlanEntry.findMany({ where: { studentId }, select: { plannedSemesterNumber: true, course: { select: { id: true, code: true, title: true, creditHours: true, clos: { where: { source: "SE", mappedPloId: { not: null } }, select: { mappedPloId: true } } } } } }),
    prisma.studentEnrollment.findMany({ where: { studentId, status: "ACTIVE", course: { isOffered: true } }, select: { course: { select: { id: true, code: true, title: true, creditHours: true, semesterNumber: true, clos: { where: { source: "SE", mappedPloId: { not: null } }, select: { mappedPloId: true } } } } } }),
    prisma.pLO.findMany({ where: { batchId: st.batchId }, select: { id: true, number: true, title: true }, orderBy: { number: "asc" } }),
  ]);
  const numOf = new Map(plos.map((p) => [p.id, p.number]));
  const gas = plos.map((p) => p.number);
  const rows = new Map<string, MRow>();
  const key = (c: string) => c.trim().toUpperCase();
  for (const r of recs) {
    const failed = /^(F|FA|ABS)$/i.test(r.grade.trim());
    rows.set(key(r.courseCode), { code: r.courseCode, title: r.courseTitle, semester: null, status: failed ? "FAILED" : "PASSED", ch: r.creditHours || 1, cells: {} });
  }
  for (const l of lines) for (const c of l.courses) { const row = rows.get(key(c.code)); if (row) row.cells[l.number] = { pct: c.pct }; }
  for (const e of enrolled) {
    if (rows.has(key(e.course.code))) continue;
    const cells: Record<number, Cell> = {};
    for (const c of e.course.clos) { const n = numOf.get(String(c.mappedPloId)); if (n) cells[n] = "progress"; }
    rows.set(key(e.course.code), { code: e.course.code, title: e.course.title, semester: e.course.semesterNumber, status: "IN_PROGRESS", ch: e.course.creditHours, cells });
  }
  for (const p of plan) {
    const k = key(p.course.code);
    const existing = rows.get(k);
    if (existing && existing.status !== "FAILED") { if (existing.semester == null) existing.semester = p.plannedSemesterNumber; continue; }
    const cells: Record<number, Cell> = {};
    for (const c of p.course.clos) { const n = numOf.get(String(c.mappedPloId)); if (n) cells[n] = "planned"; }
    if (existing) { existing.semester = p.plannedSemesterNumber; for (const [n, v] of Object.entries(cells)) if (!existing.cells[Number(n)]) existing.cells[Number(n)] = v; continue; } // a failed course still to retake
    rows.set(k, { code: p.course.code, title: p.course.title, semester: p.plannedSemesterNumber, status: "PLANNED", ch: p.course.creditHours, cells });
  }
  const list = Array.from(rows.values()).sort((a, b) => (a.semester ?? 0) - (b.semester ?? 0) || a.code.localeCompare(b.code));
  const chain = st.batch?.coordinator ? await chainFor(st.batch.coordinator as never) : null;
  const ruleN = chain ? await numberSetting(chain, GA_RULE_KEY, 0) : 0;
  const countN = chain ? await numberSetting(chain, GA_COUNT_KEY, 3) : 3;
  const rule: Rule = ruleN === 1 ? { kind: "count", n: countN } : { kind: "avg" };
  return { gas: plos.map((p) => ({ n: p.number, title: p.title })), rows: list, footers: footers(list, gas, rule), rule, lines };
}
