import { randomUUID } from "crypto";
import { prisma } from "./db";
import { getPolicy, type Policy } from "./registrationRules";
import { computeCgpa } from "./academicStanding";
import { termIndex } from "./termLogic";

// The rest-of-degree planner. Given a student's record and the load they can carry each coming term, it lays out every
// course still needed, term by term, and says which batch the student takes each one with:
//   • future batches follow today's curriculum (the newest batch's), at the program's intakes (Fall, and Spring if any
//     batch of the program started in Spring), so a course dropped in Fall 2026 comes back with the Fall 2027 batch;
//   • the student's own batch first, otherwise the earliest batch that teaches it;
//   • prerequisites before the courses that need them;
//   • never a course before its own semester (e.g. a semester-5 course while the student is in semester 4) unless the
//     HOD, Chairman or Dean approved it for this student;
//   • summer only for courses already taken (repeat a fail or improve a low grade); a new course in summer only with the
//     Dean's approval; summer up to the policy limit (9), or 12 with the Program Lead's approval;
//   • each term within the load typed in and the registration policy (low CGPA, final year);
//   • and, if the plan runs into an extra term, the load is spread evenly over the last terms instead of leaving one
//     course alone at the end.
// Everything here is pure computation over loaded data; nothing is written until the plan is applied.

const pdb = prisma as unknown as Record<string, any>;
export const PLANNER_HINT = "The planner's own tables need prisma/migration_degree_planner.sql — run it in Supabase.";
const up = (s: string) => s.trim().toUpperCase();
const MAX_TERMS = 24;
export const LOW_GRADE_POINTS = 2.0;

/* ---------------- Terms ---------------- */

export type Term = { key: string; label: string; summer: boolean; reg: number }; // reg: regular-term index (Spring before a summer)
const regOf = (name: string, year: number) => termIndex(name, year);
const regName = (i: number) => (i % 2 === 0 ? { name: "Fall", year: i / 2 } : { name: "Spring", year: (i + 1) / 2 });
export function termOfReg(i: number): Term { const t = regName(i); return { key: `${t.year}-${t.name === "Fall" ? "FA" : "SP"}`, label: `${t.name} ${t.year}`, summer: false, reg: i }; }
export function summerAfter(i: number): Term { const t = regName(i); return { key: `${t.year}-SU`, label: `Summer ${t.year}`, summer: true, reg: i }; }
/** Terms from `startReg` on: Fall, Spring, Summer, Fall, ... */
export function timeline(startReg: number, startWithSummer = false): Term[] {
  const out: Term[] = [];
  let i = startReg;
  if (startWithSummer) out.push(summerAfter(i)), (i += 1);
  while (out.length < MAX_TERMS) {
    out.push(termOfReg(i));
    if (regName(i).name === "Spring") out.push(summerAfter(i));
    i++;
  }
  return out;
}

/* ---------------- Input ---------------- */

export type PlanCourse = { id: string; code: string; title: string; credits: number; sem: number; prereq: string | null; type: string };
export type Offering = { reg: number; batch: string; own: boolean; projected: boolean };
export type Requests = { summerLoad: Record<string, number>; ahead: Set<string>; summerNew: Set<string> }; // ahead/summerNew keys: CODE
export type PlanInput = {
  studentId: string; name: string; roll: string; program: string;
  startReg: number; startWithSummer: boolean; studentSemAtStart: number; programSemesters: number; expectedEndReg: number;
  courses: PlanCourse[];          // still needed (not passed), plus planned improvements
  attempted: Set<string>;         // codes attempted before (summer allowed)
  retake: Set<string>;            // codes failed or below LOW_GRADE_POINTS (repeat)
  done: Set<string>;              // passed codes (prerequisites met)
  inProgress: Set<string>;        // codes being taken now (count as done for later terms)
  offerings: Map<string, Offering[]>;
  policy: Policy; lowCgpa: boolean; cgpa: number | null;
  requests: Requests;
  loads: Record<string, number>;  // termKey -> max credit hours wanted
};

