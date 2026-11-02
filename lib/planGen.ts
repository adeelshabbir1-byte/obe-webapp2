import { randomUUID } from "crypto";
import { prisma } from "./db";
import { writeAuditLog } from "./audit";
import { notifyUsers } from "./notifications";
import { saveSetting } from "./scopedSettings";
import { courseCtx, items, viewerFor, currentTerm, lastTaughtBefore, recordUse, adopt as adoptOfficial, paperOf, omcLimits } from "./qbank";
import { canSee, canUse, draftPaper, makeVariant, paperCheck, type DraftOpts, type Item } from "./qbankCore";
import { resting, defaultMinutes, usesOmcLimits, gaStanding, weakGas, planSwaps, effective, type CloStand } from "./planGenCore";

// Assessments generated from the Subject Expert's plan, steered by the class's graduate-attribute results (Adeel, 3 Nov 2026).
// Every quiz, assignment, mid and final of the plan can be generated from the question bank: its lectures (topics),
// CLOs and marks pre-filled; the teacher picks topics and the difficulty mix, previews, swaps single questions, adopts.
// After a tutorial on a weak GA, a paper keeps its difficulty, marks and length; only the topic mix moves toward the
// weak GA. The CQI record keeps the GA before and after.

const db = prisma as unknown as Record<string, any>;
type U = { id: string; role: string; name: string; managedById?: string | null };
const J = <T,>(s: string | null | undefined, d: T): T => { try { return s ? (JSON.parse(s) as T) : d; } catch { return d; } };
const OFFICIAL = /^(mid|final)/i;

async function roleIn(u: U, courseId: string) {
  const ctx = await courseCtx(courseId);
  const teaches = ctx.teacherIds.includes(u.id);
  let lead = false;
  if (!teaches || u.id !== ctx.seId) {
    const { loadTeams } = await import("./courseTeams");
    lead = (await loadTeams(ctx.chairmanId).catch(() => [])).some((t) => t.leadId === u.id && t.rows.some((r) => r.courseId === courseId));
  }
  const forAll = u.id === ctx.seId || lead || ctx.plIds.includes(u.id);
  return { ctx, teaches, forAll, may: teaches || forAll };
}

/** The plan's assessments for this course (the teacher's copy when there is one, else the SE's), with their lectures. */
async function planItems(courseId: string) {
  const own = await prisma.assessmentInstrument.count({ where: { courseId, source: "INSTRUCTOR" } });
  const source = own ? "INSTRUCTOR" : "SE";
  const insts = await prisma.assessmentInstrument.findMany({ where: { courseId, source, partOfId: null }, orderBy: [{ type: "asc" }, { label: "asc" }], select: { id: true, type: true, label: true, maxScore: true, marksPct: true, lectureLinks: { select: { lectureRow: { select: { lectureNumber: true, topic: true, clo: { select: { code: true } } } } } } } });
  return { source, list: insts.map((i) => ({ id: i.id, type: i.type, label: i.label, maxScore: i.maxScore, marksPct: i.marksPct, lectures: i.lectureLinks.map((l) => ({ n: l.lectureRow.lectureNumber, topic: l.lectureRow.topic, clo: l.lectureRow.clo?.code || null })).sort((a, b) => a.n - b.n) })) };
}

/** The class's standing per graduate attribute in this course, from its CLO results. */
export async function gaOfCourse(courseId: string) {
  const { courseCloResults } = await import("./cloMethods");
  const r = await courseCloResults(courseId).catch(() => null);
  const ids = (r?.clos || []).map((c) => (c.clo as { id: string }).id);
  const clos = await prisma.cLO.findMany({ where: { OR: [{ id: { in: ids.concat("none") } }, { courseId }] }, select: { id: true, code: true, source: true, mappedPlo: { select: { number: true } } } });
  const gaOf = new Map<string, string | null>();
  for (const c of clos) if (!gaOf.has(c.code) || c.source === "INSTRUCTOR") gaOf.set(c.code, c.mappedPlo ? `GA-${c.mappedPlo.number}` : null);
  const stands: CloStand[] = (r?.clos || []).map((c) => { const code = (c.clo as { code: string }).code; return { code, ga: gaOf.get(code) ?? null, avgPct: Number((c as { avgPct?: number }).avgPct) || 0, assessed: Number((c as { assessed?: number }).assessed) || 0 }; });
  const standing = gaStanding(stands);
  const target = Number((r?.settings as { passPct?: number } | undefined)?.passPct) || 50;
  return { standing, weak: weakGas(standing, target), target, cloGa: Object.fromEntries(Array.from(gaOf.entries())) as Record<string, string | null> };
}

