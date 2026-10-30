import { randomUUID } from "crypto";
import { prisma } from "./db";
import { writeAuditLog } from "./audit";
import { notifyUsers } from "./notifications";
import { directClos } from "./directClo";
import { rulesOf } from "./assessmentRules";
import { voteOnRequest, requestVotes } from "./omcRules";
import { omcOfCourse } from "./omcMembers";
import {
  DEFAULT_SETTINGS, METHODS, SEED_TYPES, asMethod, canExclude, checkWeights, classClo, compareMethods, faultyFlags, isQuestionType, labAhead, limitBreaches,
  mappingIssues, type CItem, type Limit, type Marks, type Method, type MethodSettings, type Part, type TypeDef,
} from "./cloMethodCore";

// CLO attainment as the OMC chose it: the institute default with an override per program, a course's own method only
// with OMC approval, item mapping (splits, Not for CLO, excluded, faulty, method-3 weights), lab parts, and the method
// locked with each term when its results are approved. Every report reads CLO results through courseCloResults().

const db = prisma as unknown as Record<string, any>;
export const CLO_HINT = "Run prisma/migration_clo_methods.sql in Supabase first.";
const J = <T>(s: string | null | undefined, d: T): T => { try { return s ? (JSON.parse(s) as T) : d; } catch { return d; } };
export type FullSettings = MethodSettings & { labSharePct: number; labPassOn: boolean; labPassPct: number };
export const DEFAULT_FULL: FullSettings = { ...DEFAULT_SETTINGS, labSharePct: 20, labPassOn: false, labPassPct: 50 };
const fromRow = (r: Record<string, any> | null | undefined, base: FullSettings): FullSettings => !r ? base : ({
  method: asMethod(r.method), passPct: r.passPct, itemsPct: r.itemsPct, targetPct: r.targetPct, levels: J(r.levelsJson, base.levels), faultyAvgPct: r.faultyAvgPct,
  labSharePct: r.labSharePct, labPassOn: r.labPassOn, labPassPct: r.labPassPct,
});

/** The institute's default and (if any) the program's override. */
export async function methodSettings(chairmanId: string, program?: string | null) {
  const rows = (await db.cloMethodSetting.findMany({ where: { chairmanId, program: { in: ["", program || ""] } } }).catch(() => [])) as Record<string, any>[];
  const inst = rows.find((r) => r.program === "");
  const pc = inst ? null : await import("./passingCriteria").then((m) => m.getPassingCriteria(chairmanId)).catch(() => null);
  const institute = fromRow(inst, pc ? { ...DEFAULT_FULL, passPct: pc.cloPct } : DEFAULT_FULL);
  const own = program ? rows.find((r) => r.program === program) : null;
  return { institute, program: own ? fromRow(own, institute) : null, effective: own ? fromRow(own, institute) : institute };
}
export async function saveMethodSettings(user: { id: string }, chairmanId: string, program: string, patch: Partial<FullSettings>) {
  const cur = (await methodSettings(chairmanId, program || null))[program ? "effective" : "institute"];
  const n: FullSettings = { ...cur, ...Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined && v !== null && String(v) !== "")) } as FullSettings;
  n.method = asMethod(n.method);
  for (const k of ["passPct", "itemsPct", "targetPct", "faultyAvgPct", "labSharePct", "labPassPct"] as const) { n[k] = Number(n[k]); if (!(n[k] >= 0 && n[k] <= 100)) throw new Error(`${k} must be 0–100.`); }
  const l = { excellent: Number(n.levels.excellent), good: Number(n.levels.good), satisfactory: Number(n.levels.satisfactory) };
  if (!(l.excellent > l.good && l.good > l.satisfactory && l.satisfactory > 0)) throw new Error("Levels must go down: Excellent > Good > Satisfactory > 0.");
  n.levels = l; n.labPassOn = n.labPassOn === true || (n.labPassOn as unknown) === "true";
  const data = { method: n.method, passPct: n.passPct, itemsPct: n.itemsPct, targetPct: n.targetPct, levelsJson: JSON.stringify(l), faultyAvgPct: n.faultyAvgPct, labSharePct: n.labSharePct, labPassOn: n.labPassOn, labPassPct: n.labPassPct, updatedById: user.id, updatedAt: new Date() };
  await db.cloMethodSetting.upsert({ where: { chairmanId_program: { chairmanId, program } }, create: { id: randomUUID(), chairmanId, program, ...data }, update: data });
  await logChanges(chairmanId, "CLO_METHOD", program || "INSTITUTE", cur as unknown as Record<string, unknown>, n as unknown as Record<string, unknown>, user.id);
  return n;
}
export async function logChanges(chairmanId: string, area: string, scope: string, before: Record<string, unknown>, after: Record<string, unknown>, byUserId: string) {
  const rows = Object.keys(after).filter((k) => JSON.stringify(before[k]) !== JSON.stringify(after[k])).map((k) => ({ id: randomUUID(), chairmanId, area, scope, field: k, oldValue: JSON.stringify(before[k] ?? null), newValue: JSON.stringify(after[k] ?? null), byUserId }));
  if (rows.length) await db.settingChange.createMany({ data: rows }).catch(() => null);
}

