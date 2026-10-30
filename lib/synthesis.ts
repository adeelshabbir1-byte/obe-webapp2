import { randomUUID } from "crypto";
import { prisma } from "./db";
import { writeAuditLog } from "./audit";
import { notifyUsers } from "./notifications";
import { lockedContent } from "./goldenCopy";
import { synthesisChecks, synthesize, type Parts, type Picks, type Proposal } from "./synthesisCore";

// Collaborative drafting: Subject Experts and teachers submit parallel proposals for any course of a subject chain
// (courses linked by prerequisites, e.g. Programming Fundamentals → OOP → Data Structures); the Program Lead or the
// committee lead synthesizes the final master course by picking parts from the proposals, checked as they go.

const db = prisma as unknown as Record<string, any>;
const J = <T>(s: string | null | undefined, d: T): T => { try { return s ? (JSON.parse(s) as T) : d; } catch { return d; } };

/** The course's current content as proposal parts (the starting point for a new proposal). */
export async function currentParts(masterCourseId: string): Promise<Parts> {
  const c = await prisma.masterCourse.findUniqueOrThrow({ where: { id: masterCourseId }, select: { catalogDescription: true, textbook: true, referenceMaterial: true, seedClos: { orderBy: { orderIndex: "asc" }, select: { statement: true, bloomLevel: true } }, seedTopics: { orderBy: { lectureNumber: "asc" }, select: { lectureNumber: true, topic: true, subtopic: true, cloNumber: true } } } });
  const [lab, as] = await Promise.all([db.masterLabPlan.findMany({ where: { masterCourseId }, orderBy: { week: "asc" } }).catch(() => []), db.masterCourseAssessment.findUnique({ where: { masterCourseId } }).catch(() => null)]);
  return {
    description: c.catalogDescription || "", clos: c.seedClos.map((x) => ({ statement: x.statement, bloom: x.bloomLevel })),
    topics: c.seedTopics.map((t) => ({ n: t.lectureNumber, topic: t.topic, sub: t.subtopic || undefined, clo: t.cloNumber })),
    labPlan: (lab as { week: number; experiment: string }[]).map((l) => ({ week: l.week, experiment: l.experiment })), assessments: J(as?.itemsJson, []),
    books: [...(c.textbook ? [{ title: c.textbook, kind: "TEXT" as const }] : []), ...(c.referenceMaterial || "").split(/\n/).map((x) => x.trim()).filter(Boolean).map((t) => ({ title: t, kind: "REFERENCE" as const }))],
  };
}
/** The subject chain a course belongs to: its prerequisite ancestors and the courses that build on it, in order. */
export async function chainOf(masterCourseId: string) {
  const mc = await prisma.masterCourse.findUniqueOrThrow({ where: { id: masterCourseId }, select: { masterCurriculumId: true } });
  const all = await prisma.masterCourse.findMany({ where: { masterCurriculumId: mc.masterCurriculumId }, select: { id: true, code: true, title: true, prerequisiteCourseId: true, semesterNumber: true } });
  const up: typeof all = [];
  let cur = all.find((x) => x.id === masterCourseId);
  for (let i = 0; i < 12 && cur?.prerequisiteCourseId; i++) { const p = all.find((x) => x.id === cur!.prerequisiteCourseId); if (!p || up.includes(p)) break; up.unshift(p); cur = p; }
  const down: typeof all = [];
  const walk = (id: string, depth: number) => { if (depth > 6) return; for (const k of all.filter((x) => x.prerequisiteCourseId === id)) { if (!down.includes(k)) { down.push(k); walk(k.id, depth + 1); } } };
  walk(masterCourseId, 0);
  return [...up, all.find((x) => x.id === masterCourseId)!, ...down.sort((a, b) => (a.semesterNumber ?? 9) - (b.semesterNumber ?? 9))];
}

export async function proposalsOf(masterCourseId: string): Promise<(Proposal & { note: string | null; createdAt: Date })[]> {
  const rows = (await db.courseProposal.findMany({ where: { masterCourseId }, orderBy: { createdAt: "asc" } }).catch(() => [])) as { id: string; authorName: string; partsJson: string; note: string | null; createdAt: Date }[];
  return rows.map((r) => ({ id: r.id, author: r.authorName, parts: J<Parts>(r.partsJson, { description: "", clos: [], topics: [], labPlan: [], assessments: [], books: [] }), note: r.note, createdAt: r.createdAt }));
}
/** Parses the proposal editor's text boxes. */
export function partsFromText(t: { description?: string; clos?: string; topics?: string; labPlan?: string; assessments?: string; books?: string }): Parts {
  const lines = (s?: string) => (s || "").split(/\r?\n/).map((x) => x.trim()).filter(Boolean);
  return {
    description: (t.description || "").trim(),
    clos: lines(t.clos).map((l) => { const [s, b] = l.split("|").map((x) => x.trim()); return { statement: s, bloom: (b || "C2").toUpperCase() }; }),
    topics: lines(t.topics).slice(0, 32).map((l, i) => { const [topic, clo] = l.split("|").map((x) => x.trim()); return { n: i + 1, topic, clo: Number(clo) || null }; }),
    labPlan: lines(t.labPlan).slice(0, 16).map((l, i) => ({ week: i + 1, experiment: l })),
    assessments: lines(t.assessments).map((l) => { const m = /^(.+?)\s+(\d+(?:\.\d+)?)\s*%?$/.exec(l); return { type: m ? m[1] : l, pct: m ? Number(m[2]) : 0 }; }),
    books: lines(t.books).map((b, i) => ({ title: b, kind: i ? "REFERENCE" as const : "TEXT" as const })),
  };
}
export async function submitProposal(user: { id: string; name: string }, masterCourseId: string, parts: Parts, note: string) {
  if (!parts.clos.length || !parts.topics.length) throw new Error("A proposal needs CLOs and a lecture plan.");
  const id = randomUUID();
  await db.courseProposal.create({ data: { id, masterCourseId, authorId: user.id, authorName: user.name, note: note.slice(0, 500) || null, partsJson: JSON.stringify(parts) } });
  const mc = await prisma.masterCourse.findUnique({ where: { id: masterCourseId }, select: { code: true, title: true, designerId: true } });
  await notifyUsers([mc?.designerId], { kind: "CURRICULUM", title: `New proposal for ${mc?.code} ${mc?.title}`, body: `by ${user.name}`, href: "/curricula" }).catch(() => null);
  return id;
}