export type Placed = { courseId: string; code: string; title: string; credits: number; termKey: string; batch: string; own: boolean; projected: boolean; retake: boolean; ahead: boolean; summer: boolean };
export type PlanResult = {
  terms: { key: string; label: string; summer: boolean; studentSem: number | null; cap: number; credits: number; courses: Placed[] }[];
  unplaced: { code: string; title: string; why: string }[];
  finishLabel: string | null; finishReg: number | null; expectedLabel: string; lateTerms: number; balanced: boolean;
};

/** Default load cap for a term (before what the advisor typed). */
export function policyCap(inp: PlanInput, t: Term, studentSem: number | null) {
  const p = inp.policy;
  if (t.summer) return inp.requests.summerLoad[t.key] ?? p.maxCreditsSummer;
  if (inp.lowCgpa) return p.maxCreditsLowCgpa;
  if (studentSem !== null && studentSem >= inp.programSemesters - 1) return p.maxCreditsFinalYear;
  return p.maxCreditsNormal;
}

/* ---------------- The planner ---------------- */

function run(inp: PlanInput, terms: Term[], capOverride: number | null, extra?: { code: string; reg: number; summer: boolean; only?: boolean }) {
  const byCode = new Map(inp.courses.map((c) => [up(c.code), c]));
  const prereqCode = (c: PlanCourse) => (c.prereq ? up(c.prereq) : null);
  // Chain length from a course to the end (longer chains go first so they don't push the finish later).
  const depth = new Map<string, number>();
  const posts = new Map<string, string[]>();
  for (const c of inp.courses) { const p = prereqCode(c); if (p && byCode.has(p)) posts.set(p, [...(posts.get(p) || []), up(c.code)]); }
  const d = (code: string, seen = new Set<string>()): number => {
    if (depth.has(code)) return depth.get(code)!;
    if (seen.has(code)) return 1;
    seen.add(code);
    const v = 1 + Math.max(0, ...(posts.get(code) || []).map((x) => d(x, seen)));
    depth.set(code, v); return v;
  };
  const left = new Set(inp.courses.map((c) => up(c.code)));
  const doneAt = new Map<string, number>(); // code -> position in the timeline when finished
  const out: PlanResult["terms"] = [];
  let studentSem = inp.studentSemAtStart - 1;
  let lastPos = -1;
  terms.forEach((t, pos) => {
    if (!t.summer) studentSem++;
    const semNow = t.summer ? studentSem : studentSem; // a summer belongs to the semester before it
    const typed = inp.loads[t.key];
    const pc = policyCap(inp, t, t.summer ? null : semNow);
    let cap = typed !== undefined ? Math.min(typed, pc) : t.summer ? 0 : pc;
    if (capOverride !== null && !t.summer) cap = Math.min(cap, capOverride);
    const placed: Placed[] = [];
    let credits = 0, newCount = 0;
    const cands = inp.courses.filter((c) => left.has(up(c.code))).sort((a, b) =>
      Number(!inp.retake.has(up(a.code))) - Number(!inp.retake.has(up(b.code))) || d(up(b.code)) - d(up(a.code)) || a.sem - b.sem || a.code.localeCompare(b.code));
    for (const c of cands) {
      const code = up(c.code);
      const p = prereqCode(c);
      if (p && byCode.has(p) && !inp.done.has(p) && !inp.inProgress.has(p)) {
        const at = doneAt.get(p);
        if (at === undefined || (at >= pos && !inp.policy.allowConcurrentPrereq) || at > pos) continue;
      }
      // Offering in this term.
      let off: Offering | null = null;
      if (t.summer) {
        const isExtra = extra && extra.summer && extra.code === code && extra.reg === t.reg;
        if (extra?.only && extra.summer && extra.reg === t.reg && !isExtra) continue; // trying one extra summer section: nothing else in it
        if (!isExtra && !inp.attempted.has(code) && !inp.requests.summerNew.has(code)) continue; // summer: repeats only, unless the Dean allowed
        off = { reg: t.reg, batch: isExtra ? "Extra summer section" : "Summer section", own: false, projected: false };
      } else {
        const offs = (inp.offerings.get(code) || []).filter((o) => o.reg === t.reg);
        off = offs.find((o) => o.own) || offs.find((o) => !o.projected) || offs[0] || null;
        if (!off && extra && !extra.summer && extra.code === code && extra.reg === t.reg) off = { reg: t.reg, batch: "Extra section", own: false, projected: false };
        if (!off) continue;
      }
      // Not before its own semester, unless approved.
      const ahead = c.sem > semNow && !inp.attempted.has(code);
      if (ahead && !inp.requests.ahead.has(code)) continue;
      const isNew = !inp.attempted.has(code);
      if (inp.lowCgpa && isNew && newCount >= inp.policy.maxNewCoursesLowCgpa) continue;
      if (credits + c.credits > cap) continue;
      credits += c.credits; if (isNew) newCount++;
      left.delete(code); doneAt.set(code, pos);
      placed.push({ courseId: c.id, code: c.code, title: c.title, credits: c.credits, termKey: t.key, batch: off.batch, own: off.own, projected: off.projected, retake: inp.retake.has(code), ahead, summer: t.summer });
    }
    if (placed.length) lastPos = pos;
    out.push({ key: t.key, label: t.label, summer: t.summer, studentSem: t.summer ? null : semNow, cap, credits, courses: placed });
  });
  const unplaced = inp.courses.filter((c) => left.has(up(c.code))).map((c) => {
    const p = prereqCode(c);
    const why = !(inp.offerings.get(up(c.code)) || []).length ? "not taught to any batch in the coming terms (not in today's curriculum)"
      : p && byCode.has(p) && left.has(p) ? `waits for ${p}`
      : c.sem > inp.studentSemAtStart + 10 ? "beyond the planning window" : "no room in the loads given — raise a term's load";
    return { code: c.code, title: c.title, why };
  });
  const trimmed = out.slice(0, Math.max(0, lastPos + 1));
  const finish = lastPos >= 0 ? terms[lastPos] : null;
  return { terms: trimmed, unplaced, finishPos: lastPos, finish };
}