async function cqiOpen(courseId: string) {
  return (await prisma.cqiRecord.findMany({ where: { courseId, sourceType: "PLO", sourceReference: { startsWith: "GA-" } }, orderBy: { createdAt: "desc" }, take: 20 }).catch(() => [])) as { id: string; sourceReference: string | null; finding: string; actionTaken: string | null; status: string; metricBefore: number | null; metricAfter: number | null; createdAt: Date }[];
}

/** Everything the "Generate from the plan" page shows. */
export async function board(u: U, courseId: string) {
  const r = await roleIn(u, courseId);
  if (!r.may) throw new Error("Only the course's teachers, its Subject Expert, Course Lead or Program Lead generate its assessments.");
  const [plan, ga, cqi, papers, term] = await Promise.all([planItems(courseId), gaOfCourse(courseId), cqiOpen(courseId), db.qbPaper.findMany({ where: { courseId }, orderBy: { createdAt: "desc" }, take: 60 }).catch(() => []), currentTerm(courseId)]);
  const byInst = new Map<string, { id: string; status: string; variant: string; createdAt: Date }[]>();
  for (const p of papers as { id: string; optsJson: string; status: string; variant: string; createdAt: Date; termLabel: string }[]) {
    const o = J<{ instrumentId?: string }>(p.optsJson, {}); if (!o.instrumentId || p.termLabel !== term) continue;
    byInst.set(o.instrumentId, [...(byInst.get(o.instrumentId) || []), { id: p.id, status: p.status, variant: p.variant, createdAt: p.createdAt }]);
  }
  const short = await shortfallOf(r.ctx.chairmanId, courseId);
  return { course: { id: courseId, code: r.ctx.course.code, title: r.ctx.course.title }, term, forAll: r.forAll, source: plan.source, assessments: plan.list.map((a) => ({ ...a, papers: byInst.get(a.id) || [] })), ga, cqi, short };
}

/** Uses that still rest this term, across every course with the same code (agreed gap: final 3 · mid 2 · other 1 term). */
async function restingIds(codes: string[], term: string) {
  const ids = (await prisma.course.findMany({ where: { code: { in: codes } }, select: { id: true } })).map((c) => c.id);
  const uses = ((await db.qbUse.findMany({ where: { courseId: { in: ids.concat("none") } }, select: { itemId: true, termLabel: true, examType: true } }).catch(() => [])) || []) as { itemId: string; termLabel: string; examType: string }[];
  return resting(uses, term);
}

async function bankFor(u: U, ctx: Awaited<ReturnType<typeof courseCtx>>) {
  const v = await viewerFor(u as never, ctx);
  const practice = await (await import("./practicePool")).poolFor(ctx.chairmanId, ctx.codes);
  return (await items(ctx.chairmanId, ctx.codes)).filter((x) => !x.mcq && x.type !== "MCQ_MULTI" && canSee(x, v) && canUse(x, u.id, true) && !practice.has(x.id)) as Item[];
}

export type GenBody = { instrumentId: string; lectures?: number[]; difficulty?: Record<string, number>; minutes?: number; examDate?: string | null; allSections?: boolean };

