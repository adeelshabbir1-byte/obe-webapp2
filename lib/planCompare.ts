import { prisma } from "./db";

export type PlanAssessment = { id: string; label: string; type: string; marksPct: number; cloId: string | null };
export type PlanClo = { id: string; code: string; mappedPloId: string | null; contributionPct: number | null };
export type PlanPlo = { id: string; number: number; title: string };
export type PlanData = { assessments: PlanAssessment[]; clos: PlanClo[]; plos: PlanPlo[]; exists: boolean };
export type PlanDifference = { kind: string; text: string };
export type PlanComparison = {
  differences: PlanDifference[];
  /** ids (on each side) of the boxes involved in a difference, so the diagram can outline them */
  seChanged: Set<string>;
  instructorChanged: Set<string>;
  /** false until the instructor has actually started their own copy — an empty copy is "not started", not "different" */
  instructorStarted: boolean;
};

const EMPTY: PlanData = { assessments: [], clos: [], plos: [], exists: false };

/** Loads BOTH plans (the Subject Expert's and the Instructor's own copy) for many courses at once. */
export async function loadPlansBulk(courseIds: string[]): Promise<Map<string, { se: PlanData; instructor: PlanData }>> {
  const out = new Map<string, { se: PlanData; instructor: PlanData }>();
  if (courseIds.length === 0) return out;
  const [instruments, clos, links] = await Promise.all([
    prisma.assessmentInstrument.findMany({ where: { courseId: { in: courseIds } } }),
    prisma.cLO.findMany({ where: { courseId: { in: courseIds } }, include: { mappedPlo: true }, orderBy: { orderIndex: "asc" } }),
    prisma.lectureRowInstrument.findMany({ where: { instrument: { courseId: { in: courseIds } } }, include: { lectureRow: true } }),
  ]);
  // instrument -> CLO via its lecture row (first link wins, same rule used by attainment)
  const instrumentToClo = new Map<string, string>();
  for (const link of links) if (link.lectureRow.cloId && !instrumentToClo.has(link.instrumentId)) instrumentToClo.set(link.instrumentId, link.lectureRow.cloId);

  for (const courseId of courseIds) {
    const build = (source: "SE" | "INSTRUCTOR"): PlanData => {
      const ins = instruments.filter((i) => i.courseId === courseId && i.source === source);
      const cs = clos.filter((c) => c.courseId === courseId && c.source === source);
      if (ins.length === 0 && cs.length === 0) return EMPTY;
      const plos = Array.from(new Map(cs.filter((c) => c.mappedPlo).map((c) => [c.mappedPlo!.id, c.mappedPlo!])).values()).map((p) => ({ id: p.id, number: p.number, title: p.title }));
      return {
        exists: true,
        assessments: ins.map((i) => ({ id: i.id, label: i.label, type: i.type, marksPct: i.marksPct, cloId: instrumentToClo.get(i.id) || null })),
        clos: cs.map((c) => ({ id: c.id, code: c.code, mappedPloId: c.mappedPloId, contributionPct: c.ploContributionPct })),
        plos,
      };
    };
    out.set(courseId, { se: build("SE"), instructor: build("INSTRUCTOR") });
  }
  return out;
}

