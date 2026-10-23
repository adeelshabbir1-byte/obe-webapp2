import { randomUUID } from "crypto";
import { prisma } from "./db";
import { computeCgpa, standingFromCgpa } from "./academicStanding";
import { sufficiency } from "./facultySufficiency";
import { feedbackTerms, termFeedback } from "./feedbackAnalysis";
import { settingsOf, settingFor } from "./approvals/inbox";

// Head of institute dashboard. A nightly job works out every figure per program and per department and keeps it in
// DashboardSnapshot; the page adds the rows up for the viewer's area and filters, so it opens fast. Each figure has a
// "now" and a "before" (last term or last year) value, and the Institute Head sets a target for the traffic lights.

const ddb = prisma as unknown as Record<string, any>;
export const DASH_HINT = "Run prisma/migration_head_dashboard.sql in Supabase first.";

type Pair = { pass: number; total: number };
type Fb = { sum: number; adjSum: number; n: number };
export type ProgramRow = {
  program: string; departmentId: string | null; facultyId: string | null;
  enrolled: number; intake: Record<string, number>;
  results: { cur: { students: number; pass: number; dist: Record<string, number> }; prev: { students: number; pass: number } };
  clo: { cur: Pair; prev: Pair }; plo: { cur: Pair; prev: Pair };
  readiness: number | null; body: string | null; nextVisit: string | null;
  moved: { cur: Record<string, number>; prev: Record<string, number> };
  warning: number; probation: number; holds: number; shortages: number; cqiOpen: number;
  feedback: { cur: Fb; prev: Fb };
  alumni: { total: number; employed: number };
  fte: number; suffStudents: number;
};
export type DeptRow = { departmentId: string; name: string; facultyId: string | null; teachers: number; phd: number; fdpHours: { cur: number; prev: number }; pubs: { cur: number; prev: number }; approvals: { open: number; overdue: number } };
export type Snapshot = {
  computedAt: string; terms: { results: [string | null, string | null]; attainment: [string | null, string | null]; feedback: [string | null, string | null] }; year: number;
  programs: ProgramRow[]; departments: DeptRow[];
  institute: { fiscalYear: string; budget: number; spent: number; fdpTarget: number; approvals: { open: number; overdue: number }; studentsPerFteLimit: number };
};

const TERM_ORDER: Record<string, number> = { Spring: 1, Summer: 2, Fall: 3 };
const tIdx = (name: string | null | undefined, year: number | null | undefined) => (year || 0) * 10 + (TERM_ORDER[name || ""] || 0);
const tKey = (name: string | null | undefined, year: number | null | undefined) => (name && year ? `${name} ${year}` : null);
const parse = <T,>(s: string | null | undefined, d: T): T => { try { return s ? (JSON.parse(s) as T) : d; } catch { return d; } };
const fiscalYear = (d = new Date()) => { const y = d.getUTCFullYear(), m = d.getUTCMonth() + 1; return m >= 7 ? `${y}-${String(y + 1).slice(2)}` : `${y - 1}-${String(y).slice(2)}`; };
const MOVED = ["DROPPED", "LEFT", "TRANSFER_OUT", "FREEZE", "TRANSFER_INTERNAL", "RUSTICATED"];

