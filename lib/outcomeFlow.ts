import { unstable_cache } from "next/cache";
import { prisma } from "./db";
import { batchPloWeights, wdb } from "./ploWeights";
import { weightedAttainment, equalWeights, cohortWeights, TARGET_PCT } from "./ploWeightMath";
import { getPassingCriteria } from "./passingCriteria";
import { coordinatorIdsFor } from "./reportScope";
import { termIndex } from "./termLogic";

// Outcome Flow: Assessments -> CLOs -> Courses -> PLOs -> PEOs for a batch, with the weight on every link and the
// attainment (% of students reaching the target) on every box. Course->PLO weights (per batch) and PLO->PEO weights
// (per program) are the OMC's; lower levels come from the course plan and are only shown.

export type PeoRow = { coordinatorId: string; degreeProgram: string; peoIndex: number; ploNumber: number; weightPct: number };
export const FLOW_VIEW_ROLES = ["OMC", "CHAIRMAN", "HEAD_OF_DEPARTMENT", "DEAN", "PROGRAM_COORDINATOR", "DEPARTMENT_COORDINATOR"];

/** May this user see this batch's flow? (OMC / heads / program leads within their scope.) */
export async function canViewBatch(user: { id: string; role: string; managedById: string | null; departmentId?: string | null; facultyId?: string | null }, coordinatorId: string) {
  if (!FLOW_VIEW_ROLES.includes(user.role)) return false;
  return (await coordinatorIdsFor(user)).includes(coordinatorId);
}

export async function peosOf(coordinatorId: string, degreeProgram: string): Promise<string[]> {
  return (await programPeos(coordinatorId, degreeProgram)).peos;
}

/** The program's PEOs, and which PLOs the Program Lead said serve each (Program Profile, "PEO1": [1, 3]). */
export async function programPeos(coordinatorId: string, degreeProgram: string) {
  const p = await prisma.programProfile.findUnique({ where: { coordinatorId_degreeProgram: { coordinatorId, degreeProgram } } }) as { peos?: string | null; peoPloJson?: string | null } | null;
  let peos: string[] = [], peoPlo: Record<string, number[]> = {};
  try { const v = JSON.parse(p?.peos || "[]"); peos = Array.isArray(v) ? v.map((x) => String(typeof x === "string" ? x : (x as { text?: string; title?: string })?.text || (x as { title?: string })?.title || "")).filter(Boolean) : []; } catch { peos = []; }
  try { peoPlo = JSON.parse(p?.peoPloJson || "{}"); } catch { peoPlo = {}; }
  return { peos, peoPlo };
}

export async function peoWeightsOf(coordinatorId: string, degreeProgram: string) {
  try { return { rows: (await wdb.programPeoWeight.findMany({ where: { coordinatorId, degreeProgram } })) as PeoRow[], missing: false }; } catch { return { rows: [] as PeoRow[], missing: true }; }
}