async function courseInfo(courseId: string) {
  return prisma.course.findUnique({ where: { id: courseId }, select: { id: true, code: true, title: true, courseType: true, coordinatorId: true, subjectExpertId: true, instructorId: true, offeredTermName: true, offeredTermYear: true, coordinator: { select: { managedById: true } }, batch: { select: { degreeProgram: true } } } });
}
/** The settings a course uses now: its program's (or the institute's), with any OMC-approved method / lab share of its own. */
export async function courseSettings(courseId: string) {
  const c = await courseInfo(courseId);
  const base = (await methodSettings(c?.coordinator.managedById || "", c?.batch?.degreeProgram)).effective;
  const reqs = (await db.courseCloRequest.findMany({ where: { courseId, status: "APPROVED" }, orderBy: { createdAt: "desc" } }).catch(() => [])) as { kind: string; valueJson: string }[];
  const m = reqs.find((r) => r.kind === "METHOD"), l = reqs.find((r) => r.kind === "LAB_SHARE");
  return { ...base, ...(m ? { method: asMethod(J<{ method: string }>(m.valueJson, { method: base.method }).method) } : {}), ...(l ? { labSharePct: Number(J<{ pct: number }>(l.valueJson, { pct: base.labSharePct }).pct) } : {}), courseOwnMethod: !!m, courseOwnLabShare: !!l } as FullSettings & { courseOwnMethod: boolean; courseOwnLabShare: boolean };
}

export type ItemMapRow = { instrumentId: string; splitsJson: string | null; weightsJson: string | null; typeKey: string | null; part: string | null; notForClo: boolean; notForCloReason: string | null; excluded: boolean; excludedReason: string | null; faulty: boolean; faultyReason: string | null; faultyNoGrade: boolean; faultyById: string | null; faultyAt: Date | null };
/** The course's items as the engine sees them, with its CLOs (theory / lab) and whether it has a lab part. */
export async function courseItems(courseId: string, source: "SE" | "INSTRUCTOR") {
  const course = await courseInfo(courseId);
  const [insts, clos, links, direct, maps, parts] = await Promise.all([
    prisma.assessmentInstrument.findMany({ where: { courseId, source }, orderBy: [{ type: "asc" }, { label: "asc" }], select: { id: true, type: true, label: true, marksPct: true, maxScore: true, partOfId: true } }),
    prisma.cLO.findMany({ where: { courseId, source }, orderBy: [{ orderIndex: "asc" }, { code: "asc" }], select: { id: true, code: true, statement: true, bloomLevel: true } }),
    prisma.lectureRowInstrument.findMany({ where: { instrument: { courseId, source } }, select: { instrumentId: true, lectureRow: { select: { cloId: true } } } }),
    directClos(courseId),
    db.cloItemMap.findMany({ where: { courseId, source } }).catch(() => []) as Promise<ItemMapRow[]>,
    db.cloPart.findMany({ where: { courseId } }).catch(() => []) as Promise<{ cloId: string; part: string }[]>,
  ]);
  const labCourse = /^lab$/i.test(course?.courseType || "");
  const mapOf = new Map(maps.map((m) => [m.instrumentId, m]));
  const base = new Map<string, string>();
  direct.forEach((v, k) => base.set(k, v));
  for (const l of links) if (l.lectureRow.cloId && !base.has(l.instrumentId)) base.set(l.instrumentId, l.lectureRow.cloId);
  const typeDefs = await typesOf(course?.coordinator.managedById || "").catch(() => SEED_TYPES.map((t, i) => ({ ...t, id: t.key, retired: false, sort: i })));
  const cloIds = new Set(clos.map((c) => c.id));
  const items: CItem[] = insts.filter((i) => i.marksPct > 0 || !insts.some((x) => x.partOfId === i.id)).map((i) => {
    const m = mapOf.get(i.id);
    const td = m?.typeKey ? typeDefs.find((t) => t.key === m.typeKey) : null;
    const part: Part = (m?.part as Part) || (labCourse || /lab/i.test(i.type) || td?.part === "LAB" ? "LAB" : "THEORY");
    const splits = J<{ cloId: string; pct: number }[] | null>(m?.splitsJson, null)?.filter((s) => cloIds.has(s.cloId)) || (base.get(i.id) ? [{ cloId: base.get(i.id)!, pct: 100 }] : []);
    return {
      id: i.id, label: i.label, type: i.type, part, maxMarks: i.maxScore, gradePct: i.marksPct, isQuestion: isQuestionType(i.type), clos: splits,
      notForClo: !!m?.notForClo || (td ? !td.graded : false), excluded: !!m?.excluded, faulty: !!m?.faulty, weights: J<Record<string, number> | undefined>(m?.weightsJson, undefined),
    };
  });
  const partOf = new Map(parts.map((p) => [p.cloId, p.part as Part]));
  const cloList = clos.map((c) => ({ id: c.id, code: c.code, statement: c.statement, bloom: c.bloomLevel, part: (partOf.get(c.id) || (labCourse || /^[PA]\d/.test(c.bloomLevel) ? "LAB" : "THEORY")) as Part }));
  const hasLab = !labCourse && items.some((i) => i.part === "LAB");
  return { course, items, clos: cloList, hasLab, maps: mapOf, notForCloReasons: Object.fromEntries(maps.map((m) => [m.instrumentId, m.notForCloReason])) };
}