/** Generate one plan assessment. For all sections (SE / Course Lead / Program Lead) it also makes equivalent versions. */
export async function generate(u: U, courseId: string, b: GenBody) {
  const r = await roleIn(u, courseId);
  if (!r.may) throw new Error("forbidden");
  if (b.allSections && !r.forAll) throw new Error("Only the Subject Expert, the Course Lead or the Program Lead generates for all sections.");
  const { ctx } = r;
  const plan = await planItems(courseId);
  const inst = plan.list.find((i) => i.id === b.instrumentId);
  if (!inst) throw new Error("That assessment is not in this course's plan.");
  const pick = new Set((b.lectures?.length ? b.lectures : inst.lectures.map((l) => l.n)).map(Number));
  const lecs = inst.lectures.filter((l) => pick.has(l.n));
  const cloShares: Record<string, number> = {};
  for (const l of lecs) if (l.clo) cloShares[l.clo] = (cloShares[l.clo] || 0) + 1;
  if (!Object.keys(cloShares).length) throw new Error("Tick at least one lecture that is mapped to a CLO.");
  const term = await currentTerm(courseId);
  const official = usesOmcLimits(inst.type);
  const lim = official ? await omcLimits(ctx.chairmanId, /mid/i.test(inst.type) ? "Midterm" : "Final") : { minCloPct: 0, maxCloPct: 100 };
  const lastTaught = await lastTaughtBefore(courseId, b.examDate ? new Date(String(b.examDate)) : null, inst.type).catch(() => null);
  const pool = (await bankFor(u, ctx)).filter((x) => (x.lectureNumber !== null ? pick.has(x.lectureNumber) : !!cloShares[x.cloCodes[0]]));
  const opts: DraftOpts = { total: inst.maxScore, minutes: Number(b.minutes) || defaultMinutes(inst.type), cloShares, ...lim, difficulty: b.difficulty, lastTaught, exclude: await restingIds(ctx.codes, term), term };
  const d = draftPaper(pool, opts);
  const id = randomUUID();
  const examType = OFFICIAL.test(inst.type) ? (/mid/i.test(inst.type) ? "Midterm" : "Final") : inst.type;
  await db.qbPaper.create({ data: { id, courseId, examType, termLabel: term, variant: "A", itemIdsJson: JSON.stringify(d.chosen.map((q) => q.id)), optsJson: JSON.stringify({ ...opts, exclude: Array.from(opts.exclude), instrumentId: inst.id, label: inst.label, lectures: Array.from(pick), allSections: !!b.allSections }), checkJson: JSON.stringify({ ...d.check, gaps: d.gaps }), status: "DRAFT", createdById: u.id } });
  const versions: string[] = [];
  if (b.allSections) {
    const sections = await prisma.course.count({ where: { code: { in: ctx.codes }, coordinator: { managedById: ctx.chairmanId }, isOffered: true } });
    for (let i = 1; i < Math.min(Math.max(sections, 1), 6); i++) versions.push((await variantOf(u, id)).variant);
  }
  await noteShortfall(u, ctx, courseId, inst.label, d.gaps);
  await writeAuditLog({ actorUserId: u.id, action: "QB_PLAN_GENERATED", entityType: "Course", entityId: courseId, metadata: { instrument: inst.label, questions: d.chosen.length, gaps: d.gaps.length, allSections: !!b.allSections } });
  return { id, label: inst.label, chosen: d.chosen, check: d.check, gaps: d.gaps, versions, term, lastTaught };
}

async function variantOf(u: U, paperId: string) {
  const { p, ctx, questions, opts } = await paperOf(paperId);
  const siblings = (await db.qbPaper.findMany({ where: { OR: [{ id: p.parentId || p.id }, { parentId: p.parentId || p.id }] } })) as { itemIdsJson: string; variant: string }[];
  const taken = new Set(siblings.flatMap((s) => J<string[]>(s.itemIdsJson, [])).concat(J<string[]>(JSON.stringify(opts.exclude || []), [])));
  const v = makeVariant(questions as Item[], await bankFor(u, ctx), { exclude: taken, term: p.termLabel, lastTaught: opts.lastTaught ?? null });
  const letter = String.fromCharCode(65 + siblings.length);
  const check = paperCheck(v.chosen, { ...opts, cloShares: opts.cloShares || {} });
  await db.qbPaper.create({ data: { id: randomUUID(), courseId: p.courseId, examType: p.examType, termLabel: p.termLabel, variant: letter, parentId: p.parentId || p.id, itemIdsJson: JSON.stringify(v.chosen.map((q) => q.id)), optsJson: p.optsJson, checkJson: JSON.stringify({ ...check, missing: v.missing }), status: "DRAFT", createdById: u.id } });
  return { variant: letter, missing: v.missing };
}