/** The whole batch: courses, PLOs (weights + weighted attainment), PEOs (weights + attainment). */
export async function batchFlow(batchId: string) {
  const batch = await prisma.batch.findUnique({ where: { id: batchId }, select: { id: true, degreeProgram: true, batchName: true, coordinatorId: true, startTerm: true, startYear: true, coordinator: { select: { managedById: true } } } });
  if (!batch) return null;
  const criteria = await getPassingCriteria(batch.coordinator.managedById);
  const [w, prof, peoW] = await Promise.all([batchPloWeights(batchId, true, criteria), programPeos(batch.coordinatorId, batch.degreeProgram), peoWeightsOf(batch.coordinatorId, batch.degreeProgram)]);
  const peos = prof.peos;
  const plos = w.plos.map((p) => {
    const weights = Object.fromEntries(p.courses.map((c) => [c.id, c.weight]));
    const att = Object.fromEntries(p.courses.map((c) => [c.id, c.attainment]));
    return { ...p, attainment: weightedAttainment(weights, att) };
  });
  const courses = new Map<string, { id: string; code: string; title: string; courseType: string; creditHours: number; semesterNumber: number | null; family: string }>();
  for (const p of plos) for (const c of p.courses) courses.set(c.id, { id: c.id, code: c.code, title: c.title, courseType: c.courseType, creditHours: c.creditHours, semesterNumber: c.semesterNumber, family: c.family });
  const ploByNumber = new Map(plos.map((p) => [p.number, p]));
  const peoList = peos.map((text, i) => {
    let links = peoW.rows.filter((r) => r.peoIndex === i && ploByNumber.has(r.ploNumber)).map((r) => ({ ploNumber: r.ploNumber, weight: r.weightPct }));
    // No weights set by the OMC yet: start from the Program Lead's PEO-PLO alignment (Program Profile), equal split.
    const fromProfile = !links.length && (prof.peoPlo[`PEO${i + 1}`] || []).some((n) => ploByNumber.has(Number(n)));
    if (fromProfile) {
      const nums = Array.from(new Set((prof.peoPlo[`PEO${i + 1}`] || []).map(Number).filter((n) => ploByNumber.has(n))));
      const eq = equalWeights(nums.map((n) => ({ id: String(n), courseType: "", creditHours: 1 })));
      links = nums.map((n) => ({ ploNumber: n, weight: eq[String(n)] }));
    }
    const attainment = weightedAttainment(Object.fromEntries(links.map((l) => [String(l.ploNumber), l.weight])), Object.fromEntries(links.map((l) => [String(l.ploNumber), ploByNumber.get(l.ploNumber)?.attainment ?? null])));
    return { index: i, text, links, attainment, fromProfile };
  });
  return {
    batch: { id: batch.id, label: `${batch.degreeProgram} — ${batch.batchName}`, coordinatorId: batch.coordinatorId, degreeProgram: batch.degreeProgram, startTerm: batch.startTerm, startYear: batch.startYear },
    criteria, target: TARGET_PCT, missing: w.missing || peoW.missing,
    courses: Array.from(courses.values()).sort((a, b) => (a.semesterNumber ?? 99) - (b.semesterNumber ?? 99) || a.code.localeCompare(b.code)),
    plos, peos: peoList,
  };
}

/** One course's chain: its assessments, CLOs (weight in the course, attainment) and the PLO each CLO serves.
 * Uses the Instructor's copy when there is one (that is where marks are), else the Subject Expert's plan. */
