import { randomUUID } from "crypto";
import { prisma } from "./db";

// Performance prediction from past results — every number comes with the reason behind it.
//  Data: results already in OBEHUB (transcript records of every batch, with each student's final status) plus past
//  years uploaded from a sheet (HistoricalRecord) for students who were never in the system.
//  Course grade: per course, a straight-line fit of grade points on the student's CGPA before the course
//    (8+ past students), else their CGPA shifted by how much harder / easier the course is than average.
//  Fail risk: of past students with a CGPA within ±0.3 who took the course, the share who failed.
//  Term GPA: the predicted grades of the courses enrolled, by credit hours. Final CGPA: the remaining credits at the
//    student's recent term GPAs. Dropout / on-time graduation: what happened to past students with a similar CGPA
//    after the same number of terms.
//  Validation: fitted on terms before the last two and tested on the last two.

const pdb = prisma as unknown as Record<string, any>;
export const PRED_HINT = "Uploading past years needs prisma/migration_campus_ops.sql — run it in Supabase. Predictions from OBEHUB's own results still work.";
export const UPLOAD_COLUMNS = ["program", "intake_year", "roll_number", "semester", "term", "year", "course_code", "credit_hours", "marks_pct", "attendance_pct", "grade", "gpa_points", "outcome"];
const GP: Record<string, number> = { "A+": 4, A: 4, "A-": 3.67, "B+": 3.33, B: 3, "B-": 2.67, "C+": 2.33, C: 2, "C-": 1.67, "D+": 1.33, D: 1, F: 0, FA: 0 };
const BAND = 0.3, MIN_FIT = 8, MIN_NEAR = 5;

type Rec = { sid: string; t: number; code: string; ch: number; gp: number; fail: boolean };
type Who = { sid: string; outcome: "GRADUATED" | "DROPPED" | "ACTIVE"; start: number };
export type Model = Awaited<ReturnType<typeof buildModel>>;

const up = (s: string) => s.trim().toUpperCase().replace(/\s+/g, "");
const gpOf = (grade: string | null | undefined, gp: number | null | undefined) => (gp != null && !isNaN(gp) ? gp : GP[(grade || "").trim().toUpperCase()] ?? null);
const r2 = (x: number) => Math.round(x * 100) / 100;
const letter = (g: number) => (g >= 3.84 ? "A" : g >= 3.5 ? "A-" : g >= 3.17 ? "B+" : g >= 2.84 ? "B" : g >= 2.5 ? "B-" : g >= 2.17 ? "C+" : g >= 1.84 ? "C" : g >= 1.5 ? "C-" : g >= 1.17 ? "D+" : g >= 0.84 ? "D" : "F");

async function loadData(chairmanId: string) {
  const leads = (await prisma.user.findMany({ where: { role: "PROGRAM_COORDINATOR", managedById: chairmanId }, select: { id: true } })).map((l) => l.id);
  const batches = await prisma.batch.findMany({ where: { coordinatorId: { in: leads.concat("none") } }, select: { id: true, startTerm: true, startYear: true, degreeProgram: true } });
  const students = await prisma.student.findMany({ where: { batchId: { in: batches.map((b) => b.id).concat("none") } }, select: { id: true, batchId: true, status: true } });
  const tr = await prisma.studentTranscriptRecord.findMany({ where: { studentId: { in: students.map((s) => s.id).concat("none") } }, select: { studentId: true, courseCode: true, creditHours: true, termName: true, termYear: true, grade: true, gpaPoints: true } });
  const bOf = new Map(batches.map((b) => [b.id, b]));
  const recs: Rec[] = [], who = new Map<string, Who>();
  for (const s of students) { const b = bOf.get(s.batchId)!; who.set(s.id, { sid: s.id, outcome: s.status === "GRADUATED" ? "GRADUATED" : ["DROPPED", "LEFT"].includes(s.status) ? "DROPPED" : "ACTIVE", start: /fall/i.test(b.startTerm) ? 2 * b.startYear : 2 * b.startYear - 1 }); }
  for (const r of tr) { const g = gpOf(r.grade, r.gpaPoints); if (g === null || /^(W|I)$/i.test(r.grade)) continue; recs.push({ sid: r.studentId, t: /fall/i.test(r.termName) ? 2 * r.termYear : 2 * r.termYear - 1, code: up(r.courseCode), ch: r.creditHours || 3, gp: g, fail: g === 0 }); }
  let hist = 0;
  try {
    const h = (await pdb.historicalRecord.findMany({ where: { chairmanId } })) as { program: string; intakeYear: number; rollNumber: string; semester: number; termName: string | null; termYear: number | null; courseCode: string; creditHours: number; grade: string | null; gpaPoints: number | null; outcome: string | null }[];
    hist = h.length;
    for (const r of h) {
      const sid = `H:${r.program}:${r.rollNumber}`, start = 2 * r.intakeYear;
      const g = gpOf(r.grade, r.gpaPoints); if (g === null) continue;
      const t = r.termName && r.termYear ? (/fall/i.test(r.termName) ? 2 * r.termYear : /spring/i.test(r.termName) ? 2 * r.termYear - 1 : 2 * r.termYear - 0.5) : start + r.semester - 1;
      recs.push({ sid, t, code: up(r.courseCode), ch: r.creditHours || 3, gp: g, fail: g === 0 });
      const o = (r.outcome || "").toUpperCase();
      if (!who.has(sid) || o) who.set(sid, { sid, start, outcome: /GRAD/.test(o) ? "GRADUATED" : /DROP|LEFT|WITHDR/.test(o) ? "DROPPED" : who.get(sid)?.outcome || "ACTIVE" });
    }
  } catch { hist = -1; }
  return { recs, who, hist };
}

