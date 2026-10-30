import { randomUUID } from "crypto";
import { prisma } from "./db";
import { writeAuditLog } from "./audit";
import { gates, translateCategory, type GCourse, type GKind, type GType } from "./stageGateCore";

// The HEC stage-gates of a curriculum, from the database: the builder's categories and courses with their CLOs, PLO
// mapping, lecture plan, lab credits and the gate side tables. Publishing (and submitting) a national curriculum is
// refused until all three gates pass. Also: the category transition map for a revision seeded from an older one.

const db = prisma as unknown as Record<string, any>;
export const GATES_HINT = "Run prisma/migration_stage_gates.sql in Supabase first.";

export async function gateData(curriculumId: string) {
  const [meta, types, courses, plos] = await Promise.all([
    db.curriculumGateMeta.findUnique({ where: { curriculumId } }).catch(() => null),
    db.curriculumType.findMany({ where: { curriculumId }, orderBy: { position: "asc" } }).catch(() => []) as Promise<{ name: string; kind: string; minCourses: number | null; minCredits: number | null }[]>,
    prisma.masterCourse.findMany({ where: { masterCurriculumId: curriculumId }, orderBy: [{ semesterNumber: "asc" }, { code: "asc" }], select: { id: true, code: true, title: true, creditHours: true, category: true, catalogDescription: true, prerequisiteCourseId: true, seedClos: { select: { id: true, orderIndex: true, bloomLevel: true, mappedPloId: true }, orderBy: { orderIndex: "asc" } }, seedTopics: { select: { lectureNumber: true, cloNumber: true } } } }),
    prisma.masterPLO.findMany({ where: { masterCurriculumId: curriculumId }, select: { id: true, number: true, title: true }, orderBy: { number: "asc" } }),
  ]);
  const ids = courses.map((c) => c.id).concat("none");
  const cloIds = courses.flatMap((c) => c.seedClos.map((x) => x.id)).concat("none");
  const [labs, gatesRows, weights, labPlans, deps] = await Promise.all([
    db.masterCourseLab.findMany({ where: { masterCourseId: { in: ids } } }).catch(() => []) as Promise<{ masterCourseId: string; labCredits: number }[]>,
    db.masterCourseGate.findMany({ where: { masterCourseId: { in: ids } } }).catch(() => []) as Promise<{ masterCourseId: string; noPrereq: boolean }[]>,
    db.masterCloWeight.findMany({ where: { cloId: { in: cloIds } } }).catch(() => []) as Promise<{ cloId: string; ploId: string; pct: number }[]>,
    db.masterLabPlan.findMany({ where: { masterCourseId: { in: ids } } }).catch(() => []) as Promise<{ masterCourseId: string; week: number; experiment: string }[]>,
    db.masterTopicDep.findMany({ where: { masterCourseId: { in: ids } } }).catch(() => []) as Promise<{ id: string; masterCourseId: string; lectureNumber: number; onCourseId: string; onLecture: number }[]>,
  ]);
  const gcourses: GCourse[] = courses.map((c) => ({
    id: c.id, code: c.code, title: c.title, creditHours: c.creditHours, labCredits: labs.find((l) => l.masterCourseId === c.id)?.labCredits || 0, category: c.category, description: c.catalogDescription,
    prerequisiteId: c.prerequisiteCourseId, noPrereq: !!gatesRows.find((g) => g.masterCourseId === c.id)?.noPrereq,
    clos: c.seedClos.map((x, i) => ({ id: x.id, n: i + 1, bloom: x.bloomLevel, ploIds: Array.from(new Set([...(x.mappedPloId ? [x.mappedPloId] : []), ...weights.filter((w) => w.cloId === x.id).map((w) => w.ploId)])) })),
    weights: weights.filter((w) => c.seedClos.some((x) => x.id === w.cloId)),
    topics: c.seedTopics.map((t) => ({ lecture: t.lectureNumber, cloNumber: t.cloNumber })),
    labWeeks: labPlans.filter((p) => p.masterCourseId === c.id).map((p) => p.week),
    topicDeps: deps.filter((d) => d.masterCourseId === c.id).map((d) => ({ lecture: d.lectureNumber, onCourseId: d.onCourseId, onLecture: d.onLecture })),
  }));
  const gtypes: GType[] = types.map((t) => ({ name: t.name, kind: t.kind as GKind, minCourses: t.minCourses, minCredits: t.minCredits }));
  const totalCredits = (meta?.totalCredits as number | null) ?? null;
  return { totalCredits, types: gtypes, courses: gcourses, plos, labPlans, deps, result: gates(totalCredits, gtypes, gcourses) };
}

/** Publishing or submitting a national curriculum: refused until every gate passes. */
export async function assertPublishable(curriculumId: string) {
  const c = await prisma.masterCurriculum.findUnique({ where: { id: curriculumId }, select: { chairmanId: true } });
  if (!c || c.chairmanId !== null) return; // institutes' own curricula: the institutional guardrails apply instead
  const { result } = await gateData(curriculumId);
  if (result.publishable) return;
  const first = [...result.g1, ...result.g2, ...result.g3.issues][0];
  throw new Error(`The HEC stage-gates are not passed (Gate ${first?.gate}: ${first?.text}). ${result.g3.compliant} of ${result.g3.total} courses are compliant. Open "Stage-gates" to see everything.`);
}