export async function courseChain(courseId: string, forceSource?: "SE" | "INSTRUCTOR") {
  const course = await prisma.course.findUnique({ where: { id: courseId }, select: { id: true, code: true, title: true, creditHours: true, batchId: true, coordinatorId: true, subjectExpertId: true, instructorId: true, coordinator: { select: { managedById: true } } } });
  if (!course) return null;
  const hasIns = forceSource ? forceSource === "INSTRUCTOR" : (await prisma.cLO.count({ where: { courseId, source: "INSTRUCTOR" } })) > 0;
  const source = hasIns ? "INSTRUCTOR" : "SE";
  const criteria = await getPassingCriteria(course.coordinator.managedById);
  const [clos, insts, links, marks, enrolled] = await Promise.all([
    prisma.cLO.findMany({ where: { courseId, source }, orderBy: { orderIndex: "asc" }, select: { id: true, code: true, statement: true, bloomLevel: true, ploContributionPct: true, targetPct: true, mappedPlo: { select: { number: true } } } }),
    prisma.assessmentInstrument.findMany({ where: { courseId, source }, select: { id: true, type: true, label: true, marksPct: true, maxScore: true } }),
    prisma.lectureRowInstrument.findMany({ where: { instrument: { courseId, source } }, select: { instrumentId: true, lectureRow: { select: { cloId: true } } } }),
    source === "INSTRUCTOR" ? prisma.studentMark.findMany({ where: { courseId }, select: { studentId: true, instrumentId: true, score: true } }) : Promise.resolve([]),
    prisma.studentEnrollment.count({ where: { courseId, status: { not: "WITHDRAWN" } } }),
  ]);
  // Each assessment counts toward the first CLO its lectures serve (same rule as the result calculation).
  const toClo = new Map<string, string>();
  for (const l of links) if (l.lectureRow.cloId && !toClo.has(l.instrumentId)) toClo.set(l.instrumentId, l.lectureRow.cloId);
  const cloPassPct = new Map<string, number>(), cloAvg = new Map<string, number>();
  if (marks.length) {
    const { computeCloPloPassRates, computeResultMate } = await import("./resultMate");
    const [r, mate] = await Promise.all([computeCloPloPassRates(courseId, criteria).catch(() => null), computeResultMate(courseId).catch(() => null)]);
    if (r && r.studentCount) for (const s of r.cloStats) if (s.maxWeight > 0) {
      cloPassPct.set(s.code, Math.round((1000 * s.passCount) / r.studentCount) / 10);
      if (mate?.rows.length) cloAvg.set(s.code, Math.round((1000 * mate.rows.reduce((t, row) => t + (row.byClo[s.code] || 0), 0)) / mate.rows.length / s.maxWeight) / 10);
    }
  }
  const byInst = new Map<string, number[]>();
  for (const m of marks) byInst.set(m.instrumentId, [...(byInst.get(m.instrumentId) || []), m.score]);
  const assessed = insts.reduce((s, i) => s + (toClo.has(i.id) ? i.marksPct : 0), 0) || 1;
  const assessments = insts.map((i) => {
    const sc = byInst.get(i.id) || [];
    const avg = sc.length && i.maxScore ? Math.round((1000 * sc.reduce((a, b) => a + b, 0)) / sc.length / i.maxScore) / 10 : null;
    const reached = sc.length && i.maxScore ? Math.round((1000 * sc.filter((v) => v / i.maxScore >= criteria.cloPct / 100).length) / sc.length) / 10 : null;
    return { id: i.id, type: i.type, label: i.label, marksPct: i.marksPct, cloId: toClo.get(i.id) || null, avg, reached, graded: sc.length };
  });
  // Performance-weighted view (for comparison only; reports keep the planned weights): within each CLO, an assessment the
  // class did better on counts more, by the ratio of its class average to the CLO's mean, held between 0.5x and 1.5x.
  const perfShare = new Map<string, number>(), perfAtt = new Map<string, number>();
  for (const c of clos) {
    const items = assessments.filter((a) => a.cloId === c.id && a.avg !== null);
    if (!items.length) continue;
    const mean = items.reduce((t, a) => t + (a.avg as number), 0) / items.length || 1;
    const raw = items.map((a) => ({ a, w: a.marksPct * Math.min(1.5, Math.max(0.5, (a.avg as number) / mean)) }));
    const tot = raw.reduce((t, x) => t + x.w, 0) || 1;
    for (const x of raw) perfShare.set(x.a.id, Math.round((1000 * x.w) / tot) / 10);
    const maxOf = new Map(insts.map((i) => [i.id, i.maxScore]));
    const per = new Map<string, { got: number; w: number }>();
    for (const m of marks as { studentId: string; instrumentId: string; score: number }[]) {
      const x = raw.find((y) => y.a.id === m.instrumentId); if (!x) continue;
      const e = per.get(m.studentId) || { got: 0, w: 0 };
      e.got += (x.w * m.score) / (maxOf.get(m.instrumentId) || 1); e.w += x.w; per.set(m.studentId, e);
    }
    const vals = Array.from(per.values());
    if (vals.length) perfAtt.set(c.id, Math.round((1000 * vals.filter((v) => v.w && v.got / v.w >= criteria.cloPct / 100).length) / vals.length) / 10);
  }
  return {
    course: { id: course.id, code: course.code, title: course.title, creditHours: course.creditHours, batchId: course.batchId, coordinatorId: course.coordinatorId, subjectExpertId: course.subjectExpertId, instructorId: course.instructorId },
    source, enrolled, criteria,
    clos: clos.map((c) => {
      const w = assessments.filter((a) => a.cloId === c.id).reduce((s, a) => s + a.marksPct, 0);
      return { id: c.id, code: c.code, statement: c.statement, bloom: c.bloomLevel, ploNumber: c.mappedPlo?.number ?? null, contribution: c.ploContributionPct ?? null, target: c.targetPct, weight: Math.round((1000 * w) / assessed) / 10, attainment: cloPassPct.get(c.code) ?? null, avg: cloAvg.get(c.code) ?? null, perfAttainment: perfAtt.get(c.id) ?? null, order: clos.indexOf(c) };
    }),
    assessments: assessments.map((a) => ({ ...a, perfShare: perfShare.get(a.id) ?? null, share: a.cloId ? Math.round((1000 * a.marksPct) / Math.max(1, assessments.filter((x) => x.cloId === a.cloId).reduce((s, x) => s + x.marksPct, 0))) / 10 : 0 })),
  };
}