/** Work out every figure for one institute. Each part is guarded, so a missing table only blanks its own figure. */
export async function computeDashboard(chairmanId: string): Promise<Snapshot> {
  const now = new Date(), year = now.getUTCFullYear();
  const yearStart = new Date(Date.UTC(year, 0, 1)), lastYearStart = new Date(Date.UTC(year - 1, 0, 1));
  const g = async <T,>(f: () => Promise<T>, d: T): Promise<T> => { try { return await f(); } catch { return d; } };

  const batches = await prisma.batch.findMany({ where: { coordinator: { managedById: chairmanId } }, select: { id: true, degreeProgram: true, startYear: true, coordinatorId: true, coordinator: { select: { departmentId: true, department_: { select: { facultyId: true } } } } } });
  const progOfBatch = new Map(batches.map((b) => [b.id, b.degreeProgram]));
  const progOfLead = new Map<string, string>(); for (const b of batches) if (b.coordinatorId && !progOfLead.has(b.coordinatorId)) progOfLead.set(b.coordinatorId, b.degreeProgram);
  const names = Array.from(new Set(batches.map((b) => b.degreeProgram))).sort();
  const blank = (p: string): ProgramRow => { const b = batches.find((x) => x.degreeProgram === p); return { program: p, departmentId: b?.coordinator?.departmentId || null, facultyId: b?.coordinator?.department_?.facultyId || null, enrolled: 0, intake: {}, results: { cur: { students: 0, pass: 0, dist: {} }, prev: { students: 0, pass: 0 } }, clo: { cur: { pass: 0, total: 0 }, prev: { pass: 0, total: 0 } }, plo: { cur: { pass: 0, total: 0 }, prev: { pass: 0, total: 0 } }, readiness: null, body: null, nextVisit: null, moved: { cur: {}, prev: {} }, warning: 0, probation: 0, holds: 0, shortages: 0, cqiOpen: 0, feedback: { cur: { sum: 0, adjSum: 0, n: 0 }, prev: { sum: 0, adjSum: 0, n: 0 } }, alumni: { total: 0, employed: 0 }, fte: 0, suffStudents: 0 }; };
  const P = new Map(names.map((p) => [p, blank(p)]));
  const batchIds = batches.map((b) => b.id).concat(["none"]);

  // Students: enrolment, intake by year, academic standing.
  const students = await prisma.student.findMany({ where: { batchId: { in: batchIds } }, select: { id: true, batchId: true, status: true } });
  for (const s of students) {
    const r = P.get(progOfBatch.get(s.batchId) || ""); if (!r) continue;
    const b = batches.find((x) => x.id === s.batchId);
    if (b) r.intake[String(b.startYear)] = (r.intake[String(b.startYear)] || 0) + 1;
    if (s.status === "ACTIVE" || s.status === "PROBATION") r.enrolled++;
  }
  for (const s of students.filter((x) => x.status === "ACTIVE" || x.status === "PROBATION").slice(0, 6000)) {
    const st = standingFromCgpa(await computeCgpa(s.id).catch(() => null));
    const r = P.get(progOfBatch.get(s.batchId) || ""); if (!r) continue;
    if (st === "WARNING") r.warning++; else if (st === "PROBATION") r.probation++;
  }

  // Results: pass rate and grade spread for the latest term with submitted / approved results, and the term before.
  const courses = await prisma.course.findMany({ where: { batchId: { in: batchIds } }, select: { id: true, batchId: true, coordinator: { select: { departmentId: true } } } });
  const progOfCourse = new Map(courses.map((c) => [c.id, progOfBatch.get(c.batchId || "") || ""]));
  const deptOfCourse = new Map(courses.map((c) => [c.id, c.coordinator?.departmentId || null]));
  // Results and CLO / PLO attainment from the transcript records (one per student per course, written when results are
  // finalised): pass rate and grade spread for the latest term and the one before.
  const recs = await g(() => prisma.studentTranscriptRecord.findMany({ where: { studentId: { in: students.map((x) => x.id).concat(["none"]) }, termName: { in: ["Spring", "Summer", "Fall"] } }, select: { studentId: true, termName: true, termYear: true, grade: true, cloAttainmentJson: true, ploAttainmentJson: true } }), []);
  const rTerms = Array.from(new Set(recs.map((r) => tIdx(r.termName, r.termYear)))).sort((a, b) => b - a);
  const termName = (i: number | undefined) => { const r = recs.find((x) => tIdx(x.termName, x.termYear) === i); return r ? tKey(r.termName, r.termYear) : null; };
  const batchOfStudentEarly = new Map(students.map((x) => [x.id, x.batchId]));
  for (const r of recs) {
    const p = P.get(progOfBatch.get(batchOfStudentEarly.get(r.studentId) || "") || ""); if (!p) continue;
    const i = tIdx(r.termName, r.termYear), slot = i === rTerms[0] ? "cur" : i === rTerms[1] ? "prev" : null; if (!slot) continue;
    const grade = (r.grade || "").trim().toUpperCase(); if (!grade || ["W", "I", "IP"].includes(grade)) continue;
    const passed = grade !== "F";
    if (slot === "cur") { p.results.cur.students++; if (passed) p.results.cur.pass++; p.results.cur.dist[grade] = (p.results.cur.dist[grade] || 0) + 1; }
    else { p.results.prev.students++; if (passed) p.results.prev.pass++; }
    for (const c of parse<{ passed?: boolean }[]>(r.cloAttainmentJson, [])) { p.clo[slot].total++; if (c.passed) p.clo[slot].pass++; }
    for (const c of parse<{ passed?: boolean }[]>(r.ploAttainmentJson, [])) { p.plo[slot].total++; if (c.passed) p.plo[slot].pass++; }
  }
  const aName = termName, aTerms = rTerms;
  const leadIds = Array.from(progOfLead.keys()).concat(["none"]);

  // Accreditation readiness (the latest readiness check of each program, worked out again when older than a week) and the next visit.
  const leads = await prisma.user.findMany({ where: { id: { in: leadIds } }, select: { id: true, managedById: true, departmentId: true, leadProgram: true } });
  const readiness = await g(() => prisma.readinessSnapshot.findMany({ where: { chairmanId }, orderBy: { createdAt: "desc" }, select: { leadId: true, overall: true, createdAt: true } }), []);
  // Loaded here: readiness and the council standards import each other, so they must load in their own order.
  const { standardsFor } = await import("./accreditation/bodies");
  const { computeReadiness } = await import("./readiness");
  const nceac = await g(() => standardsFor(chairmanId, "NCEAC"), null as Awaited<ReturnType<typeof standardsFor>> | null);
  for (const l of leads) {
    const p = P.get(l.leadProgram || progOfLead.get(l.id) || ""); if (!p || p.readiness !== null) continue;
    const s = readiness.find((x) => x.leadId === l.id);
    if (s && s.overall !== null && now.getTime() - new Date(s.createdAt).getTime() < 7 * 864e5) { p.readiness = s.overall; continue; }
    const fresh = nceac ? await g(async () => (await computeReadiness({ id: l.id, managedById: chairmanId, departmentId: l.departmentId }, "", nceac)).overall, null as number | null) : null;
    p.readiness = fresh ?? s?.overall ?? null;
  }
  const cycles = await g(() => ddb.accreditationCycle.findMany({ where: { chairmanId, status: "OPEN" }, select: { program: true, body: true, visitDate: true } }) as Promise<{ program: string; body: string; visitDate: Date | null }[]>, []);
  for (const c of cycles) { const p = P.get(c.program); if (!p) continue; p.body = p.body || c.body; if (c.visitDate && new Date(c.visitDate) >= now && (!p.nextVisit || new Date(c.visitDate) < new Date(p.nextVisit))) p.nextVisit = new Date(c.visitDate).toISOString(); }

  // Status changes this year and last year (approved or applied), holds, attendance shortages, open CQI actions.
  const moves = await g(() => ddb.studentStatusRequest.findMany({ where: { chairmanId, status: { in: ["APPROVED", "APPLIED"] }, effectiveDate: { gte: lastYearStart } }, select: { studentId: true, type: true, effectiveDate: true } }) as Promise<{ studentId: string; type: string; effectiveDate: Date }[]>, []);
  const batchOfStudent = new Map(students.map((s) => [s.id, s.batchId]));
  for (const m of moves) { if (!MOVED.includes(m.type)) continue; const p = P.get(progOfBatch.get(batchOfStudent.get(m.studentId) || "") || ""); if (!p) continue; const slot = new Date(m.effectiveDate) >= yearStart ? p.moved.cur : p.moved.prev; slot[m.type] = (slot[m.type] || 0) + 1; }
  const holds = await g(() => ddb.registrationHold.findMany({ where: { status: "PENDING", studentId: { in: students.map((s) => s.id).concat(["none"]) } }, select: { studentId: true } }) as Promise<{ studentId: string }[]>, []);
  for (const h of holds) { const p = P.get(progOfBatch.get(batchOfStudent.get(h.studentId) || "") || ""); if (p) p.holds++; }
  const flags = await g(() => ddb.attendanceFlag.findMany({ where: { status: "SHORT", courseId: { in: courses.map((c) => c.id).concat(["none"]) } }, select: { studentId: true, courseId: true } }) as Promise<{ studentId: string; courseId: string }[]>, []);
  const shortSeen = new Set<string>();
  for (const f of flags) { if (shortSeen.has(f.studentId)) continue; shortSeen.add(f.studentId); const p = P.get(progOfCourse.get(f.courseId) || ""); if (p) p.shortages++; }
  const cqi = await g(() => prisma.cqiRecord.findMany({ where: { chairmanId, status: { in: ["open", "in-progress"] } }, select: { batchId: true, courseId: true } }), []);
  for (const c of cqi) { const p = P.get(progOfBatch.get(c.batchId || "") || progOfCourse.get(c.courseId || "") || ""); if (p) p.cqiOpen++; }

  // Feedback: each section's raw and batch-adjusted teacher score, weighted by answers, for the latest two terms.
  const fTerms = await g(() => feedbackTerms(chairmanId), []);
  for (const [slot, t] of [["cur", fTerms[0]], ["prev", fTerms[1]]] as const) {
    if (!t) continue;
    const tf = await g(() => termFeedback(chairmanId, t), null);
    for (const s of tf?.sections || []) { const p = P.get(progOfBatch.get(s.batchId || "") || ""); const n = s.teacherB.n; if (!p || !n || s.raw === null) continue; p.feedback[slot].sum += s.raw * n; p.feedback[slot].adjSum += (s.adjusted ?? s.raw) * n; p.feedback[slot].n += n; }
  }

  // Alumni in work.
  const alumni = await g(() => prisma.alumni.findMany({ where: { chairmanId, status: { not: "REJECTED" } }, select: { degreeProgram: true, employment: { where: { status: { not: "REJECTED" }, endDate: null }, select: { id: true } } } }) as unknown as Promise<{ degreeProgram: string; employment: { id: string }[] }[]>, []);
  for (const a of alumni) { const p = P.get(a.degreeProgram); if (!p) continue; p.alumni.total++; if (a.employment?.length) p.alumni.employed++; }

  // Students per full-time-equivalent teacher (the faculty sufficiency rules).
  let limit = 25;
  for (const p of P.values()) { const s = await g(() => sufficiency(chairmanId, p.program), null); if (s) { p.fte = s.fte; p.suffStudents = s.students; limit = s.rules.studentsPerFte; } }

  // Departments: teachers, PhD share, FDP hours and publications this year and last year, open approvals.
  const depts = await prisma.department.findMany({ where: { OR: [{ id: { in: Array.from(new Set(batches.map((b) => b.coordinator?.departmentId).filter((x): x is string => !!x))).concat(["none"]) } }, { faculty: { chairmanId } }] }, select: { id: true, name: true, facultyId: true } }).catch(() => [] as { id: string; name: string; facultyId: string | null }[]);
  const staff = await prisma.user.findMany({ where: { isActive: true, role: { in: ["INSTRUCTOR", "SUBJECT_EXPERT", "PROGRAM_COORDINATOR", "HEAD_OF_DEPARTMENT", "DEPARTMENT_COORDINATOR", "DEAN"] }, OR: [{ managedById: chairmanId }, { managedBy: { managedById: chairmanId } }] }, select: { id: true, departmentId: true, managedBy: { select: { departmentId: true } } } });
  const deptOf = new Map(staff.map((u) => [u.id, u.departmentId || u.managedBy?.departmentId || null]));
  const ids = staff.map((u) => u.id).concat(["none"]);
  const [edu, pubs, fdp] = await Promise.all([
    g(() => prisma.facultyRecord.findMany({ where: { userId: { in: ids }, kind: "EDUCATION" }, select: { userId: true, title: true } }), []),
    g(() => prisma.facultyRecord.findMany({ where: { userId: { in: ids }, kind: "PUBLICATION", startYear: { gte: year - 1 } }, select: { userId: true, startYear: true } }), []),
    g(() => ddb.fdpAttendance.findMany({ where: { userId: { in: ids }, attended: true }, select: { userId: true, sessionId: true } }) as Promise<{ userId: string; sessionId: string }[]>, []),
  ]);
  const sessions = new Map(((await g(() => ddb.fdpSession.findMany({ where: { chairmanId, date: { gte: lastYearStart } }, select: { id: true, date: true, hours: true } }), [])) as { id: string; date: Date; hours: number }[]).map((s) => [s.id, s]));
  const phd = new Set(edu.filter((e) => /\bph\.?\s?d\b|doctor|d\.?phil/i.test(e.title)).map((e) => e.userId));
  const D = new Map<string, DeptRow>(depts.map((d) => [d.id, { departmentId: d.id, name: d.name, facultyId: d.facultyId, teachers: 0, phd: 0, fdpHours: { cur: 0, prev: 0 }, pubs: { cur: 0, prev: 0 }, approvals: { open: 0, overdue: 0 } }]));
  for (const u of staff) { const d = D.get(deptOf.get(u.id) || ""); if (!d) continue; d.teachers++; if (phd.has(u.id)) d.phd++; }
  for (const p of pubs) { const d = D.get(deptOf.get(p.userId) || ""); if (!d) continue; if (p.startYear === year) d.pubs.cur++; else if (p.startYear === year - 1) d.pubs.prev++; }
  for (const a of fdp) { const s = sessions.get(a.sessionId); const d = D.get(deptOf.get(a.userId) || ""); if (!s || !d) continue; if (new Date(s.date) >= yearStart) d.fdpHours.cur += s.hours || 0; else d.fdpHours.prev += s.hours || 0; }

  // Open approvals across the modules (overdue = older than the kind's escalation days), by department where it can be told.
  const st = await settingsOf(chairmanId);
  const inst = { open: 0, overdue: 0 };
  const tally = (kind: string, since: Date | null | undefined, dept: string | null) => { const late = !!since && (now.getTime() - new Date(since).getTime()) / 864e5 >= settingFor(st, kind).escalateAfterDays; inst.open++; if (late) inst.overdue++; const d = D.get(dept || ""); if (d) { d.approvals.open++; if (late) d.approvals.overdue++; } };
  const cIds = courses.map((c) => c.id).concat(["none"]);
  for (const l of await g(() => ddb.shortLeave.findMany({ where: { chairmanId, status: "PENDING" }, select: { userId: true, createdAt: true } }) as Promise<{ userId: string; createdAt: Date }[]>, [])) tally("LEAVE", l.createdAt, deptOf.get(l.userId) || null);
  for (const r of await g(() => ddb.courseResult.findMany({ where: { courseId: { in: cIds }, status: "SUBMITTED" }, select: { courseId: true, submittedAt: true } }) as Promise<{ courseId: string; submittedAt: Date | null }[]>, [])) tally("RESULT", r.submittedAt, deptOfCourse.get(r.courseId) || null);
  for (const r of await g(() => ddb.gradeChangeRequest.findMany({ where: { courseId: { in: cIds }, status: "PENDING" }, select: { courseId: true, createdAt: true } }) as Promise<{ courseId: string; createdAt: Date }[]>, [])) tally("GRADE_CHANGE", r.createdAt, deptOfCourse.get(r.courseId) || null);
  for (const r of await g(() => ddb.paperVetting.findMany({ where: { courseId: { in: cIds }, status: "SUBMITTED" }, select: { courseId: true, submittedAt: true } }) as Promise<{ courseId: string; submittedAt: Date | null }[]>, [])) tally("PAPER_VETTING", r.submittedAt, deptOfCourse.get(r.courseId) || null);
  const deptOfBatch = new Map(batches.map((b) => [b.id, b.coordinator?.departmentId || null]));
  for (const r of await g(() => ddb.studentStatusRequest.findMany({ where: { chairmanId, status: "PENDING" }, select: { studentId: true, createdAt: true } }) as Promise<{ studentId: string; createdAt: Date }[]>, [])) tally("STATUS_CHANGE", r.createdAt, deptOfBatch.get(batchOfStudent.get(r.studentId) || "") || null);
  const allCycles = await g(() => ddb.accreditationCycle.findMany({ where: { chairmanId }, select: { id: true, departmentId: true } }) as Promise<{ id: string; departmentId: string | null }[]>, []);
  for (const r of await g(() => ddb.accreditationTask.findMany({ where: { status: "SUBMITTED", cycleId: { in: allCycles.map((c) => c.id).concat(["none"]) } }, select: { submittedAt: true, updatedAt: true, cycleId: true } }) as Promise<{ submittedAt: Date | null; updatedAt: Date; cycleId: string }[]>, [])) tally("ACCREDITATION_TASK", r.submittedAt || r.updatedAt, allCycles.find((c) => c.id === r.cycleId)?.departmentId || null);
  for (const r of await g(() => ddb.feeRefundCase.findMany({ where: { chairmanId, status: "PENDING" }, select: { createdAt: true } }) as Promise<{ createdAt: Date }[]>, [])) tally("FEE_REFUND", r.createdAt, null);
  for (const r of await g(() => ddb.registrationHold.findMany({ where: { status: "PENDING", studentId: { in: students.map((s) => s.id).concat(["none"]) } }, select: { studentId: true, createdAt: true } }) as Promise<{ studentId: string; createdAt: Date }[]>, [])) tally("REGISTRATION_HOLD", r.createdAt, deptOfBatch.get(batchOfStudent.get(r.studentId) || "") || null);

  // Budget for this fiscal year, and the FDP target.
  const fy = fiscalYear(now);
  const fin = await g(() => prisma.financeEntry.findMany({ where: { chairmanId, fiscalYear: fy }, select: { kind: true, amount: true } }), []);
  const fdpT = await g(() => ddb.fdpTarget.findUnique({ where: { chairmanId } }) as Promise<{ hoursPerYear: number } | null>, null);

  return {
    computedAt: now.toISOString(), year,
    terms: { results: [termName(rTerms[0]), termName(rTerms[1])], attainment: [aName(aTerms[0]), aName(aTerms[1])], feedback: [fTerms[0] ? `${fTerms[0].name} ${fTerms[0].year}` : null, fTerms[1] ? `${fTerms[1].name} ${fTerms[1].year}` : null] },
    programs: Array.from(P.values()), departments: Array.from(D.values()),
    institute: { fiscalYear: fy, budget: fin.filter((f) => f.kind === "BUDGET").reduce((t, f) => t + f.amount, 0), spent: fin.filter((f) => f.kind === "SPENT").reduce((t, f) => t + f.amount, 0), fdpTarget: fdpT?.hoursPerYear ?? 20, approvals: inst, studentsPerFteLimit: limit },
  };
}