/** Compares the Subject Expert's plan against the Instructor's, item by item. */
export function comparePlans(se: PlanData, ins: PlanData): PlanComparison {
  const differences: PlanDifference[] = [];
  const seChanged = new Set<string>(), instructorChanged = new Set<string>();
  if (!ins.exists) return { differences, seChanged, instructorChanged, instructorStarted: false };

  const cloCode = (plan: PlanData, id: string | null) => plan.clos.find((c) => c.id === id)?.code || "no CLO";
  const ploNumber = (plan: PlanData, id: string | null) => { const p = plan.plos.find((x) => x.id === id); return p ? `PLO-${p.number}` : "no PLO"; };
  const key = (a: PlanAssessment) => `${a.type.trim().toLowerCase()}|${a.label.trim().toLowerCase()}`;

  const seByKey = new Map(se.assessments.map((a) => [key(a), a]));
  const insByKey = new Map(ins.assessments.map((a) => [key(a), a]));
  for (const [k, a] of seByKey) {
    const b = insByKey.get(k);
    if (!b) { differences.push({ kind: "ASSESSMENT_REMOVED", text: `${a.label} (${Math.round(a.marksPct * 100) / 100}%) is in the Subject Expert's plan but not in the Instructor's.` }); seChanged.add("a:" + a.id); continue; }
    if (a.marksPct !== b.marksPct) { differences.push({ kind: "WEIGHT", text: `${a.label}: Subject Expert ${Math.round(a.marksPct * 100) / 100}% vs Instructor ${Math.round(b.marksPct * 100) / 100}%.` }); seChanged.add("a:" + a.id); instructorChanged.add("a:" + b.id); }
    const ca = cloCode(se, a.cloId), cb = cloCode(ins, b.cloId);
    if (ca !== cb) { differences.push({ kind: "CLO_LINK", text: `${a.label} feeds ${ca} in the Subject Expert's plan but ${cb} in the Instructor's.` }); seChanged.add("a:" + a.id); instructorChanged.add("a:" + b.id); }
  }
  for (const [k, b] of insByKey) {
    if (!seByKey.has(k)) { differences.push({ kind: "ASSESSMENT_ADDED", text: `${b.label} (${Math.round(b.marksPct * 100) / 100}%) was added by the Instructor and is not in the Subject Expert's plan.` }); instructorChanged.add("a:" + b.id); }
  }

  const seClos = new Map(se.clos.map((c) => [c.code, c])), insClos = new Map(ins.clos.map((c) => [c.code, c]));
  for (const [code, a] of seClos) {
    const b = insClos.get(code);
    if (!b) { differences.push({ kind: "CLO_REMOVED", text: `${code} is in the Subject Expert's plan but not in the Instructor's.` }); seChanged.add("c:" + a.id); continue; }
    if (ploNumber(se, a.mappedPloId) !== ploNumber(ins, b.mappedPloId)) { differences.push({ kind: "PLO", text: `${code} maps to ${ploNumber(se, a.mappedPloId)} (Subject Expert) vs ${ploNumber(ins, b.mappedPloId)} (Instructor).` }); seChanged.add("c:" + a.id); instructorChanged.add("c:" + b.id); }
    else if ((a.contributionPct || 0) !== (b.contributionPct || 0)) { differences.push({ kind: "CONTRIBUTION", text: `${code} share of ${ploNumber(se, a.mappedPloId)}: Subject Expert ${a.contributionPct ?? 0}% vs Instructor ${b.contributionPct ?? 0}%.` }); seChanged.add("c:" + a.id); instructorChanged.add("c:" + b.id); }
  }
  for (const [code, b] of insClos) {
    if (!seClos.has(code)) { differences.push({ kind: "CLO_ADDED", text: `${code} was added by the Instructor and is not in the Subject Expert's plan.` }); instructorChanged.add("c:" + b.id); }
  }
  return { differences, seChanged, instructorChanged, instructorStarted: true };
}

/** Courses an Instructor is entitled to see: ones he teaches (directly or via a section assignment), plus every course equivalent (same combined-class group) to one he teaches. */
export async function courseIdsForInstructor(userId: string): Promise<string[]> {
  const [direct, sections] = await Promise.all([
    prisma.course.findMany({ where: { instructorId: userId }, select: { id: true } }),
    prisma.courseSectionAssignment.findMany({ where: { instructorId: userId }, select: { courseId: true } }),
  ]);
  const taught = new Set<string>([...direct.map((c) => c.id), ...sections.map((s) => s.courseId)]);
  if (taught.size === 0) return [];
  const memberships = await prisma.courseEquivalenceMember.findMany({ where: { courseId: { in: Array.from(taught) } }, select: { groupId: true } });
  if (memberships.length > 0) {
    const equivalents = await prisma.courseEquivalenceMember.findMany({ where: { groupId: { in: memberships.map((m) => m.groupId) } }, select: { courseId: true } });
    for (const e of equivalents) taught.add(e.courseId);
  }
  return Array.from(taught);
}