/** A generated paper with its questions, for the preview. */
export async function view(u: U, paperId: string) {
  const { p, questions, opts } = await paperOf(paperId);
  const r = await roleIn(u, p.courseId);
  if (!r.may) throw new Error("forbidden");
  const versions = ((await db.qbPaper.findMany({ where: { OR: [{ id: p.parentId || p.id }, { parentId: p.parentId || p.id }] }, orderBy: { variant: "asc" }, select: { id: true, variant: true, status: true } }).catch(() => [])) || []) as { id: string; variant: string; status: string }[];
  return { id: p.id, status: p.status, variant: p.variant, examType: p.examType, label: (opts as { label?: string }).label || p.examType, check: J<Record<string, any>>(p.checkJson, {}), questions: (questions as Item[]).map((q) => ({ id: q.id, text: q.text, marks: q.marks, clo: q.cloCodes[0], bloom: q.bloom, difficulty: q.difficulty, measured: q.measuredDifficulty || null, lecture: q.lectureNumber, topic: q.topic })), versions };
}

async function saveQuestions(paperId: string, ids: string[]) {
  const { p, all, opts } = await paperOf(paperId);
  const qs = ids.map((i) => all.find((x) => x.id === i)).filter((x): x is NonNullable<typeof x> => !!x) as Item[];
  const check = paperCheck(qs, { ...opts, cloShares: opts.cloShares || {} });
  await db.qbPaper.update({ where: { id: paperId }, data: { itemIdsJson: JSON.stringify(ids), checkJson: JSON.stringify({ ...J<Record<string, unknown>>(p.checkJson, {}), ...check }) } });
  return check;
}

/** Swap one question for a similar one: same CLO and marks, the same Bloom level and difficulty where possible. */
export async function swapOne(u: U, paperId: string, questionId: string) {
  const { p, ctx, questions, opts } = await paperOf(paperId);
  if (!(await roleIn(u, p.courseId)).may) throw new Error("forbidden");
  if (p.status !== "DRAFT") throw new Error("This paper is adopted; generate a new one to change it.");
  const q = (questions as Item[]).find((x) => x.id === questionId); if (!q) throw new Error("Question not in this paper.");
  const exclude = new Set((questions as Item[]).map((x) => x.id).concat(J<string[]>(JSON.stringify(opts.exclude || []), [])));
  const v = makeVariant([q], await bankFor(u, ctx), { exclude, term: p.termLabel, lastTaught: opts.lastTaught ?? null });
  if (v.missing.length) throw new Error(`No similar question in the bank (${q.cloCodes[0]}, ${q.marks} marks). Add one, or ask the Subject Expert.`);
  const ids = (questions as Item[]).map((x) => (x.id === questionId ? v.chosen[0].id : x.id));
  return { check: await saveQuestions(paperId, ids) };
}

/** Adopt: the mid and final go to vetting and secure storage as before; a quiz or assignment is ready to print or set. */
export async function adoptPaper(u: U, paperId: string) {
  const { p, questions } = await paperOf(paperId);
  if (!(await roleIn(u, p.courseId)).may) throw new Error("forbidden");
  if (OFFICIAL.test(p.examType)) return adoptOfficial(u as never, paperId);
  const chk = J<{ ok: boolean; fails: string[] }>(p.checkJson, { ok: false, fails: [] });
  if (!chk.ok) throw new Error(`The paper does not pass its checks yet: ${chk.fails.join(" ")}`);
  await db.qbPaper.update({ where: { id: paperId }, data: { status: "ADOPTED" } });
  await recordUse(u as never, (questions as Item[]).map((q) => q.id), p.courseId, p.examType, p.termLabel, paperId);
  await writeAuditLog({ actorUserId: u.id, action: "QB_PLAN_ADOPTED", entityType: "Course", entityId: p.courseId, metadata: { examType: p.examType, variant: p.variant, questions: questions.length } });
  return { adopted: true, questions: questions.length };
}