/** Last batch of the same program: its PLO results and, for each PLO it did not reach, suggested weights for this batch. */
export async function cohortSuggestion(batchId: string) {
  const b = await prisma.batch.findUnique({ where: { id: batchId }, select: { coordinatorId: true, degreeProgram: true, startTerm: true, startYear: true, coordinator: { select: { managedById: true } } } });
  if (!b) return null;
  const all = await prisma.batch.findMany({ where: { coordinatorId: b.coordinatorId, degreeProgram: b.degreeProgram }, select: { id: true, batchName: true, startTerm: true, startYear: true } });
  const mine = termIndex(b.startTerm, b.startYear);
  const prev = all.filter((x) => termIndex(x.startTerm, x.startYear) < mine).sort((x, y) => termIndex(y.startTerm, y.startYear) - termIndex(x.startTerm, x.startYear))[0];
  if (!prev) return { prevLabel: null, plos: {} as Record<string, { last: number | null; suggested: Record<string, number> | null }> };
  const criteria = await getPassingCriteria(b.coordinator.managedById);
  const [now, last] = await Promise.all([batchPloWeights(batchId, false), batchPloWeights(prev.id, true, criteria)]);
  const out: Record<string, { last: number | null; suggested: Record<string, number> | null }> = {};
  for (const p of now.plos) {
    const lp = last.plos.find((x) => x.number === p.number);
    const lastAtt = lp ? weightedAttainment(Object.fromEntries(lp.courses.map((c) => [c.id, c.weight])), Object.fromEntries(lp.courses.map((c) => [c.id, c.attainment]))) : null;
    let suggested: Record<string, number> | null = null;
    if (lastAtt !== null && lastAtt < TARGET_PCT && p.courses.length > 1) {
      const byCode = new Map((lp?.courses || []).map((c) => [c.code, c.attainment]));
      suggested = cohortWeights(p.courses.map((c) => ({ id: c.id, courseType: c.courseType, creditHours: c.creditHours })), p.number, Object.fromEntries(p.courses.map((c) => [c.id, byCode.get(c.code) ?? null])));
    }
    out[p.id] = { last: lastAtt, suggested };
  }
  return { prevLabel: `${b.degreeProgram} — ${prev.batchName}`, plos: out };
}

export { equalWeights };

/** batchFlow kept for 5 minutes (it computes attainment for every course); weight changes clear it at once. */
export const OUTCOME_FLOW_TAG = "outcome-flow";
export const cachedBatchFlow = (batchId: string) => unstable_cache(() => batchFlow(batchId), ["outcome-flow-batch", batchId], { revalidate: 300, tags: [OUTCOME_FLOW_TAG] })();