/** Per student, records grouped by term with the CGPA before each term. */
function timelines(recs: Rec[]) {
  const by = new Map<string, Rec[]>();
  for (const r of recs) by.set(r.sid, [...(by.get(r.sid) || []), r]);
  const out = new Map<string, { t: number; prior: number | null; cgpaAfter: number; recs: Rec[]; termGpa: number }[]>();
  for (const [sid, rs] of Array.from(by.entries())) {
    const terms = Array.from(new Set(rs.map((r) => r.t))).sort((a, b) => a - b);
    let pts = 0, cr = 0;
    const list = [];
    for (const t of terms) {
      const here = rs.filter((r) => r.t === t);
      const prior = cr ? pts / cr : null;
      const hp = here.reduce((a, r) => a + r.gp * r.ch, 0), hc = here.reduce((a, r) => a + r.ch, 0);
      pts += hp; cr += hc;
      list.push({ t, prior, cgpaAfter: cr ? pts / cr : 0, recs: here, termGpa: hc ? hp / hc : 0 });
    }
    out.set(sid, list);
  }
  return out;
}

function fit(pairs: { x: number; y: number }[]) {
  const n = pairs.length, mx = pairs.reduce((a, p) => a + p.x, 0) / n, my = pairs.reduce((a, p) => a + p.y, 0) / n;
  const sxx = pairs.reduce((a, p) => a + (p.x - mx) ** 2, 0), sxy = pairs.reduce((a, p) => a + (p.x - mx) * (p.y - my), 0);
  const b = sxx > 1e-6 ? Math.max(0, Math.min(1.5, sxy / sxx)) : 1;
  return { a: my - b * mx, b, n, mx, my };
}