/** Work it out and keep it (older runs beyond 400 days are cleared). */
export async function refreshDashboard(chairmanId: string) {
  const snap = await computeDashboard(chairmanId);
  await ddb.dashboardSnapshot.create({ data: { id: randomUUID(), chairmanId, computedAt: new Date(snap.computedAt), dataJson: JSON.stringify(snap) } });
  await ddb.dashboardSnapshot.deleteMany({ where: { chairmanId, computedAt: { lt: new Date(Date.now() - 400 * 864e5) } } }).catch(() => {});
  return snap;
}
export async function latestSnapshot(chairmanId: string): Promise<Snapshot | null | "missing"> {
  try { const r = await ddb.dashboardSnapshot.findFirst({ where: { chairmanId }, orderBy: { computedAt: "desc" } }); return r ? parse<Snapshot | null>(r.dataJson, null) : null; } catch { return "missing"; }
}
/** Nightly: every institute. */
export async function refreshAllDashboards() {
  try { await ddb.dashboardSnapshot.count(); } catch { return { skipped: DASH_HINT }; }
  const heads = await prisma.user.findMany({ where: { role: "CHAIRMAN", isActive: true }, select: { id: true } });
  let n = 0; for (const h of heads) { try { await refreshDashboard(h.id); n++; } catch { /* one institute must not stop the rest */ } }
  return { refreshed: n };
}