// ------------------------------------------------------------ weak GA → tutorial → rebalanced paper → before / after

/** The teacher records a tutorial (or another remedy) for a weak GA: a CQI record with the GA's standing now. */
export async function recordTutorial(u: U, courseId: string, ga: string, note: string) {
  const r = await roleIn(u, courseId);
  if (!r.teaches && !r.forAll) throw new Error("forbidden");
  const g = (await gaOfCourse(courseId)).standing.find((x) => x.ga === ga);
  if (!g) throw new Error("That graduate attribute is not measured in this course.");
  const c = await prisma.course.findUnique({ where: { id: courseId }, select: { code: true, batchId: true } });
  const rec = await prisma.cqiRecord.create({ data: { chairmanId: r.ctx.chairmanId, authorId: u.id, lastUpdatedById: u.id, batchId: c?.batchId || null, courseId, sourceType: "PLO", sourceReference: ga, metricBefore: g.pct, status: "in-progress", finding: `${ga} is weak in ${c?.code || "this course"} (${g.pct}%) — its CLOs: ${g.clos.join(", ")}.`, actionTaken: `Tutorial: ${note.slice(0, 1000) || "held for the class"}` } as never });
  await writeAuditLog({ actorUserId: u.id, action: "CQI_RECORD_CREATED", entityType: "CqiRecord", entityId: (rec as { id: string }).id, metadata: { courseId, ga, before: g.pct } });
  return { id: (rec as { id: string }).id, before: g.pct };
}

/** Suggest, and (when asked) apply, swaps toward the weak GA. Beyond the OMC's CLO limits, a request to the OMC. */
export async function rebalance(u: U, paperId: string, ga: string, count: number, apply: boolean) {
  const { p, ctx, questions, opts } = await paperOf(paperId);
  const r = await roleIn(u, p.courseId);
  if (!r.may) throw new Error("forbidden");
  if (p.status !== "DRAFT") throw new Error("Rebalance before adopting: generate a new paper, then rebalance it.");
  const cqi = (await cqiOpen(p.courseId)).find((x) => x.sourceReference === ga && ["open", "in-progress"].includes(x.status));
  if (!cqi) throw new Error(`Record the tutorial for ${ga} first (CQI action), then rebalance.`);
  const gas = await gaOfCourse(p.courseId);
  const plan = planSwaps(questions as Item[], await bankFor(u, ctx), { cloGa: gas.cloGa, standing: gas.standing, weakGa: ga, count: Math.max(1, Math.min(10, count || 1)), exclude: new Set(J<string[]>(JSON.stringify(opts.exclude || []), [])), term: p.termLabel, lastTaught: opts.lastTaught ?? null, minCloPct: opts.minCloPct ?? 0, maxCloPct: opts.maxCloPct ?? 100, limits: usesOmcLimits(p.examType) });
  if (!apply) return plan;
  const map = new Map(plan.swaps.map((s) => [s.fromId, s.toId]));
  const ids = (questions as Item[]).map((q) => map.get(q.id) || q.id);
  const check = plan.swaps.length ? await saveQuestions(paperId, ids) : null;
  const order = (questions as Item[]).map((q) => q.id);
  const lines = plan.swaps.map((s) => `Q${order.indexOf(s.fromId) + 1} moved from ${s.fromTopic} (${s.fromClo}) to ${s.toTopic} (${s.toClo} → ${ga}), same ${s.marks} marks, ${s.difficulty.toLowerCase()}`);
  if (lines.length) await prisma.cqiRecord.update({ where: { id: cqi.id }, data: { actionTaken: `${cqi.actionTaken || ""}\n${p.examType} ${p.termLabel}: ${lines.join("; ")}.`.trim(), lastUpdatedById: u.id } as never });
  if (plan.needsOmc.length) {
    const omc = await prisma.user.findMany({ where: { isActive: true, role: "OMC" as never, managedById: ctx.chairmanId }, select: { id: true } }).catch(() => []);
    await notifyUsers(omc.map((x) => x.id), { kind: "OMC", title: `${ctx.course.code}: change to the ${p.examType} CLO shares requested`, body: `${u.name} asks to move ${plan.needsOmc.length} question(s) toward ${ga} after a tutorial; this goes beyond the CLO limits. ${plan.needsOmc.map((s) => `${s.fromClo} → ${s.toClo} (${s.marks} marks)`).join("; ")}`, href: `/plan-generate?courseId=${p.courseId}` });
  }
  await writeAuditLog({ actorUserId: u.id, action: "QB_PAPER_REBALANCED", entityType: "Course", entityId: p.courseId, metadata: { paperId, ga, swaps: plan.swaps.length, toOmc: plan.needsOmc.length } });
  return { ...plan, check, lines };
}