export async function buildModel(chairmanId: string, opts: { before?: number } = {}) {
  const d = await loadData(chairmanId);
  const recs = opts.before ? d.recs.filter((r) => r.t < opts.before!) : d.recs;
  const tl = timelines(recs);
  const pairs = new Map<string, { x: number; y: number; fail: boolean }[]>();
  const all: { x: number; fail: boolean }[] = [];
  for (const list of Array.from(tl.values())) for (const term of list) if (term.prior !== null) for (const r of term.recs) { pairs.set(r.code, [...(pairs.get(r.code) || []), { x: term.prior, y: r.gp, fail: r.fail }]); all.push({ x: term.prior, fail: r.fail }); }
  const courses = new Map<string, { n: number; meanGp: number; meanPrior: number; failRate: number; line: ReturnType<typeof fit> | null }>();
  for (const [code, ps] of Array.from(pairs.entries())) courses.set(code, { n: ps.length, meanGp: ps.reduce((a, p) => a + p.y, 0) / ps.length, meanPrior: ps.reduce((a, p) => a + p.x, 0) / ps.length, failRate: ps.filter((p) => p.fail).length / ps.length, line: ps.length >= MIN_FIT ? fit(ps) : null });
  const globalFail = all.length ? all.filter((p) => p.fail).length / all.length : 0.1;
  // Outcomes after k terms: CGPA after k terms -> what happened.
  const after: { k: number; cgpa: number; outcome: string; terms: number }[] = [];
  for (const [sid, list] of Array.from(tl.entries())) { const w = d.who.get(sid); if (!w || w.outcome === "ACTIVE") continue; list.forEach((x, i) => after.push({ k: i + 1, cgpa: x.cgpaAfter, outcome: w.outcome, terms: list.length })); }

  const predictGrade = (code: string, prior: number | null) => {
    const c = courses.get(up(code));
    if (prior === null) return c ? { gp: r2(c.meanGp), why: `First term — the course average of ${c.n} past students` } : { gp: null, why: "No past results for this course yet" };
    if (c?.line) { const g = Math.max(0, Math.min(4, c.line.a + c.line.b * prior)); return { gp: r2(g), why: `Fit on ${c.n} past students of this course: grade ≈ ${r2(c.line.a)} + ${r2(c.line.b)} × CGPA` }; }
    if (c && c.n >= 3) { const off = c.meanGp - c.meanPrior; return { gp: r2(Math.max(0, Math.min(4, prior + off))), why: `CGPA ${r2(prior)} ${off >= 0 ? "+" : "−"} ${r2(Math.abs(off))} (this course is ${off >= 0 ? "easier" : "harder"} than average for its ${c.n} past students)` }; }
    return { gp: r2(prior), why: "Few past results for this course — taken as the student's CGPA" };
  };
  const failRisk = (code: string, prior: number | null) => {
    const ps = pairs.get(up(code)) || [];
    if (prior === null) { const c = courses.get(up(code)); return { risk: c ? r2(c.failRate) : r2(globalFail), why: c ? `${Math.round(100 * c.failRate)}% of ${c.n} past students failed this course` : "Average fail rate" }; }
    const near = ps.filter((p) => Math.abs(p.x - prior) <= BAND);
    if (near.length >= MIN_NEAR) { const f = near.filter((p) => p.fail).length; return { risk: r2((f + 0.5) / (near.length + 1)), why: `${f} of ${near.length} past students with CGPA ${r2(prior - BAND)}–${r2(prior + BAND)} failed this course` }; }
    const nearAll = all.filter((p) => Math.abs(p.x - prior) <= BAND);
    const base = nearAll.length ? nearAll.filter((p) => p.fail).length / nearAll.length : globalFail;
    const c = courses.get(up(code)), ratio = c && c.n >= 3 && globalFail > 0 ? Math.max(0.5, Math.min(2.5, c.failRate / globalFail)) : 1;
    return { risk: r2(Math.min(0.95, base * ratio)), why: `${Math.round(100 * base)}% of students with a similar CGPA fail a course${ratio !== 1 ? `; this course fails ${r2(ratio)}× the usual share` : ""}` };
  };
  const outcomeRisk = (k: number, cgpa: number) => {
    const near = after.filter((a) => a.k === k && Math.abs(a.cgpa - cgpa) <= BAND);
    if (near.length < MIN_NEAR) return null;
    const drop = near.filter((a) => a.outcome === "DROPPED").length, grad = near.filter((a) => a.outcome === "GRADUATED");
    return { n: near.length, dropout: r2(drop / near.length), onTime: grad.length ? r2(grad.filter((a) => a.terms <= 8).length / near.length) : 0, why: `Of ${near.length} past students with CGPA ${r2(cgpa - BAND)}–${r2(cgpa + BAND)} after ${k} term(s): ${drop} left without a degree, ${grad.filter((a) => a.terms <= 8).length} graduated in 8 terms` };
  };
  return { courses, globalFail, predictGrade, failRisk, outcomeRisk, data: { records: d.recs.length, students: d.who.size, uploaded: d.hist, finished: Array.from(d.who.values()).filter((w) => w.outcome !== "ACTIVE").length }, tl };
}