/** Spread the load when the plan ends with a light term: move courses from the heaviest terms to later, lighter terms
 * (up to the finishing term) where that course is also taught and its prerequisites and the courses that need it
 * still come in the right order. The finishing term never moves. */
function spread(inp: PlanInput, terms: PlanResult["terms"]) {
  const regIdx = terms.map((t, i) => ({ t, i })).filter((x) => !x.t.summer);
  if (regIdx.length < 2) return false;
  const last = regIdx[regIdx.length - 1].t;
  if (last.credits >= Math.min(...regIdx.slice(0, -1).map((x) => x.t.credits).filter((c) => c > 0))) return false;
  const posOf = (code: string) => terms.findIndex((t) => t.courses.some((c) => up(c.code) === code));
  const prereqOf = new Map(inp.courses.map((c) => [up(c.code), c.prereq ? up(c.prereq) : null]));
  const dependents = (code: string) => inp.courses.filter((c) => c.prereq && up(c.prereq) === code).map((c) => up(c.code));
  let moved = false;
  for (let iter = 0; iter < 300; iter++) {
    let did = false;
    const heavy = regIdx.slice().sort((a, b) => b.t.credits - a.t.credits);
    outer: for (const h of heavy) {
      // Retakes stay early (they lift the CGPA soonest); move the other courses first.
      for (const c of h.t.courses.slice().sort((a, b) => Number(a.retake) - Number(b.retake) || b.credits - a.credits)) {
        const code = up(c.code);
        for (const l of regIdx) {
          if (l.i <= h.i || l.t.credits + c.credits > h.t.credits - c.credits || l.t.credits + c.credits > l.t.cap) continue;
          const off = (inp.offerings.get(code) || []).filter((o) => o.reg === keyReg(l.t.key));
          if (!off.length) continue;
          if (dependents(code).some((d) => { const p = posOf(d); return p >= 0 && (p < l.i || (p === l.i && !inp.policy.allowConcurrentPrereq)); })) continue;
          const pq = prereqOf.get(code);
          if (pq) { const p = posOf(pq); if (p >= l.i) continue; }
          if (inp.lowCgpa && !inp.attempted.has(code) && l.t.courses.filter((x) => !inp.attempted.has(up(x.code))).length >= inp.policy.maxNewCoursesLowCgpa) continue;
          const o = off.find((x) => x.own) || off.find((x) => !x.projected) || off[0];
          h.t.courses = h.t.courses.filter((x) => x !== c); h.t.credits -= c.credits;
          l.t.courses.push({ ...c, termKey: l.t.key, batch: o.batch, own: o.own, projected: o.projected });
          l.t.credits += c.credits;
          did = moved = true;
          break outer;
        }
      }
    }
    if (!did) break;
  }
  return moved;
}
const keyReg = (key: string) => { const [y, t] = key.split("-"); return regOf(t === "FA" ? "Fall" : "Spring", Number(y)); };