/** Close the loop: the GA now (after the final), effective or not, saved on the CQI record as evidence. */
export async function recheck(u: U, courseId: string, cqiId: string) {
  const r = await roleIn(u, courseId);
  if (!r.may) throw new Error("forbidden");
  const rec = (await cqiOpen(courseId)).find((x) => x.id === cqiId);
  if (!rec || !rec.sourceReference) throw new Error("CQI record not found.");
  const g = (await gaOfCourse(courseId)).standing.find((x) => x.ga === rec.sourceReference);
  if (!g) throw new Error("No result for that GA yet.");
  const ok = effective(rec.metricBefore ?? 0, g.pct);
  await prisma.cqiRecord.update({ where: { id: cqiId }, data: { metricAfter: g.pct, status: ok ? "verified-effective" : "verified-ineffective", verifiedById: u.id, verifiedAt: new Date(), lastUpdatedById: u.id } as never });
  await writeAuditLog({ actorUserId: u.id, action: "CQI_RECORD_UPDATED", entityType: "CqiRecord", entityId: cqiId, metadata: { before: rec.metricBefore, after: g.pct, effective: ok } });
  return { before: rec.metricBefore, after: g.pct, effective: ok };
}

// ------------------------------------------------------------ bank shortfall → a task for the Subject Expert

const shortKey = (courseId: string) => `qbank.short.${courseId}`;
async function shortfallOf(chairmanId: string, courseId: string): Promise<{ at: string; label: string; gaps: string[] } | null> {
  const row = await db.scopedSetting?.findFirst({ where: { chairmanId, scopeType: "INSTITUTE", scopeId: chairmanId, key: shortKey(courseId) } }).catch(() => null);
  const v = J<{ at: string; label: string; gaps: string[] } | null>(row?.value, null);
  return v && v.gaps?.length ? v : null;
}
async function noteShortfall(u: U, ctx: Awaited<ReturnType<typeof courseCtx>>, courseId: string, label: string, gaps: string[]) {
  const before = await shortfallOf(ctx.chairmanId, courseId);
  await saveSetting(ctx.chairmanId, "INSTITUTE", ctx.chairmanId, shortKey(courseId), JSON.stringify(gaps.length ? { at: new Date().toISOString(), label, gaps } : { gaps: [] }), u.id).catch(() => null);
  if (gaps.length && ctx.seId && JSON.stringify(before?.gaps) !== JSON.stringify(gaps)) await notifyUsers([ctx.seId], { kind: "QBANK", title: `${ctx.course.code}: the question bank is short for ${label}`, body: gaps.join("; "), href: `/question-bank?courseId=${courseId}`, exceptId: u.id });
}
/** Open shortfalls of the SE's courses (a task in Next tasks). */
export async function shortfallsFor(seId: string) {
  const cs = await prisma.course.findMany({ where: { subjectExpertId: seId }, take: 30, select: { id: true, code: true, coordinator: { select: { managedById: true } } } });
  const out: { courseId: string; code: string; label: string; gaps: string[] }[] = [];
  for (const c of cs) { const s = await shortfallOf(c.coordinator.managedById || "", c.id); if (s) out.push({ courseId: c.id, code: c.code, label: s.label, gaps: s.gaps }); }
  return out;
}
