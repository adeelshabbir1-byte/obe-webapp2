import { prisma } from "./db";
import { bodyOfProgram } from "./accreditation/bodies";
import { cdb, ATTRS, EA_ATTRS, KNOWLEDGE, parseArr } from "./complexProblems";
import { labTasks } from "./labPlanCore";

// Coverage of complex problems and the knowledge profile for one batch: which attributes (WP1–WP7, EA1–EA5) and
// knowledge areas (WK1–WK8 / CK1–CK8) each course, assessment, lab task and final year project covers; the gaps; and
// how students did on the complex-problem assessments.
// Attainment of an assessment = share of its students scoring at least half its marks; average = mean of score ÷ max.

export type Item = { kind: "ASSESSMENT" | "LAB" | "FYP"; ref: string; label: string; attrs: string[]; knowledge: string[]; note: string | null; students: number; avgPct: number | null; passPct: number | null };
export type CourseCov = { id: string; code: string; title: string; knowledge: string[]; items: Item[] };

export const PASS_SHARE = 0.5;
export const isComplex = (attrs: string[]) => attrs.includes("P1");
const round = (x: number) => Math.round(x * 10) / 10;

export async function complexCoverage(chairmanId: string, batchId: string) {
  const batch = await prisma.batch.findUnique({ where: { id: batchId }, select: { id: true, degreeProgram: true, batchName: true } });
  if (!batch) return null;
  const body = (await bodyOfProgram(chairmanId, batch.degreeProgram)).body;
  const pec = body === "PEC";
  const attrs = pec ? [...ATTRS, ...EA_ATTRS] : ATTRS;
  const kset = KNOWLEDGE[pec ? "PEC" : "NCEAC"];
  const courses = await prisma.course.findMany({ where: { batchId }, select: { id: true, code: true, title: true }, orderBy: { code: "asc" } });
  const ids = courses.map((c) => c.id).concat(["none"]);
  const [know, tags, targets, insts, students] = await Promise.all([
    cdb.courseKnowledge.findMany({ where: { chairmanId, courseCode: { in: courses.map((c) => c.code) } } }).catch(() => []) as Promise<{ courseCode: string; areasJson: string }[]>,
    cdb.complexTag.findMany({ where: { courseId: { in: ids } } }).catch(() => []) as Promise<{ instrumentId: string; courseId: string; attrsJson: string; note: string | null }[]>,
    cdb.complexTarget.findMany({ where: { chairmanId } }).catch(() => []) as Promise<{ kind: string; refId: string; courseId: string | null; attrsJson: string; note: string | null }[]>,
    prisma.assessmentInstrument.findMany({ where: { courseId: { in: ids }, source: "INSTRUCTOR", marksPct: { gt: 0 } }, select: { id: true, courseId: true, label: true, type: true, maxScore: true } }),
    prisma.student.findMany({ where: { batchId }, select: { id: true, rollNumber: true, name: true, status: true } }),
  ]);
  const current = students.filter((s) => !["LEFT", "DROPPED", "WITHDRAWN", "TRANSFERRED", "RUSTICATED", "DISMISSED"].includes(s.status));
  const kOf = new Map(know.map((k) => [k.courseCode, parseArr(k.areasJson)]));
  const tagged = tags.filter((t) => parseArr(t.attrsJson).length);
  const marks = await prisma.studentMark.findMany({ where: { instrumentId: { in: tagged.map((t) => t.instrumentId).concat(["none"]) } }, select: { studentId: true, instrumentId: true, score: true } });
  const split = (a: string[]) => ({ attrs: a.filter((k) => attrs.some(([x]) => x === k)), knowledge: a.filter((k) => kset.some(([x]) => x === k)) });
  const faced = new Map<string, number[]>(); // student → their % on each complex assessment

  const out: CourseCov[] = [];
  for (const c of courses) {
    const items: Item[] = [];
    for (const t of tagged.filter((x) => x.courseId === c.id)) {
      const inst = insts.find((i) => i.id === t.instrumentId);
      if (!inst) continue;
      const ms = marks.filter((m) => m.instrumentId === t.instrumentId);
      const pcts = ms.map((m) => (inst.maxScore > 0 ? m.score / inst.maxScore : 0));
      const s = split(parseArr(t.attrsJson));
      if (isComplex(s.attrs)) for (const m of ms) faced.set(m.studentId, [...(faced.get(m.studentId) || []), inst.maxScore > 0 ? m.score / inst.maxScore : 0]);
      items.push({ kind: "ASSESSMENT", ref: inst.id, label: `${inst.label} (${inst.type})`, ...s, note: t.note, students: ms.length, avgPct: pcts.length ? round((100 * pcts.reduce((a, b) => a + b, 0)) / pcts.length) : null, passPct: pcts.length ? round((100 * pcts.filter((p) => p >= PASS_SHARE).length) / pcts.length) : null });
    }
    for (const t of targets.filter((x) => x.kind === "LAB" && x.courseId === c.id)) {
      const s = split(parseArr(t.attrsJson));
      if (!s.attrs.length && !s.knowledge.length) continue;
      items.push({ kind: "LAB", ref: t.refId, label: `Lab ${t.refId.split(":")[1] || ""}`, ...s, note: t.note, students: 0, avgPct: null, passPct: null });
    }
    out.push({ id: c.id, code: c.code, title: c.title, knowledge: Array.from(new Set([...(kOf.get(c.code) || []), ...items.flatMap((i) => i.knowledge)])), items });
  }

  // Final year projects: groups with at least one student of this batch.
  const members = await prisma.fypGroupMember.findMany({ where: { studentId: { in: current.map((s) => s.id).concat(["none"]) }, status: "JOINED" }, select: { groupId: true, studentId: true } }).catch(() => [] as { groupId: string; studentId: string }[]);
  const groupIds = Array.from(new Set(members.map((m) => m.groupId)));
  const groups = await prisma.fypGroup.findMany({ where: { id: { in: groupIds.concat(["none"]) } }, select: { id: true, name: true } }).catch(() => [] as { id: string; name: string }[]);
  const fyp = groups.map((g) => {
    const t = targets.find((x) => x.kind === "FYP" && x.refId === g.id);
    const s = split(parseArr(t?.attrsJson));
    const mem = members.filter((m) => m.groupId === g.id).map((m) => m.studentId);
    if (isComplex(s.attrs)) for (const id of mem) if (!faced.has(id)) faced.set(id, []);
    return { id: g.id, name: g.name, ...s, note: t?.note || null, members: mem.length };
  });

  // Open-ended labs of the batch's lab courses, with their tags.
  const labCourses = courses.filter((c) => /-?L$/i.test(c.code) || /lab/i.test(c.title));
  const oel = (await Promise.all(labCourses.map(async (c) => (await labTasks(c.id).catch(() => [])).map((t) => ({ courseId: c.id, lab: c.code, labNumber: t.labNumber, title: t.title, openEnded: t.openEnded, brief: t.oelBrief, ...split(parseArr(targets.find((x) => x.kind === "LAB" && x.refId === `${c.id}:${t.labNumber}`)?.attrsJson)) }))))).flat();

  const allItems = [...out.flatMap((c) => c.items), ...fyp.map((f) => ({ attrs: f.attrs, knowledge: f.knowledge }))];
  const attrCount = Object.fromEntries(attrs.map(([k]) => [k, allItems.filter((i) => i.attrs.includes(k)).length]));
  const knowCount = Object.fromEntries(kset.map(([k]) => [k, out.filter((c) => c.knowledge.includes(k)).length + fyp.filter((f) => f.knowledge.includes(k)).length]));
  const missing = current.filter((s) => !faced.has(s.id));
  const struggling = current.filter((s) => { const p = faced.get(s.id); return p && p.length > 0 && p.every((x) => x < PASS_SHARE); });
  const complexItems = out.flatMap((c) => c.items.filter((i) => i.kind === "ASSESSMENT" && isComplex(i.attrs)));
  const withMarks = complexItems.filter((i) => i.passPct !== null);
  return {
    batch, body, pec, word: pec ? "complex engineering problem" : "complex computing problem", attrs, kset, courses: out, fyp, oel,
    attrCount, knowCount,
    gaps: { attrs: attrs.filter(([k]) => !attrCount[k]).map(([k]) => k), knowledge: kset.filter(([k]) => !knowCount[k]).map(([k]) => k) },
    students: { total: current.length, faced: current.length - missing.length, missing: missing.map((s) => ({ roll: s.rollNumber, name: s.name })), struggling: struggling.map((s) => ({ roll: s.rollNumber, name: s.name })) },
    complexAssessments: complexItems.length, coursesWithComplex: out.filter((c) => c.items.some((i) => isComplex(i.attrs))).length,
    attainment: withMarks.length ? round(withMarks.reduce((t, i) => t + (i.passPct || 0), 0) / withMarks.length) : null,
  };
}
export type Coverage = NonNullable<Awaited<ReturnType<typeof complexCoverage>>>;