export function planDegree(inp: PlanInput, opts: { balance?: boolean; extra?: { code: string; reg: number; summer: boolean; only?: boolean } } = {}): PlanResult {
  const terms = timeline(inp.startReg, inp.startWithSummer);
  const best = run(inp, terms, null, opts.extra);
  const balanced = opts.balance !== false && best.finishPos >= 0 && !best.unplaced.length ? spread(inp, best.terms) : false;
  const finishReg = best.finish ? best.finish.reg : null;
  const late = finishReg !== null ? Math.max(0, finishReg - inp.expectedEndReg) : 0;
  return {
    terms: best.terms, unplaced: best.unplaced,
    finishLabel: best.finish?.label || null, finishReg, expectedLabel: termOfReg(inp.expectedEndReg).label, lateTerms: late, balanced,
  };
}

/* ---------------- Loading ---------------- */

/** Offerings of each course code: existing batches of the program at the semester their curriculum has it, and the
 * expected future batches (each intake, every year) following the newest batch's curriculum. */
export async function programOfferings(coordinatorIds: string[], program: string, fromReg: number, ownBatchId: string | null) {
  const batches = await prisma.batch.findMany({ where: { coordinatorId: { in: coordinatorIds.concat(["none"]) }, degreeProgram: program }, select: { id: true, batchName: true, startTerm: true, startYear: true } });
  const regular = batches.filter((b) => /fall|spring/i.test(b.startTerm));
  const courses = await prisma.course.findMany({ where: { batchId: { in: regular.map((b) => b.id).concat(["none"]) } }, select: { code: true, semesterNumber: true, batchId: true } });
  const startOf = new Map(regular.map((b) => [b.id, regOf(/fall/i.test(b.startTerm) ? "Fall" : "Spring", b.startYear)]));
  const newest = regular.slice().sort((a, b) => startOf.get(b.id)! - startOf.get(a.id)!)[0] || null;
  const intakes = new Set<number>(regular.map((b) => (/fall/i.test(b.startTerm) ? 0 : 1))); // reg % 2: Fall 0, Spring 1
  if (!intakes.size) intakes.add(0);
  const out = new Map<string, Offering[]>();
  const add = (code: string, o: Offering) => { const k = up(code); if (o.reg < fromReg) return; const xs = out.get(k) || []; if (!xs.some((x) => x.reg === o.reg && x.batch === o.batch)) xs.push(o); out.set(k, xs); };
  for (const c of courses) {
    if (!c.semesterNumber || !c.batchId) continue;
    const b = regular.find((x) => x.id === c.batchId)!;
    add(c.code, { reg: startOf.get(b.id)! + c.semesterNumber - 1, batch: `${program} — ${b.batchName}`, own: b.id === ownBatchId, projected: false });
  }
  // Expected batches after the newest one, on today's curriculum.
  if (newest) {
    const curr = courses.filter((c) => c.batchId === newest.id && c.semesterNumber);
    const latest = Math.max(...Array.from(startOf.values()));
    for (let s = latest + 1; s <= fromReg + MAX_TERMS; s++) {
      if (!intakes.has(((s % 2) + 2) % 2)) continue;
      if (regular.some((b) => startOf.get(b.id) === s)) continue;
      const t = regName(s);
      for (const c of curr) add(c.code, { reg: s + c.semesterNumber! - 1, batch: `${program} — ${t.name} ${t.year} intake (expected)`, own: false, projected: true });
    }
  }
  return { offerings: out, intakes: Array.from(intakes).map((x) => (x === 0 ? "Fall" : "Spring")), newestBatchId: newest?.id || null };
}