/** Each enrolled student's marks: a number, or null when the cell is blank (absent). */
export async function courseMarks(courseId: string, items: CItem[]) {
  const [en, marks] = await Promise.all([
    prisma.studentEnrollment.findMany({ where: { courseId, status: { not: "WITHDRAWN" } }, select: { studentId: true, student: { select: { rollNumber: true, name: true } } } }),
    prisma.studentMark.findMany({ where: { courseId, instrumentId: { in: items.map((i) => i.id).concat("none") } }, select: { studentId: true, instrumentId: true, score: true } }),
  ]);
  const by = new Map<string, Marks>(en.map((e) => [e.studentId, Object.fromEntries(items.map((i) => [i.id, null])) as Marks]));
  for (const m of marks) { const r = by.get(m.studentId); if (r) r[m.instrumentId] = m.score; }
  return en.map((e) => ({ studentId: e.studentId, roll: e.student.rollNumber, name: e.student.name, marks: by.get(e.studentId)! }));
}

export async function limitsFor(courseId: string): Promise<Limit[]> {
  const c = await courseInfo(courseId);
  const rules = await rulesOf(c?.coordinator.managedById || "");
  return rules.filter((r) => r.level === "CLO" && (!r.program || r.program === c?.batch?.degreeProgram)).map((r) => ({ label: r.label, types: r.types, minPct: r.minPct, maxPct: r.maxPct, part: r.courseKind === "LAB" ? "LAB" : r.courseKind === "THEORY" ? "THEORY" : null }));
}

/** CLO results for a course: the term's locked method once its results are approved (unless recalculated), else today's. */
export async function courseCloResults(courseId: string, opts: { settings?: FullSettings; ignoreLock?: boolean } = {}) {
  const { course, items, clos } = await courseItems(courseId, "INSTRUCTOR");
  let settings: FullSettings = opts.settings || (await courseSettings(courseId));
  let locked: { lockedAt: Date; recalculated: boolean } | null = null;
  if (!opts.settings && !opts.ignoreLock && course?.offeredTermName && course.offeredTermYear) {
    const l = await db.cloTermLock.findUnique({ where: { courseId_termName_termYear: { courseId, termName: course.offeredTermName, termYear: course.offeredTermYear } } }).catch(() => null);
    if (l) { settings = J<FullSettings>(l.recalcSettingsJson || l.settingsJson, settings); locked = { lockedAt: l.lockedAt, recalculated: !!l.recalcSettingsJson }; }
  }
  const students = await courseMarks(courseId, items);
  const per = clos.map((c) => ({ clo: c, ...classClo(settings, items, c.id, students.map((s) => s.marks)) }));
  const left = items.filter((i) => i.notForClo || i.excluded || i.faulty);
  const maps = (await db.cloItemMap.findMany({ where: { instrumentId: { in: left.map((i) => i.id).concat("none") } } }).catch(() => [])) as ItemMapRow[];
  return {
    method: settings.method, methodLabel: METHODS[settings.method].label, settings, locked, students, items, clos: per,
    leftOut: left.map((i) => { const m = maps.find((x) => x.instrumentId === i.id); return { id: i.id, label: i.label, kind: i.faulty ? "Faulty" : i.excluded ? "Excluded" : "Not for CLO", reason: (i.faulty ? m?.faultyReason : i.excluded ? m?.excludedReason : m?.notForCloReason) || "", noGrade: !!m?.faultyNoGrade }; }),
    flags: faultyFlags(items.filter((i) => !i.faulty), students.map((s) => s.marks), settings.faultyAvgPct),
  };
}