// ---- The figures: how each is added up for an area, its target, and which way is better ----

export type Scope = { departmentIds: string[] | null; program: string | null };
export type Figure = { key: string; label: string; unit: "%" | "" | ":1" | "h" | "Rs"; better: "up" | "down" | null; target: number | null; now: number | null; before: number | null; beforeLabel: string; sub: string; href: string; instituteOnly?: boolean };
export const DEFAULT_TARGETS: Record<string, number> = { passRate: 80, clo: 70, plo: 70, readiness: 75, attrition: 5, atRisk: 10, shortages: 5, str: 25, phd: 30, fdp: 20, feedbackRaw: 3.5, cqi: 10, overdue: 0, budget: 80, alumni: 70, research: 10 };
export const TARGET_LABELS: [string, string, string][] = [
  ["passRate", "Pass rate (%)", "at least"], ["clo", "CLO attainment (%)", "at least"], ["plo", "PLO attainment (%)", "at least"], ["readiness", "Accreditation readiness (%)", "at least"],
  ["attrition", "Students who left this year (% of enrolled)", "at most"], ["atRisk", "Students on warning or probation (% of enrolled)", "at most"], ["shortages", "Students short of attendance (% of enrolled)", "at most"],
  ["str", "Students per full-time-equivalent teacher", "at most"], ["phd", "Teachers with a PhD (%)", "at least"], ["fdp", "FDP hours per teacher this year", "at least"],
  ["feedbackRaw", "Teacher feedback score (out of 5)", "at least"], ["cqi", "Open CQI actions", "at most"], ["overdue", "Overdue approvals", "at most"], ["budget", "Budget spent (%)", "at least"],
  ["alumni", "Alumni in work (%)", "at least"], ["research", "Publications this year", "at least"],
];