/** Held-out check: fitted on all terms before the last two, tested on the last two. */
export async function validate(chairmanId: string) {
  const full = await buildModel(chairmanId);
  const terms = Array.from(new Set(Array.from(full.tl.values()).flatMap((l) => l.map((x) => x.t)))).sort((a, b) => a - b);
  if (terms.length < 4) return null;
  const cut = terms[terms.length - 2];
  const m = await buildModel(chairmanId, { before: cut });
  let n = 0, absErr = 0, close = 0, tp = 0, fp = 0, fn = 0;
  for (const list of Array.from(full.tl.values())) {
    // CGPA before `cut` from the student's own earlier terms.
    const earlier = list.filter((x) => x.t < cut);
    const prior = earlier.length ? earlier[earlier.length - 1].cgpaAfter : null;
    if (prior === null) continue;
    for (const term of list.filter((x) => x.t >= cut)) for (const r of term.recs) {
      const g = m.predictGrade(r.code, prior).gp; if (g === null) continue;
      n++; absErr += Math.abs(g - r.gp); if (Math.abs(g - r.gp) <= 0.67) close++;
      const flagged = m.failRisk(r.code, prior).risk >= 0.3;
      if (flagged && r.fail) tp++; else if (flagged) fp++; else if (r.fail) fn++;
    }
  }
  const t = (i: number) => (i % 2 === 0 ? `Fall ${i / 2}` : `Spring ${(i + 1) / 2}`);
  return { testedOn: `${t(cut)} onwards`, trainedOn: `up to ${t(terms[terms.findIndex((x) => x === cut) - 1])}`, results: n, mae: n ? r2(absErr / n) : null, within: n ? Math.round((100 * close) / n) : null, failCaught: tp + fn ? Math.round((100 * tp) / (tp + fn)) : null, flaggedRight: tp + fp ? Math.round((100 * tp) / (tp + fp)) : null, fails: tp + fn };
}

/** Course difficulty from past results. */
export function difficulty(m: Model) {
  return Array.from(m.courses.entries()).filter(([, c]) => c.n >= 5).map(([code, c]) => ({ code, n: c.n, meanGp: r2(c.meanGp), failPct: Math.round(100 * c.failRate), harder: r2(c.meanPrior - c.meanGp) })).sort((a, b) => b.harder - a.harder);
}

/** Predictions for one student in OBEHUB: current courses, term GPA, final CGPA, dropout / on-time. */
export async function studentPrediction(m: Model, studentId: string) {
  const s = await prisma.student.findUnique({ where: { id: studentId }, select: { id: true, name: true, rollNumber: true, batch: { select: { degreeProgram: true, batchName: true } } } });
  if (!s) return null;
  const list = m.tl.get(studentId) || [];
  const cgpa = list.length ? list[list.length - 1].cgpaAfter : null;
  const credits = list.reduce((a, x) => a + x.recs.reduce((b, r) => b + r.ch, 0), 0);
  const enr = await prisma.studentEnrollment.findMany({ where: { studentId, status: { not: "WITHDRAWN" }, course: { isOffered: true } }, select: { course: { select: { code: true, title: true, creditHours: true } } } });
  const courses = enr.map((e) => { const g = m.predictGrade(e.course.code, cgpa), f = m.failRisk(e.course.code, cgpa); return { code: e.course.code, title: e.course.title, ch: e.course.creditHours, gp: g.gp, letter: g.gp !== null ? letter(g.gp) : "—", gradeWhy: g.why, risk: f.risk, riskWhy: f.why }; });
  const known = courses.filter((c) => c.gp !== null);
  const termCh = known.reduce((a, c) => a + c.ch, 0);
  const termGpa = termCh ? r2(known.reduce((a, c) => a + c.gp! * c.ch, 0) / termCh) : null;
  const recent = list.slice(-2).map((x) => x.termGpa);
  const pace = recent.length ? recent.reduce((a, b) => a + b, 0) / recent.length : cgpa;
  const total = 132, left = Math.max(0, total - credits - termCh);
  const finalCgpa = cgpa !== null && pace !== null ? r2(((cgpa * credits) + (termGpa ?? pace) * termCh + pace * left) / Math.max(1, credits + termCh + left)) : null;
  const out = cgpa !== null && list.length ? m.outcomeRisk(list.length, cgpa) : null;
  return {
    student: { name: s.name, roll: s.rollNumber, batch: s.batch ? `${s.batch.degreeProgram} — ${s.batch.batchName}` : "" }, cgpa: cgpa !== null ? r2(cgpa) : null, terms: list.length, credits, courses, termGpa,
    termWhy: termGpa !== null ? `The predicted grades of ${known.length} enrolled course(s), weighted by credit hours` : "No enrolled courses with past results",
    finalCgpa, finalWhy: finalCgpa !== null ? `${credits} credits done at ${r2(cgpa!)}, this term as predicted, and about ${left} credits left at the recent term GPA of ${r2(pace!)} (assumes a ${total}-credit degree)` : "Not enough results yet",
    outcome: out,
  };
}