async function courseInfo(masterCourseId: string) {
  const c = await prisma.masterCourse.findUniqueOrThrow({ where: { id: masterCourseId }, select: { id: true, code: true, title: true, creditHours: true, category: true, prerequisiteCourseId: true, masterCurriculumId: true, seedClos: { orderBy: { orderIndex: "asc" }, select: { mappedPloId: true } } } });
  const [lab, gate] = await Promise.all([db.masterCourseLab.findUnique({ where: { masterCourseId } }).catch(() => null), db.masterCourseGate.findUnique({ where: { masterCourseId } }).catch(() => null)]);
  return { ...c, labCredits: (lab?.labCredits as number) || 0, noPrereq: !!gate?.noPrereq };
}
/** Preview a synthesis: the result and its checks (Gate 3 + the Golden Copy's locked content). */
export async function preview(masterCourseId: string, picks: Picks) {
  const [ps, info, locked] = await Promise.all([proposalsOf(masterCourseId), courseInfo(masterCourseId), lockedContent(masterCourseId)]);
  const current: Proposal = { id: "CURRENT", author: "Current course", parts: await currentParts(masterCourseId) };
  const result = synthesize([current, ...ps], picks);
  const ploOf = (i: number) => (info.seedClos[i]?.mappedPloId ? [info.seedClos[i].mappedPloId!] : ["unmapped"]);
  const checks = synthesisChecks(result, { id: info.id, code: info.code, title: info.title, creditHours: info.creditHours, labCredits: info.labCredits, category: info.category, prerequisiteId: info.prerequisiteCourseId, noPrereq: info.noPrereq, ploOf }, locked);
  return { result, checks, locked: !!locked };
}
/** Apply the synthesized course to the master course (CLOs keep their PLO mapping by position). */
export async function applySynthesis(user: { id: string; name: string }, masterCourseId: string, picks: Picks) {
  const { result, checks } = await preview(masterCourseId, picks);
  if (!checks.ok) throw new Error(`Not compliant yet: ${checks.issues.slice(0, 3).join(" · ")}`);
  const old = await prisma.masterCourseClo.findMany({ where: { masterCourseId }, orderBy: { orderIndex: "asc" }, select: { id: true, mappedPloId: true, ploMappingSource: true } });
  await prisma.$transaction(async (tx) => {
    await tx.masterCourse.update({ where: { id: masterCourseId }, data: { catalogDescription: result.description || null, textbook: result.books.find((b) => b.kind === "TEXT")?.title || null, referenceMaterial: result.books.filter((b) => b.kind === "REFERENCE").map((b) => b.title).join("\n") || null } });
    for (const [i, c] of result.clos.entries()) {
      if (old[i]) await tx.masterCourseClo.update({ where: { id: old[i].id }, data: { statement: c.statement, bloomLevel: c.bloom, orderIndex: i } });
      else await tx.masterCourseClo.create({ data: { masterCourseId, statement: c.statement, bloomLevel: c.bloom, orderIndex: i } });
    }
    if (old.length > result.clos.length) await tx.masterCourseClo.deleteMany({ where: { id: { in: old.slice(result.clos.length).map((o) => o.id) } } });
    await tx.masterCourseTopic.deleteMany({ where: { masterCourseId } });
    await tx.masterCourseTopic.createMany({ data: result.topics.map((t) => ({ masterCourseId, lectureNumber: t.n, topic: t.topic, subtopic: t.sub || null, cloNumber: t.clo })) });
  });
  await db.masterLabPlan.deleteMany({ where: { masterCourseId } }).catch(() => null);
  if (result.labPlan.length) await db.masterLabPlan.createMany({ data: result.labPlan.map((l) => ({ masterCourseId, week: l.week, experiment: l.experiment.slice(0, 300) })) }).catch(() => null);
  await db.masterCourseAssessment.upsert({ where: { masterCourseId }, create: { masterCourseId, itemsJson: JSON.stringify(result.assessments), updatedById: user.id }, update: { itemsJson: JSON.stringify(result.assessments), updatedById: user.id, updatedAt: new Date() } });
  await db.courseSynthesis.create({ data: { id: randomUUID(), masterCourseId, byId: user.id, picksJson: JSON.stringify(picks) } });
  await writeAuditLog({ actorUserId: user.id, action: "COURSE_SYNTHESIZED", entityType: "MasterCourse", entityId: masterCourseId, metadata: { picks: JSON.stringify(picks).slice(0, 400) } });
}