const pct = (a: number, b: number) => (b ? Math.round((1000 * a) / b) / 10 : null);
export function inScope(s: Snapshot, sc: Scope) {
  const programs = s.programs.filter((p) => (!sc.departmentIds || (p.departmentId && sc.departmentIds.includes(p.departmentId))) && (!sc.program || p.program === sc.program));
  const departments = s.departments.filter((d) => (!sc.departmentIds || sc.departmentIds.includes(d.departmentId)) && (!sc.program || programs.some((p) => p.departmentId === d.departmentId)));
  return { programs, departments };
}

export function figures(s: Snapshot, sc: Scope, targets: Record<string, number>): Figure[] {
  const { programs: ps, departments: ds } = inScope(s, sc);
  const sum = (f: (p: ProgramRow) => number) => ps.reduce((t, p) => t + f(p), 0);
  const dsum = (f: (d: DeptRow) => number) => ds.reduce((t, d) => t + f(d), 0);
  const T = (k: string) => (targets[k] ?? DEFAULT_TARGETS[k] ?? null);
  const enrolled = sum((p) => p.enrolled);
  const intakeYears = Array.from(new Set(ps.flatMap((p) => Object.keys(p.intake)))).sort().slice(-4);
  const intake = intakeYears.map((y) => [y, sum((p) => p.intake[y] || 0)] as const);
  const moved = (slot: "cur" | "prev", types: string[]) => sum((p) => types.reduce((t, k) => t + (p.moved[slot][k] || 0), 0));
  const left = ["DROPPED", "LEFT", "TRANSFER_OUT", "RUSTICATED"];
  const dist: Record<string, number> = {}; for (const p of ps) for (const [k, v] of Object.entries(p.results.cur.dist)) dist[k] = (dist[k] || 0) + v;
  const fb = (slot: "cur" | "prev", adj = false) => { const n = sum((p) => p.feedback[slot].n); return n ? Math.round((10 * sum((p) => (adj ? p.feedback[slot].adjSum : p.feedback[slot].sum))) / n) / 10 : null; };
  const fte = sum((p) => p.fte), suffSt = sum((p) => p.suffStudents);
  const teachers = dsum((d) => d.teachers);
  const visits = ps.filter((p) => p.nextVisit).sort((a, b) => String(a.nextVisit).localeCompare(String(b.nextVisit)));
  const rd = ps.filter((p) => p.readiness !== null);
  const day = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  const [rNow, rPrev] = s.terms.results, [aNow, aPrev] = s.terms.attainment, [fNow, fPrev] = s.terms.feedback;
  const whole = !sc.departmentIds && !sc.program;
  const appr = whole ? s.institute.approvals : { open: dsum((d) => d.approvals.open), overdue: dsum((d) => d.approvals.overdue) };
  return [
    { key: "enrolled", label: "Students enrolled", unit: "", better: null, target: null, now: enrolled, before: null, beforeLabel: "", sub: intake.length ? `Intake ${intake.map(([y, n]) => `${y}: ${n}`).join(" · ")}` : "No batches yet", href: "/student-movement" },
    { key: "passRate", label: "Pass rate", unit: "%", better: "up", target: T("passRate"), now: pct(sum((p) => p.results.cur.pass), sum((p) => p.results.cur.students)), before: pct(sum((p) => p.results.prev.pass), sum((p) => p.results.prev.students)), beforeLabel: rPrev || "last term", sub: rNow ? `${rNow}: ${sum((p) => p.results.cur.students)} course grades. Spread: ${Object.entries(dist).sort().map(([k, v]) => `${k} ${v}`).join(", ") || "—"}` : "No submitted results yet", href: "/grade-distribution" },
    { key: "clo", label: "CLO attainment", unit: "%", better: "up", target: T("clo"), now: pct(sum((p) => p.clo.cur.pass), sum((p) => p.clo.cur.total)), before: pct(sum((p) => p.clo.prev.pass), sum((p) => p.clo.prev.total)), beforeLabel: aPrev || "last term", sub: aNow ? `Share of student–CLO results at or above the pass level, ${aNow}` : "No attainment snapshots yet", href: "/outcome-flow" },
    { key: "plo", label: "PLO attainment", unit: "%", better: "up", target: T("plo"), now: pct(sum((p) => p.plo.cur.pass), sum((p) => p.plo.cur.total)), before: pct(sum((p) => p.plo.prev.pass), sum((p) => p.plo.prev.total)), beforeLabel: aPrev || "last term", sub: aNow ? `Share of student–PLO results at or above the pass level, ${aNow}` : "No attainment snapshots yet", href: "/outcome-flow" },
    { key: "readiness", label: "Accreditation readiness", unit: "%", better: "up", target: T("readiness"), now: rd.length ? Math.round(rd.reduce((t, p) => t + (p.readiness as number), 0) / rd.length) : null, before: null, beforeLabel: "", sub: `${rd.map((p) => `${p.program}: ${p.readiness}%`).join(" · ") || "No readiness check yet"}${visits[0] ? ` · Next visit: ${visits[0].program} (${visits[0].body}) on ${day(visits[0].nextVisit as string)}` : ""}`, href: "/accreditation-overview" },
    { key: "attrition", label: "Left this year", unit: "%", better: "down", target: T("attrition"), now: pct(moved("cur", left), enrolled + moved("cur", left)), before: pct(moved("prev", left), enrolled + moved("prev", left)), beforeLabel: String(s.year - 1), sub: `${moved("cur", ["DROPPED"])} dropped, ${moved("cur", ["LEFT"])} left, ${moved("cur", ["TRANSFER_OUT"])} transferred out, ${moved("cur", ["FREEZE"])} froze a semester, ${moved("cur", ["TRANSFER_INTERNAL"])} moved program (${s.year})`, href: "/student-movement" },
    { key: "atRisk", label: "On warning or probation", unit: "%", better: "down", target: T("atRisk"), now: pct(sum((p) => p.warning + p.probation), enrolled), before: null, beforeLabel: "", sub: `${sum((p) => p.warning)} on warning, ${sum((p) => p.probation)} on probation; ${sum((p) => p.holds)} registration hold(s) waiting for advisors`, href: "/risk" },
    { key: "shortages", label: "Short of attendance", unit: "%", better: "down", target: T("shortages"), now: pct(sum((p) => p.shortages), enrolled), before: null, beforeLabel: "", sub: `${sum((p) => p.shortages)} student(s) below the attendance limit in at least one course`, href: "/risk" },
    { key: "str", label: "Students per FTE teacher", unit: ":1", better: "down", target: T("str") ?? s.institute.studentsPerFteLimit, now: fte ? Math.round((10 * suffSt) / fte) / 10 : null, before: null, beforeLabel: "", sub: `${teachers} teachers · ${Math.round(fte * 10) / 10} FTE`, href: "/faculty-sufficiency" },
    { key: "phd", label: "Teachers with a PhD", unit: "%", better: "up", target: T("phd"), now: pct(dsum((d) => d.phd), teachers), before: null, beforeLabel: "", sub: `${dsum((d) => d.phd)} of ${teachers} teachers`, href: "/faculty-sufficiency" },
    { key: "fdp", label: "FDP hours per teacher", unit: "h", better: "up", target: targets.fdp ?? s.institute.fdpTarget, now: teachers ? Math.round((10 * dsum((d) => d.fdpHours.cur)) / teachers) / 10 : null, before: teachers ? Math.round((10 * dsum((d) => d.fdpHours.prev)) / teachers) / 10 : null, beforeLabel: String(s.year - 1), sub: `${Math.round(dsum((d) => d.fdpHours.cur))} hours attended in ${s.year}`, href: "/fdp" },
    { key: "feedbackRaw", label: "Teacher feedback (out of 5)", unit: "", better: "up", target: T("feedbackRaw"), now: fb("cur"), before: fb("prev"), beforeLabel: fPrev || "last term", sub: fNow ? `${fNow}: raw ${fb("cur") ?? "—"}, adjusted for each batch's habits ${fb("cur", true) ?? "—"} (${sum((p) => p.feedback.cur.n)} answers)` : "No feedback answers yet", href: "/evaluations" },
    { key: "cqi", label: "Open CQI actions", unit: "", better: "down", target: T("cqi"), now: sum((p) => p.cqiOpen), before: null, beforeLabel: "", sub: "Improvement actions still open or in progress", href: "/chairman/cqi" },
    { key: "overdue", label: "Overdue approvals", unit: "", better: "down", target: T("overdue"), now: appr.overdue, before: null, beforeLabel: "", sub: `${appr.open} waiting in all; overdue = older than the escalation days for its kind`, href: "/approvals" },
    { key: "budget", label: "Budget spent", unit: "%", better: "up", target: T("budget"), now: pct(s.institute.spent, s.institute.budget), before: null, beforeLabel: "", sub: s.institute.budget ? `Rs ${Math.round(s.institute.spent).toLocaleString("en-PK")} of Rs ${Math.round(s.institute.budget).toLocaleString("en-PK")} (${s.institute.fiscalYear}, whole institute)` : `No budget entered for ${s.institute.fiscalYear}`, href: "/chairman/finance", instituteOnly: true },
    { key: "alumni", label: "Alumni in work", unit: "%", better: "up", target: T("alumni"), now: pct(sum((p) => p.alumni.employed), sum((p) => p.alumni.total)), before: null, beforeLabel: "", sub: `${sum((p) => p.alumni.employed)} of ${sum((p) => p.alumni.total)} alumni on record have a current job`, href: "/alumni-voice" },
    { key: "research", label: "Publications this year", unit: "", better: "up", target: T("research"), now: dsum((d) => d.pubs.cur), before: dsum((d) => d.pubs.prev), beforeLabel: String(s.year - 1), sub: "From teachers' profiles (journal and conference papers)", href: "/faculty-sufficiency" },
  ];
}