type U = { id: string };
export async function setTotal(user: U, curriculumId: string, total: number) {
  if (!(total > 0 && total <= 300)) throw new Error("Give the total credit hours.");
  await db.curriculumGateMeta.upsert({ where: { curriculumId }, create: { curriculumId, totalCredits: Math.round(total), updatedById: user.id }, update: { totalCredits: Math.round(total), updatedById: user.id, updatedAt: new Date() } });
}
export async function setNoPrereq(masterCourseId: string, on: boolean) {
  await db.masterCourseGate.upsert({ where: { masterCourseId }, create: { masterCourseId, noPrereq: on }, update: { noPrereq: on } });
}
/** One PLO's CLO weights for a course — must add up to 100. */
export async function setWeights(masterCourseId: string, ploId: string, weights: Record<string, number>) {
  const clos = await prisma.masterCourseClo.findMany({ where: { masterCourseId }, select: { id: true } });
  const rows = Object.entries(weights).filter(([cloId, pct]) => clos.some((c) => c.id === cloId) && Number(pct) > 0).map(([cloId, pct]) => ({ cloId, ploId, pct: Number(pct) }));
  const sum = Math.round(rows.reduce((a, r) => a + r.pct, 0) * 100) / 100;
  if (rows.length && Math.abs(sum - 100) > 0.01) throw new Error(`The weights add up to ${sum}%, not 100%.`);
  await db.masterCloWeight.deleteMany({ where: { ploId, cloId: { in: clos.map((c) => c.id) } } });
  if (rows.length) await db.masterCloWeight.createMany({ data: rows });
}
export async function setLabWeek(masterCourseId: string, week: number, experiment: string) {
  if (!(week >= 1 && week <= 16)) throw new Error("Week 1–16.");
  if (!experiment.trim()) { await db.masterLabPlan.deleteMany({ where: { masterCourseId, week } }); return; }
  await db.masterLabPlan.upsert({ where: { masterCourseId_week: { masterCourseId, week } }, create: { masterCourseId, week, experiment: experiment.trim().slice(0, 300) }, update: { experiment: experiment.trim().slice(0, 300) } });
}
export async function addTopicDep(curriculumId: string, d: { masterCourseId: string; lectureNumber: number; onCourseId: string; onLecture: number }) {
  const both = await prisma.masterCourse.count({ where: { id: { in: [d.masterCourseId, d.onCourseId] }, masterCurriculumId: curriculumId } });
  if (both < (d.masterCourseId === d.onCourseId ? 1 : 2)) throw new Error("Choose courses of this curriculum.");
  const before = await gateData(curriculumId);
  const test = before.courses.map((c) => (c.id === d.masterCourseId ? { ...c, topicDeps: [...c.topicDeps, { lecture: d.lectureNumber, onCourseId: d.onCourseId, onLecture: d.onLecture }] } : c));
  const { findCycle } = await import("./stageGateCore");
  if (findCycle(test.flatMap((c) => c.topicDeps.map((x) => [`${c.id}:${x.lecture}`, `${x.onCourseId}:${x.onLecture}`] as [string, string])))) throw new Error("That dependency would make a cycle.");
  await db.masterTopicDep.create({ data: { id: randomUUID(), ...d } });
}

// ---- evolutionary seeding: category transition map
export async function categoryMap(curriculumId: string) { return (await db.categoryMap.findMany({ where: { curriculumId } }).catch(() => [])) as { fromName: string; toName: string }[]; }
export async function setCategoryMap(curriculumId: string, fromName: string, toName: string) {
  if (!fromName.trim()) throw new Error("Name the old category.");
  if (!toName.trim()) { await db.categoryMap.deleteMany({ where: { curriculumId, fromName } }); return; }
  await db.categoryMap.upsert({ where: { curriculumId_fromName: { curriculumId, fromName: fromName.trim() } }, create: { curriculumId, fromName: fromName.trim(), toName: toName.trim() }, update: { toName: toName.trim() } });
}
/** Re-assigns courses carried over from the seed curriculum to the new revision's categories. */
export async function applyCategoryMap(user: U, curriculumId: string) {
  const map = await categoryMap(curriculumId);
  const types = (await db.curriculumType.findMany({ where: { curriculumId }, select: { name: true } })) as { name: string }[];
  const courses = await prisma.masterCourse.findMany({ where: { masterCurriculumId: curriculumId }, select: { id: true, category: true } });
  let n = 0;
  for (const c of courses) {
    const to = translateCategory(c.category, map);
    if (!to || to === c.category || !types.some((t) => t.name === to)) continue;
    await prisma.masterCourse.update({ where: { id: c.id }, data: { category: to } });
    n++;
  }
  await writeAuditLog({ actorUserId: user.id, action: "CURRICULUM_CATEGORIES_TRANSLATED", entityType: "MasterCurriculum", entityId: curriculumId, metadata: { moved: n, rules: map.length } });
  return n;
}
/** Categories of the curriculum this revision was seeded from (for the mapping table). */
export async function seedCategories(curriculumId: string) {
  const c = await prisma.masterCurriculum.findUnique({ where: { id: curriculumId }, select: { parentCurriculumId: true } });
  const fromCourses = Array.from(new Set((await prisma.masterCourse.findMany({ where: { masterCurriculumId: curriculumId }, select: { category: true } })).map((x) => x.category)));
  const parentTypes = c?.parentCurriculumId ? ((await db.curriculumType.findMany({ where: { curriculumId: c.parentCurriculumId }, select: { name: true } }).catch(() => [])) as { name: string }[]).map((t) => t.name) : [];
  return Array.from(new Set([...parentTypes, ...fromCourses])).sort();
}
