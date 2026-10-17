import { prisma } from "./db";
import { batchPloWeights } from "./ploWeights";
import { weightedAttainment } from "./ploWeightMath";
import { getPassingCriteria } from "./passingCriteria";

const xdb = prisma as unknown as Record<string, any>;
export const PLO_DROP_ALERT = 2; // % points

type Delta = { plo: number; before: number | null; after: number | null };

/** Batch PLO attainment (share of students reaching the PLO, weighted by the batch's course weights) over a set of courses. */
function attainOver(plo: { courses: { id: string; weight: number; attainment: number | null }[] }, ids: Set<string>) {
  const w: Record<string, number> = {}, a: Record<string, number | null> = {};
  for (const c of plo.courses) if (ids.has(c.id)) { w[c.id] = c.weight; a[c.id] = c.attainment; }
  return weightedAttainment(w, a);
}

async function batchData(batchId: string) {
  const b = await prisma.batch.findUnique({ where: { id: batchId }, select: { coordinator: { select: { managedById: true } } } });
  const criteria = await getPassingCriteria(b?.coordinator.managedById);
  return batchPloWeights(batchId, true, criteria);
}

/** Records the PLO change for one just-approved course; returns the deltas. */
export async function recordPloChange(courseId: string) {
  const course = await prisma.course.findUnique({ where: { id: courseId }, select: { id: true, code: true, batchId: true } });
  if (!course?.batchId) return null;
  const w = await batchData(course.batchId);
  const approved = new Set(((await xdb.courseResult.findMany({ where: { course: { batchId: course.batchId }, status: "APPROVED" }, select: { courseId: true } }).catch(() => [])) as { courseId: string }[]).map((r) => r.courseId));
  approved.add(course.id);
  const without = new Set(Array.from(approved).filter((id) => id !== course.id));
  const deltas: Delta[] = w.plos.filter((p) => p.courses.some((c) => c.id === course.id)).map((p) => ({ plo: p.number, before: attainOver(p, without), after: attainOver(p, approved) }));
  await xdb.ploChangeLog.upsert({ where: { courseId: course.id }, create: { batchId: course.batchId, courseId: course.id, courseCode: course.code, approvedAt: new Date(), deltasJson: JSON.stringify(deltas) }, update: { deltasJson: JSON.stringify(deltas) } }).catch(() => null);
  return { batchId: course.batchId, code: course.code, deltas };
}

/** Fills the log for a batch's earlier approved results, in approval order. */
export async function backfillPloChanges(batchId: string) {
  const w = await batchData(batchId);
  const results = (await xdb.courseResult.findMany({ where: { course: { batchId }, status: "APPROVED" }, orderBy: { decidedAt: "asc" }, select: { courseId: true, decidedAt: true, course: { select: { code: true } } } }).catch(() => [])) as { courseId: string; decidedAt: Date | null; course: { code: string } }[];
  const sofar = new Set<string>();
  let n = 0;
  for (const r of results) {
    const before = new Set(sofar); sofar.add(r.courseId);
    const deltas: Delta[] = w.plos.filter((p) => p.courses.some((c) => c.id === r.courseId)).map((p) => ({ plo: p.number, before: attainOver(p, before), after: attainOver(p, sofar) }));
    await xdb.ploChangeLog.upsert({ where: { courseId: r.courseId }, create: { batchId, courseId: r.courseId, courseCode: r.course.code, approvedAt: r.decidedAt || new Date(), deltasJson: JSON.stringify(deltas) }, update: { deltasJson: JSON.stringify(deltas), approvedAt: r.decidedAt || new Date() } });
    n++;
  }
  return n;
}

/** Preview for the instructor before submitting: what the batch's PLOs would do if this course's result were approved now. */
export async function previewPloChange(courseId: string) {
  const course = await prisma.course.findUnique({ where: { id: courseId }, select: { id: true, batchId: true } });
  if (!course?.batchId) return [];
  const w = await batchData(course.batchId);
  const approved = new Set(((await xdb.courseResult.findMany({ where: { course: { batchId: course.batchId }, status: "APPROVED" }, select: { courseId: true } }).catch(() => [])) as { courseId: string }[]).map((r) => r.courseId));
  approved.delete(course.id);
  const withIt = new Set([...Array.from(approved), course.id]);
  return w.plos.filter((p) => p.courses.some((c) => c.id === course.id)).map((p) => ({ plo: p.number, before: attainOver(p, approved), after: attainOver(p, withIt) }));
}

export async function ploChanges(batchId: string) {
  const rows = (await xdb.ploChangeLog.findMany({ where: { batchId }, orderBy: { approvedAt: "asc" } }).catch(() => null)) as { courseId: string; courseCode: string; approvedAt: Date; deltasJson: string }[] | null;
  if (!rows) return null;
  return rows.map((r) => ({ ...r, deltas: JSON.parse(r.deltasJson) as Delta[] }));
}