/** green / amber / red against the target; grey when there is no figure or no target. */
export function light(f: Pick<Figure, "now" | "target" | "better">): "green" | "amber" | "red" | "grey" {
  if (f.now === null || f.target === null || !f.better) return "grey";
  if (f.better === "up") return f.now >= f.target ? "green" : f.now >= f.target * 0.85 ? "amber" : "red";
  if (f.now <= f.target) return "green";
  return f.now <= Math.max(f.target * 1.25, f.target + 1) ? "amber" : "red";
}

export const DASH_ROLES = ["CHAIRMAN", "DEAN", "HEAD_OF_DEPARTMENT"];
/** The departments a person may see: all for the Institute Head, the faculty's for a Dean, their own for a HOD. */
export function allowedDepartments(user: { role: string; departmentId?: string | null; facultyId?: string | null }, s: Snapshot): string[] | null {
  if (user.role === "CHAIRMAN") return null;
  if (user.role === "DEAN") return s.departments.filter((d) => d.facultyId && d.facultyId === user.facultyId).map((d) => d.departmentId);
  return user.departmentId ? [user.departmentId] : [];
}
/** The scope after the page's filters (a filter can only narrow what the person may see). */
export function scopeOf(user: { role: string; departmentId?: string | null; facultyId?: string | null }, s: Snapshot, dept?: string | null, program?: string | null): Scope {
  const allowed = allowedDepartments(user, s);
  let ids = allowed;
  if (dept) ids = !allowed || allowed.includes(dept) ? [dept] : allowed;
  const visible = s.programs.filter((p) => !ids || (p.departmentId && ids.includes(p.departmentId))).map((p) => p.program);
  return { departmentIds: ids, program: program && visible.includes(program) ? program : null };
}
export async function targetsOf(chairmanId: string): Promise<Record<string, number>> {
  try { return Object.fromEntries(((await ddb.dashboardTarget.findMany({ where: { chairmanId } })) as { key: string; target: number }[]).map((t) => [t.key, t.target])); } catch { return {}; }
}
export const fmtFigure = (f: Pick<Figure, "now" | "unit">, v = f.now) => (v === null || v === undefined ? "—" : f.unit === "%" ? `${v}%` : f.unit === ":1" ? `${v} : 1` : f.unit === "h" ? `${v} h` : String(v));