/** The four methods side by side, per CLO, on this course's marks. */
export async function compareCourse(courseId: string) {
  const { items, clos } = await courseItems(courseId, "INSTRUCTOR");
  const s = await courseSettings(courseId);
  const marks = (await courseMarks(courseId, items)).map((x) => x.marks);
  return clos.map((c) => ({ clo: c, methods: compareMethods(s, items, c.id, marks) }));
}

/** Plan checks for submission: mapping, coverage, lab CLO, limits under the method, lab rows ahead of theory. */
export async function planCheck(courseId: string, source: "SE" | "INSTRUCTOR") {
  const { items, clos, hasLab, notForCloReasons } = await courseItems(courseId, source);
  const s = await courseSettings(courseId);
  const m = mappingIssues(items, clos, { hasLab, notForCloReasons });
  const limits = await limitsFor(courseId);
  const breaches = limitBreaches(s.method, items, clos, limits);
  const weightErrors = s.method === "WEIGHTS" ? clos.map((c) => checkWeights(items, c, limits)).filter((x): x is string => !!x) : [];
  const lab = await labSync(courseId).catch(() => ({ ahead: [] as { text: string; reason: string | null }[], unlinked: [] as string[], practiceGaps: [] as string[] }));
  return {
    method: s.method, blocking: [...m.blocking, ...weightErrors, ...lab.ahead.filter((a) => !a.reason).map((a) => `${a.text} — move the lab or the lecture, or give a reason.`)],
    warnings: [...m.warnings, ...lab.unlinked, ...lab.practiceGaps], breaches: breaches.map((b) => b.text),
  };
}

/** The theory–lab sync of a course with a lab (its own lab rows, or its separate "-L" lab course). */
export async function labSync(courseId: string) {
  const c = await prisma.course.findUnique({ where: { id: courseId }, select: { code: true, coordinatorId: true, batchId: true, courseType: true } });
  if (!c) return { ahead: [], unlinked: [], practiceGaps: [] };
  const labCourse = /^lab$/i.test(c.courseType) ? { id: courseId } : await prisma.course.findFirst({ where: { coordinatorId: c.coordinatorId, batchId: c.batchId, code: `${c.code}-L` }, select: { id: true } });
  if (!labCourse) return { ahead: [], unlinked: [], practiceGaps: [] };
  const theoryId = /^lab$/i.test(c.courseType) ? (await prisma.course.findFirst({ where: { coordinatorId: c.coordinatorId, batchId: c.batchId, code: c.code.replace(/-L$/i, "") }, select: { id: true } }))?.id : courseId;
  const { labTasks, theoryLectures } = await import("./labPlanCore");
  const [tasks, lectures, metas] = await Promise.all([labTasks(labCourse.id), theoryLectures(theoryId || null), db.labRowMeta.findMany({ where: { labCourseId: labCourse.id } }).catch(() => [])]);
  const meta = new Map((metas as { labNumber: number; labOnly: boolean; aheadReason: string | null }[]).map((m) => [m.labNumber, m]));
  const rows = tasks.map((t) => ({ week: t.week ?? 99, labNumber: t.labNumber, hours: 3, title: t.title, topics: t.topics, cloId: null, tools: "", deliverable: "", labOnly: !!meta.get(t.labNumber)?.labOnly, kind: "TASK" as const }));
  const ahead = labAhead(rows.filter((r) => r.week !== 99), lectures).map((a) => ({ ...a, reason: meta.get(a.labNumber)?.aheadReason || null }));
  const unlinked = rows.filter((r) => !r.topics.length && !r.labOnly).map((r) => `Lab ${r.labNumber} is not linked to a theory topic (mark it "lab-only" if it is, e.g., tool set-up).`);
  const practice = theoryId ? ((await db.topicPractice.findMany({ where: { courseId: theoryId, needsPractice: true } }).catch(() => [])) as { lectureRowId: string }[]) : [];
  const lrs = practice.length ? await prisma.lectureRow.findMany({ where: { id: { in: practice.map((p) => p.lectureRowId) } }, select: { lectureNumber: true, topic: true } }) : [];
  const linked = new Set(rows.flatMap((r) => r.topics.map((t) => t.topic.trim().toLowerCase())));
  const practiceGaps = lrs.filter((l) => !linked.has(l.topic.trim().toLowerCase())).map((l) => `L${l.lectureNumber} ${l.topic} needs practice but no lab row practises it.`);
  return { ahead, unlinked, practiceGaps, labCourseId: labCourse.id };
}