export async function planRequests(studentId: string): Promise<Requests> {
  const r: Requests = { summerLoad: {}, ahead: new Set(), summerNew: new Set() };
  try {
    const rows = (await pdb.planRequest.findMany({ where: { studentId, status: "APPROVED" } })) as { kind: string; courseCode: string | null; termKey: string | null; value: number | null }[];
    for (const x of rows) {
      if (x.kind === "SUMMER_LOAD" && x.termKey) r.summerLoad[x.termKey] = x.value || 12;
      if (x.kind === "AHEAD" && x.courseCode) r.ahead.add(up(x.courseCode));
      if (x.kind === "SUMMER_NEW" && x.courseCode) r.summerNew.add(up(x.courseCode));
    }
  } catch { /* not migrated */ }
  return r;
}

export async function savedLoads(studentId: string): Promise<Record<string, number>> {
  try { const row = await pdb.planLoad.findUnique({ where: { studentId } }); return row ? JSON.parse(row.loadsJson || "{}") : {}; } catch { return {}; }
}
export async function saveLoads(studentId: string, loads: Record<string, number>, by: string) {
  await pdb.planLoad.upsert({ where: { studentId }, create: { id: randomUUID(), studentId, loadsJson: JSON.stringify(loads), updatedById: by, updatedAt: new Date() }, update: { loadsJson: JSON.stringify(loads), updatedById: by, updatedAt: new Date() } });
}

/** Everything the planner needs about one student. */
export async function loadPlanInput(studentId: string, shared?: { offerings: Map<string, Offering[]>; policy: Policy; current: { termName: string; year: number } | null }): Promise<PlanInput | null> {
  const s = await prisma.student.findUnique({ where: { id: studentId }, include: { batch: { include: { coordinator: { select: { managedById: true } } } } } });
  if (!s?.batch) return null;
  const b = s.batch;
  const chairmanId = b.coordinator?.managedById || "";
  const [records, courses, enrolled, ct, policy, cgpa, requests, loads] = await Promise.all([
    prisma.studentTranscriptRecord.findMany({ where: { studentId }, select: { courseCode: true, gpaPoints: true, grade: true } }),
    prisma.course.findMany({ where: { batchId: b.id }, select: { id: true, code: true, title: true, creditHours: true, semesterNumber: true, isNonCredit: true, courseType: true, prerequisiteCourse: { select: { code: true } } } }),
    prisma.studentEnrollment.findMany({ where: { studentId, status: { not: "WITHDRAWN" }, course: { isOffered: true } }, select: { course: { select: { code: true } } } }),
    shared ? Promise.resolve(shared.current) : prisma.currentTerm.findUnique({ where: { coordinatorId: b.coordinatorId }, select: { termName: true, year: true } }),
    shared ? Promise.resolve(shared.policy) : getPolicy(chairmanId),
    computeCgpa(studentId),
    planRequests(studentId),
    savedLoads(studentId),
  ]);
  const best = new Map<string, number>();
  for (const r of records) { const k = up(r.courseCode); const gp = (r.grade === "P" || r.grade === "TR" || r.grade === "IT") ? 4 : r.gpaPoints ?? 0; best.set(k, Math.max(best.get(k) ?? -1, gp)); }
  const done = new Set(Array.from(best.entries()).filter(([, gp]) => gp > 0).map(([k]) => k));
  const retake = new Set(Array.from(best.entries()).filter(([, gp]) => gp < LOW_GRADE_POINTS).map(([k]) => k));
  const attempted = new Set(best.keys());
  const inProgress = new Set(enrolled.map((e) => up(e.course.code)));
  // Improvements the advisor planned (a passed low grade with a plan entry) stay in; other passed courses drop out.
  const planned = new Set((await prisma.degreePlanEntry.findMany({ where: { studentId }, select: { course: { select: { code: true } } } })).map((e) => up(e.course.code)));
  const need = courses.filter((c) => !inProgress.has(up(c.code)) && (!done.has(up(c.code)) || (retake.has(up(c.code)) && planned.has(up(c.code)))));
  // Start: the current term if nothing is registered yet, else the term after it.
  const now = ct ? regOf(/fall/i.test(ct.termName) ? "Fall" : "Spring", ct.year) : regOf(new Date().getMonth() >= 7 ? "Fall" : "Spring", new Date().getFullYear());
  const isSummerNow = !!ct && /summer/i.test(ct.termName);
  const registered = inProgress.size > 0;
  const startReg = isSummerNow ? now + 1 : registered ? (regName(now).name === "Spring" ? now : now + 1) : now;
  const startWithSummer = !isSummerNow && registered && regName(now).name === "Spring";
  const studentSemAtStart = s.currentSemesterNumber + (registered || isSummerNow ? 1 : 0);
  const programSemesters = Math.max(8, ...courses.map((c) => c.semesterNumber || 0));
  const bStart = regOf(/fall/i.test(b.startTerm) ? "Fall" : "Spring", b.startYear);
  const coordinatorIds = (await prisma.user.findMany({ where: { role: "PROGRAM_COORDINATOR", managedById: chairmanId }, select: { id: true } })).map((u) => u.id);
  const offerings = shared?.offerings || (await programOfferings(coordinatorIds.length ? coordinatorIds : [b.coordinatorId], b.degreeProgram, startReg, b.id)).offerings;
  return {
    studentId, name: s.name, roll: s.rollNumber, program: b.degreeProgram,
    startReg, startWithSummer, studentSemAtStart, programSemesters, expectedEndReg: bStart + programSemesters - 1,
    courses: need.map((c) => ({ id: c.id, code: c.code, title: c.title, credits: c.isNonCredit ? 0 : c.creditHours, sem: c.semesterNumber || 1, prereq: c.prerequisiteCourse?.code || null, type: c.courseType })),
    attempted, retake, done, inProgress, offerings, policy, lowCgpa: cgpa !== null && cgpa < policy.lowCgpaThreshold, cgpa, requests, loads,
  };
}