/** Students of a course (or batch) ranked by predicted fail risk — for teachers and advisors. */
export async function atRisk(m: Model, where: { courseId?: string; batchId?: string }) {
  const enr = where.courseId
    ? await prisma.studentEnrollment.findMany({ where: { courseId: where.courseId, status: { not: "WITHDRAWN" } }, select: { studentId: true, student: { select: { name: true, rollNumber: true } }, course: { select: { code: true } } } })
    : await prisma.studentEnrollment.findMany({ where: { student: { batchId: where.batchId, status: "ACTIVE" }, status: { not: "WITHDRAWN" }, course: { isOffered: true } }, select: { studentId: true, student: { select: { name: true, rollNumber: true } }, course: { select: { code: true } } } });
  return enr.map((e) => {
    const list = m.tl.get(e.studentId) || [];
    const cgpa = list.length ? list[list.length - 1].cgpaAfter : null;
    const f = m.failRisk(e.course.code, cgpa), g = m.predictGrade(e.course.code, cgpa);
    return { studentId: e.studentId, name: e.student.name, roll: e.student.rollNumber, code: e.course.code, cgpa: cgpa !== null ? r2(cgpa) : null, risk: f.risk, why: f.why, grade: g.gp !== null ? letter(g.gp) : "—" };
  }).sort((a, b) => b.risk - a.risk);
}

/** Upload past years (CSV text with the UPLOAD_COLUMNS header). Replaces earlier uploads of the same program + intake. */
export async function uploadHistory(chairmanId: string, csv: string) {
  const lines = csv.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) throw new Error("The file has no rows.");
  const split = (l: string) => { const out: string[] = []; let cur = "", q = false; for (const ch of l) { if (ch === '"') q = !q; else if (ch === "," && !q) { out.push(cur); cur = ""; } else cur += ch; } out.push(cur); return out.map((x) => x.trim()); };
  const head = split(lines[0]).map((h) => h.toLowerCase().replace(/\s+/g, "_"));
  const col = (n: string) => head.indexOf(n);
  for (const need of ["program", "intake_year", "roll_number", "semester", "course_code"]) if (col(need) < 0) throw new Error(`Missing column "${need}". Use the template.`);
  const rows: Record<string, unknown>[] = [], bad: number[] = [];
  const num = (v: string) => (v === "" ? null : Number(v));
  lines.slice(1).forEach((l, i) => {
    const v = split(l), g = (n: string) => (col(n) >= 0 ? v[col(n)] || "" : "");
    const intake = Number(g("intake_year")), sem = Number(g("semester"));
    if (!g("program") || !g("roll_number") || !g("course_code") || !(intake > 1980) || !(sem >= 1 && sem <= 16) || (gpOf(g("grade"), num(g("gpa_points"))) === null)) { bad.push(i + 2); return; }
    rows.push({ id: randomUUID(), chairmanId, program: g("program").slice(0, 80), intakeYear: intake, rollNumber: g("roll_number").slice(0, 40), semester: sem, termName: g("term") || null, termYear: num(g("year")), courseCode: g("course_code").slice(0, 30), creditHours: num(g("credit_hours")) ?? 3, marksPct: num(g("marks_pct")), attendancePct: num(g("attendance_pct")), grade: g("grade") || null, gpaPoints: num(g("gpa_points")), outcome: g("outcome") || null, uploadedAt: new Date() });
  });
  const keys = Array.from(new Set(rows.map((r) => `${r.program}|${r.intakeYear}`)));
  for (const k of keys) { const [program, y] = k.split("|"); await pdb.historicalRecord.deleteMany({ where: { chairmanId, program, intakeYear: Number(y) } }); }
  for (let i = 0; i < rows.length; i += 1000) await pdb.historicalRecord.createMany({ data: rows.slice(i, i + 1000) });
  return { added: rows.length, skipped: bad.length, badRows: bad.slice(0, 20), cohorts: keys.length };
}