// ---- item mapping edits (SE on the plan, instructor on his copy)
async function upsertMap(courseId: string, source: string, instrumentId: string, data: Record<string, unknown>, by: string) {
  await db.cloItemMap.upsert({ where: { instrumentId }, create: { instrumentId, courseId, source, ...data, updatedById: by, updatedAt: new Date() }, update: { ...data, updatedById: by, updatedAt: new Date() } });
}
export async function saveItemMap(user: { id: string }, courseId: string, source: "SE" | "INSTRUCTOR", instrumentId: string, p: { splits?: { cloId: string; pct: number }[]; notForClo?: boolean; notForCloReason?: string; excluded?: boolean; excludedReason?: string; part?: Part; typeKey?: string }) {
  const { items, clos } = await courseItems(courseId, source);
  const it = items.find((i) => i.id === instrumentId);
  if (!it) throw new Error("Item not found in this plan.");
  const data: Record<string, unknown> = {};
  if (p.splits) {
    const sp = p.splits.filter((s) => s.pct > 0);
    if (!sp.length) throw new Error("Choose at least one CLO.");
    if (sp.some((s) => !clos.some((c) => c.id === s.cloId))) throw new Error("Choose CLOs of this plan.");
    const sum = Math.round(sp.reduce((a, s) => a + Number(s.pct), 0) * 100) / 100;
    if (Math.abs(sum - 100) > 0.01) throw new Error(`The split adds up to ${sum}%, not 100%.`);
    data.splitsJson = JSON.stringify(sp.map((s) => ({ cloId: s.cloId, pct: Number(s.pct) })));
  }
  if (p.notForClo !== undefined) {
    if (p.notForClo && it.isQuestion) throw new Error("A mid or final question must map to a CLO.");
    if (p.notForClo && !(p.notForCloReason || "").trim()) throw new Error("Give the reason (e.g. bonus quiz, class participation).");
    Object.assign(data, { notForClo: p.notForClo, notForCloReason: p.notForClo ? p.notForCloReason!.trim().slice(0, 300) : null });
  }
  if (p.excluded !== undefined) {
    if (p.excluded) {
      if (!(p.excludedReason || "").trim()) throw new Error("Give the reason for excluding it from CLO attainment.");
      const s = await courseSettings(courseId);
      const why = canExclude(s.method, items, instrumentId, clos, await limitsFor(courseId));
      if (why) throw new Error(`Can't exclude: ${why}`);
    }
    Object.assign(data, { excluded: p.excluded, excludedReason: p.excluded ? p.excludedReason!.trim().slice(0, 300) : null });
  }
  if (p.part) data.part = p.part === "LAB" ? "LAB" : "THEORY";
  if (p.typeKey !== undefined) data.typeKey = p.typeKey || null;
  await upsertMap(courseId, source, instrumentId, data, user.id);
}
/** Method 3: the SE's weights for one CLO — refused (naming the CLO) unless they add up to 100 within the limits. */
export async function saveWeights(user: { id: string }, courseId: string, source: "SE" | "INSTRUCTOR", cloId: string, weights: Record<string, number>) {
  const { items, clos } = await courseItems(courseId, source);
  const clo = clos.find((c) => c.id === cloId);
  if (!clo) throw new Error("CLO not found.");
  const next = items.map((i) => ({ ...i, weights: { ...(i.weights || {}), [cloId]: Number(weights[i.id] || 0) } }));
  const err = checkWeights(next, clo, await limitsFor(courseId));
  if (err) throw new Error(err);
  for (const i of next.filter((x) => x.clos.some((c) => c.cloId === cloId))) await upsertMap(courseId, source, i.id, { weightsJson: JSON.stringify(i.weights) }, user.id);
}
export async function setCloPart(courseId: string, cloId: string, part: Part) {
  await db.cloPart.upsert({ where: { cloId }, create: { cloId, courseId, part }, update: { part } });
}