/* ---------------- Applying a plan ---------------- */

/** Write a plan into the degree plan (the semester each course is planned for), remembering the term, the batch and
 * who suggested it (SYSTEM, STUDENT or ADVISOR). A summer course is filed with the semester before it. */
export async function applyPlan(inp: PlanInput, res: PlanResult, source: "SYSTEM" | "STUDENT" | "ADVISOR", by: string) {
  let n = 0;
  for (const t of res.terms) {
    const semNumber = t.studentSem ?? res.terms.slice(0, res.terms.indexOf(t)).reverse().find((x) => x.studentSem !== null)?.studentSem ?? inp.studentSemAtStart - 1;
    for (const c of t.courses) {
      await prisma.degreePlanEntry.upsert({ where: { studentId_courseId: { studentId: inp.studentId, courseId: c.courseId } }, update: { plannedSemesterNumber: Math.max(1, semNumber) }, create: { studentId: inp.studentId, courseId: c.courseId, plannedSemesterNumber: Math.max(1, semNumber) } });
      await setMeta(inp.studentId, c.courseId, { termKey: t.key, batch: c.batch, source, summer: t.summer }, by);
      n++;
    }
  }
  return n;
}

export async function setMeta(studentId: string, courseId: string, m: { termKey?: string | null; batch?: string | null; source: string; summer?: boolean }, by: string) {
  try {
    await pdb.planEntryMeta.upsert({
      where: { studentId_courseId: { studentId, courseId } },
      create: { id: randomUUID(), studentId, courseId, termKey: m.termKey || null, batchLabel: m.batch || null, source: m.source, summer: !!m.summer, updatedById: by, updatedAt: new Date() },
      update: { termKey: m.termKey || null, batchLabel: m.batch || null, source: m.source, summer: !!m.summer, updatedById: by, updatedAt: new Date() },
    });
  } catch { /* not migrated */ }
}

export async function planMeta(studentId: string): Promise<Map<string, { termKey: string | null; batchLabel: string | null; source: string; summer: boolean }>> {
  try {
    const rows = (await pdb.planEntryMeta.findMany({ where: { studentId } })) as { courseId: string; termKey: string | null; batchLabel: string | null; source: string; summer: boolean }[];
    return new Map(rows.map((r) => [r.courseId, r]));
  } catch { return new Map(); }
}
