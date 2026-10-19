import { randomUUID } from "crypto";
import { prisma } from "./db";
import { getPolicy } from "./registrationRules";
import { loadPlanInput, planDegree, programOfferings, timeline, type PlanInput } from "./degreePlanner";

// Which extra sections to run so students finish with their batch. For every student of a program who is behind (a
// failed, withdrawn or dropped course, or held back), the degree plan is worked out as it stands; then, for each course
// that ends up after the batch's last term (or can't be placed at all), the plan is tried again with an extra section of
// it in each of the coming terms (summers included). Where that makes the student finish earlier, the student counts
// for that extra section. Sections that would help at least the institute's minimum class size are suggested.

const xdb = prisma as unknown as Record<string, any>;
export const DEFAULT_MIN_CLASS = 5;

export async function minClass(chairmanId: string): Promise<number> {
  try { const r = await xdb.planSetting.findUnique({ where: { chairmanId } }); return r?.minExtraClass ?? DEFAULT_MIN_CLASS; } catch { return DEFAULT_MIN_CLASS; }
}
export async function setMinClass(chairmanId: string, n: number) {
  await xdb.planSetting.upsert({ where: { chairmanId }, create: { id: randomUUID(), chairmanId, minExtraClass: n, updatedAt: new Date() }, update: { minExtraClass: n, updatedAt: new Date() } });
}

export type Suggestion = { code: string; title: string; termKey: string; termLabel: string; summer: boolean; students: { id: string; name: string; roll: string; before: string; after: string }[] };

export async function extraCourseSuggestions(chairmanId: string, coordinatorIds: string[], program: string) {
  const batches = await prisma.batch.findMany({ where: { coordinatorId: { in: coordinatorIds.concat(["none"]) }, degreeProgram: program }, select: { id: true, coordinatorId: true } });
  const students = await prisma.student.findMany({ where: { batchId: { in: batches.map((b) => b.id).concat(["none"]) }, status: "ACTIVE" }, select: { id: true } });
  // Behind = any failed / withdrawn attempt (a dropped course shows as W).
  const behind = new Set((await prisma.studentTranscriptRecord.findMany({ where: { studentId: { in: students.map((s) => s.id).concat(["none"]) }, OR: [{ gpaPoints: 0 }, { gpaPoints: null, NOT: { grade: "P" } }] }, select: { studentId: true } })).map((r) => r.studentId));
  const leadsAll = (await prisma.user.findMany({ where: { role: "PROGRAM_COORDINATOR", managedById: chairmanId }, select: { id: true } })).map((u) => u.id);
  const anyLead = batches[0]?.coordinatorId || coordinatorIds[0];
  const current = anyLead ? await prisma.currentTerm.findUnique({ where: { coordinatorId: anyLead }, select: { termName: true, year: true } }) : null;
  const policy = await getPolicy(chairmanId);
  const nowReg = current ? (/fall/i.test(current.termName) ? current.year * 2 : current.year * 2 - 1) : 0;
  const { offerings } = await programOfferings(leadsAll.length ? leadsAll : coordinatorIds, program, nowReg - 1, null);

  const late: { id: string; name: string; roll: string; finish: string | null; expected: string; late: number; unplaced: number }[] = [];
  const found = new Map<string, Suggestion>();
  for (const st of students) {
    if (!behind.has(st.id)) continue;
    const inp0 = await loadPlanInput(st.id, { offerings, policy, current });
    if (!inp0) continue;
    // Own-batch flags differ per student: mark offerings of the student's own batch.
    const inp: PlanInput = inp0;
    const base = planDegree(inp);
    if (!base.lateTerms && !base.unplaced.length) continue;
    late.push({ id: inp.studentId, name: inp.name, roll: inp.roll, finish: base.finishLabel, expected: base.expectedLabel, late: base.lateTerms, unplaced: base.unplaced.length });
    const terms = timeline(inp.startReg, inp.startWithSummer).slice(0, 8);
    const lateCodes = new Set([
      ...base.terms.filter((t) => !t.summer ? keyReg(t.key) > inp.expectedEndReg : t.courses.length && keyRegSummer(t.key) >= inp.expectedEndReg).flatMap((t) => t.courses.map((c) => c.code)),
      ...base.unplaced.map((u) => u.code),
    ]);
    const baseFinish = base.unplaced.length ? Infinity : base.finishReg ?? Infinity;
    for (const code of Array.from(lateCodes)) {
      let best: { t: (typeof terms)[number]; finish: number; label: string } | null = null;
      for (const t of terms) {
        const sim: PlanInput = t.summer && !(inp.loads[t.key] > 0) ? { ...inp, loads: { ...inp.loads, [t.key]: inp.requests.summerLoad[t.key] ?? policy.maxCreditsSummer } } : inp;
        // A summer the advisor hasn't opened is opened for this one section only, so the gain is the section's own.
        const r = planDegree(sim, { extra: { code: code.trim().toUpperCase(), reg: t.reg, summer: t.summer, only: t.summer && !(inp.loads[t.key] > 0) } });
        const f = r.unplaced.length ? Infinity : r.finishReg ?? Infinity;
        if (f < baseFinish && (!best || f < best.finish)) best = { t, finish: f, label: r.finishLabel || "" };
      }
      if (!best) continue;
      const k = `${code}|${best.t.key}`;
      const course = inp.courses.find((c) => c.code === code);
      const sug = found.get(k) || { code, title: course?.title || "", termKey: best.t.key, termLabel: best.t.label, summer: best.t.summer, students: [] };
      sug.students.push({ id: inp.studentId, name: inp.name, roll: inp.roll, before: base.unplaced.length ? "can't finish" : base.finishLabel || "", after: best.label });
      found.set(k, sug);
    }
  }
  return { suggestions: Array.from(found.values()).sort((a, b) => b.students.length - a.students.length), late, checked: behind.size, total: students.length, current: current ? `${current.termName} ${current.year}` : null };
}

const keyReg = (key: string) => { const [y, t] = key.split("-"); return t === "FA" ? Number(y) * 2 : Number(y) * 2 - 1; };
const keyRegSummer = (key: string) => Number(key.split("-")[0]) * 2 - 1; // the Spring before it