// ---- faulty items (OMC)
export async function markFaulty(user: { id: string; name: string }, instrumentId: string, p: { faulty: boolean; reason: string; noGrade: boolean }) {
  const inst = await prisma.assessmentInstrument.findUnique({ where: { id: instrumentId }, select: { id: true, label: true, courseId: true, source: true } });
  if (!inst) throw new Error("Item not found.");
  if (p.faulty && p.reason.trim().length < 3) throw new Error("Give the reason.");
  await upsertMap(inst.courseId, inst.source, instrumentId, { faulty: p.faulty, faultyReason: p.faulty ? p.reason.trim().slice(0, 500) : null, faultyNoGrade: p.faulty && p.noGrade, faultyById: user.id, faultyAt: new Date() }, user.id);
  await writeAuditLog({ actorUserId: user.id, action: p.faulty ? "ITEM_MARKED_FAULTY" : "ITEM_FAULTY_CLEARED", entityType: "AssessmentInstrument", entityId: instrumentId, metadata: { courseId: inst.courseId, label: inst.label, reason: p.reason.slice(0, 200), excludeFromGrade: p.noGrade ? "yes" : "no" } });
  // Leaving it out of the grade changes the grades: an approved result goes back for approval.
  if (p.noGrade) {
    const r = await prisma.courseResult.findUnique({ where: { courseId: inst.courseId } }).catch(() => null);
    if (r && ["APPROVED", "SUBMITTED"].includes(r.status)) await prisma.courseResult.update({ where: { courseId: inst.courseId }, data: { status: "RETURNED", note: `Re-opened: ${inst.label} marked faulty and left out of the grade (${user.name}).` } });
  }
  const c = await prisma.course.findUnique({ where: { id: inst.courseId }, select: { instructorId: true, subjectExpertId: true, code: true } });
  await notifyUsers([c?.instructorId, c?.subjectExpertId], { kind: "RESULT", title: `${c?.code}: ${inst.label} ${p.faulty ? "marked faulty" : "no longer faulty"}`, body: p.faulty ? `${p.reason.slice(0, 200)}${p.noGrade ? " · also left out of the grade — the result needs approval again" : " · still counts in the grade"}` : undefined, href: `/courses/${inst.courseId}/clo-attainment`, exceptId: user.id }).catch(() => null);
}
/** Items flagged by class average (for the OMC): offered courses of the institute, marks entered, average below the setting. */
export async function faultyQueue(chairmanId: string) {
  const s = (await methodSettings(chairmanId)).institute;
  const insts = await prisma.assessmentInstrument.findMany({ where: { source: "INSTRUCTOR", course: { isOffered: true, coordinator: { managedById: chairmanId } } }, select: { id: true, label: true, maxScore: true, courseId: true, course: { select: { code: true, title: true } } } });
  const avgs = await prisma.studentMark.groupBy({ by: ["instrumentId"], where: { instrumentId: { in: insts.map((i) => i.id).concat("none") } }, _avg: { score: true }, _count: { _all: true } });
  const maps = new Map(((await db.cloItemMap.findMany({ where: { instrumentId: { in: avgs.map((a) => a.instrumentId).concat("none") } } }).catch(() => [])) as ItemMapRow[]).map((m) => [m.instrumentId, m]));
  return avgs.flatMap((a) => {
    const i = insts.find((x) => x.id === a.instrumentId)!;
    const avg = i && a._avg.score !== null ? Math.round((1000 * a._avg.score) / i.maxScore) / 10 : null;
    const m = maps.get(a.instrumentId);
    if (avg === null || (avg >= s.faultyAvgPct && !m?.faulty)) return [];
    return [{ instrumentId: i.id, courseId: i.courseId, course: `${i.course.code} ${i.course.title}`, label: i.label, avg, students: a._count._all, faulty: !!m?.faulty, reason: m?.faultyReason || null, noGrade: !!m?.faultyNoGrade, at: m?.faultyAt || null }];
  }).sort((a, b) => a.avg - b.avg);
}

// ---- term lock
export async function lockTerm(courseId: string) {
  const c = await courseInfo(courseId);
  if (!c?.offeredTermName || !c.offeredTermYear) return;
  const s = await courseSettings(courseId);
  const r = await courseCloResults(courseId, { settings: s });
  const result = r.clos.map((x) => ({ code: x.clo.code, clearedPct: x.clearedPct, achieved: x.achieved, notAssessed: x.notAssessed, levels: x.levels }));
  await db.cloTermLock.upsert({ where: { courseId_termName_termYear: { courseId, termName: c.offeredTermName, termYear: c.offeredTermYear } }, create: { id: randomUUID(), courseId, termName: c.offeredTermName, termYear: c.offeredTermYear, settingsJson: JSON.stringify(s), resultJson: JSON.stringify(result) }, update: {} });
}
/** Recalculate past terms with today's settings (explicit OMC action; both versions are kept). */
export async function recalcPastTerms(user: { id: string }, chairmanId: string, program?: string | null) {
  const locks = (await db.cloTermLock.findMany({ where: { courseId: { in: (await prisma.course.findMany({ where: { coordinator: { managedById: chairmanId }, ...(program ? { batch: { degreeProgram: program } } : {}) }, select: { id: true } })).map((c) => c.id).concat("none") } } })) as { id: string; courseId: string }[];
  let n = 0;
  for (const l of locks) {
    const s = await courseSettings(l.courseId);
    const r = await courseCloResults(l.courseId, { settings: s });
    await db.cloTermLock.update({ where: { id: l.id }, data: { recalcSettingsJson: JSON.stringify(s), recalcResultJson: JSON.stringify(r.clos.map((x) => ({ code: x.clo.code, clearedPct: x.clearedPct, achieved: x.achieved, notAssessed: x.notAssessed, levels: x.levels }))), recalculatedAt: new Date(), recalculatedById: user.id } });
    n++;
  }
  await writeAuditLog({ actorUserId: user.id, action: "CLO_PAST_TERMS_RECALCULATED", entityType: "CloTermLock", entityId: chairmanId, metadata: { program: program || "all", courses: n } });
  return n;
}
export async function termLocks(courseId: string) {
  return (await db.cloTermLock.findMany({ where: { courseId }, orderBy: [{ termYear: "desc" }] }).catch(() => [])) as { termName: string; termYear: number; settingsJson: string; resultJson: string; recalcSettingsJson: string | null; recalcResultJson: string | null; lockedAt: Date; recalculatedAt: Date | null }[];
}

// ---- a course's own method / lab share (OMC approval: 2 approvals, or the course's panel)
const KIND = { METHOD: "CLO_METHOD", LAB_SHARE: "LAB_SHARE" } as const;
export async function requestCourse(user: { id: string; name: string }, courseId: string, kind: "METHOD" | "LAB_SHARE", value: { method?: string; pct?: number }, reason: string) {
  const c = await courseInfo(courseId);
  if (!c) throw new Error("Course not found.");
  if (![c.subjectExpertId, c.coordinatorId, c.instructorId].includes(user.id)) throw new Error("Only the course's Subject Expert, Program Lead or teacher asks for this.");
  if (reason.trim().length < 5) throw new Error("Give the reason.");
  const v = kind === "METHOD" ? { method: asMethod(value.method) } : { pct: Math.max(0, Math.min(100, Number(value.pct))) };
  await db.courseCloRequest.updateMany({ where: { courseId, kind, status: "PENDING" }, data: { status: "WITHDRAWN" } });
  const id = randomUUID();
  await db.courseCloRequest.create({ data: { id, courseId, kind, valueJson: JSON.stringify(v), reason: reason.trim().slice(0, 1000), requestedById: user.id } });
  const omc = await omcOfCourse(courseId);
  await notifyUsers(omc?.members.map((m) => m.id) || [], { kind: "REQUEST", title: `${c.code}: ${kind === "METHOD" ? `CLO method "${METHODS[(v as { method: Method }).method].label}"` : `lab share ${(v as { pct: number }).pct}%`} requested`, body: reason.slice(0, 200), href: "/omc/clo-attainment?tab=requests", exceptId: user.id }).catch(() => null);
  return id;
}
export async function voteCourse(user: { id: string; name: string }, id: string, approve: boolean, reason: string) {
  const r = await db.courseCloRequest.findUnique({ where: { id } });
  if (!r || r.status !== "PENDING") throw new Error("This request is not open.");
  const v = await voteOnRequest(user, KIND[r.kind as "METHOD" | "LAB_SHARE"] as never, id, r.courseId, approve, reason);
  if (v.decided) await db.courseCloRequest.update({ where: { id }, data: { status: v.decided === "approved" ? "APPROVED" : "REJECTED", decidedAt: new Date() } });
  return v;
}
export async function openRequests(chairmanId: string) {
  const rows = (await db.courseCloRequest.findMany({ where: { status: "PENDING" }, orderBy: { createdAt: "asc" } }).catch(() => [])) as { id: string; courseId: string; kind: string; valueJson: string; reason: string; createdAt: Date }[];
  const courses = await prisma.course.findMany({ where: { id: { in: rows.map((r) => r.courseId).concat("none") }, coordinator: { managedById: chairmanId } }, select: { id: true, code: true, title: true } });
  const out = [];
  for (const r of rows) { const c = courses.find((x) => x.id === r.courseId); if (!c) continue; out.push({ ...r, course: `${c.code} ${c.title}`, value: J<Record<string, unknown>>(r.valueJson, {}), votes: (await requestVotes(KIND[r.kind as "METHOD" | "LAB_SHARE"] as never, r.id, r.courseId)).line }); }
  return out;
}

// ---- assessment types (the OMC's list; seeded on first use)
export type TypeRow = TypeDef & { id: string; retired: boolean; sort: number };
export async function typesOf(chairmanId: string): Promise<TypeRow[]> {
  let rows = (await db.assessmentTypeDef.findMany({ where: { chairmanId }, orderBy: [{ sort: "asc" }] })) as Record<string, any>[];
  if (!rows.length && chairmanId) {
    await db.assessmentTypeDef.createMany({ data: SEED_TYPES.map((t, i) => ({ id: randomUUID(), chairmanId, key: t.key, name: t.name, family: t.family, part: t.part, marking: t.marking, groupWork: t.group, defaultNotForClo: t.defaultNotForClo, evidence: t.evidence, graded: t.graded, ccp: !!t.ccp, sort: i })), skipDuplicates: true });
    rows = await db.assessmentTypeDef.findMany({ where: { chairmanId }, orderBy: [{ sort: "asc" }] });
  }
  return rows.map((r) => ({ id: r.id, key: r.key, name: r.name, family: r.family, part: r.part, marking: r.marking, group: r.groupWork, defaultNotForClo: r.defaultNotForClo, evidence: r.evidence, graded: r.graded, ccp: r.ccp, retired: r.retired, sort: r.sort }));
}
export async function saveType(chairmanId: string, t: Partial<TypeRow> & { name: string }) {
  if (!t.name.trim()) throw new Error("Give the type a name.");
  const key = (t.key || t.name).trim().toUpperCase().replace(/[^A-Z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 60);
  const data = { name: t.name.trim().slice(0, 120), family: (t.family || "Other").slice(0, 60), part: ["THEORY", "LAB", "BOTH"].includes(String(t.part)) ? t.part : "BOTH", marking: ["MARKS", "RUBRIC", "AUTO", "PASS_FAIL"].includes(String(t.marking)) ? t.marking : "MARKS", groupWork: !!t.group, defaultNotForClo: !!t.defaultNotForClo, evidence: (t.evidence || "paper").slice(0, 60), graded: t.graded !== false, ccp: !!t.ccp, retired: !!t.retired };
  if (!data.graded) data.defaultNotForClo = true; // a survey is never counted in CLO marks
  await db.assessmentTypeDef.upsert({ where: { chairmanId_key: { chairmanId, key } }, create: { id: randomUUID(), chairmanId, key, ...data, sort: 999 }, update: data });
}

/** Mid / final questions with no CLO — a paper can't be submitted with one. */
export async function unmappedQuestions(courseId: string, examType: string, source: "SE" | "INSTRUCTOR" = "INSTRUCTOR") {
  const { items } = await courseItems(courseId, source);
  const fromItems = items.filter((i) => i.isQuestion && i.type === examType && !i.clos.length).map((i) => i.label);
  const fromPaper = (await prisma.paperDistributionItem.findMany({ where: { courseId, source, examType, cloId: null }, select: { questionNo: true } })).map((q) => `${examType} Q${q.questionNo}`);
  return Array.from(new Set([...fromPaper, ...fromItems]));
}
