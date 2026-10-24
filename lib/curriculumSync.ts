import { prisma } from "./db";
import { writeAuditLog } from "./audit";
import { kindInfo } from "./curriculumTemplates";
import { courseLock } from "./curriculumLibrary";

// A batch's courses against the master curriculum they were imported from. For each field the master value (M), the
// batch value (C) and the value when they were last in step (B) say what happened: C = M in step; C = B ≠ M the master
// changed (offer it); C ≠ B = M the Program Lead changed it (offer to return); all three differ: both changed.
// Nothing changes without the Program Lead's click.

const sdb = prisma as unknown as Record<string, any>;
export const FIELDS = [["code", "Code"], ["title", "Title"], ["creditHours", "Credit hours"], ["semesterNumber", "Semester"], ["courseType", "Type"]] as const;
type F = (typeof FIELDS)[number][0];
type Vals = Record<F, string | number | null>;
export type SyncRow = { courseId: string; code: string; title: string; master: Vals; mine: Vals; state: "SAME" | "MASTER" | "LOCAL" | "BOTH"; fields: { f: F; label: string; m: string | number | null; c: string | number | null; s: "SAME" | "MASTER" | "LOCAL" | "BOTH" }[]; locked: string | null };

async function typeMap(curriculumIds: string[]) {
  const defs = (await sdb.curriculumType.findMany({ where: { curriculumId: { in: curriculumIds.concat("none") } } }).catch(() => [])) as { curriculumId: string; name: string; kind: string; minCredits: number | null; maxCredits: number | null; minCourses: number | null; position: number }[];
  return defs;
}

export async function syncRows(batchId: string) {
  const cs = await prisma.course.findMany({ where: { batchId, masterCourseId: { not: null } }, select: { id: true, code: true, title: true, creditHours: true, semesterNumber: true, courseType: true, masterCourse: { select: { masterCurriculumId: true, code: true, title: true, creditHours: true, semesterNumber: true, category: true } } }, orderBy: [{ semesterNumber: "asc" }, { code: "asc" }] });
  const defs = await typeMap(Array.from(new Set(cs.map((c) => c.masterCourse!.masterCurriculumId))));
  const bType = (cid: string, cat: string) => { const d = defs.find((x) => x.curriculumId === cid && x.name === cat); return d ? kindInfo(d.kind).batchType : cat; };
  const base = new Map(((await sdb.courseMasterSync.findMany({ where: { courseId: { in: cs.map((c) => c.id).concat("none") } } }).catch(() => [])) as { courseId: string; baseJson: string }[]).map((r) => [r.courseId, JSON.parse(r.baseJson) as Vals]));
  const rows: SyncRow[] = [];
  for (const c of cs) {
    const mc = c.masterCourse!;
    const master: Vals = { code: mc.code, title: mc.title, creditHours: mc.creditHours, semesterNumber: mc.semesterNumber, courseType: bType(mc.masterCurriculumId, mc.category) };
    const mine: Vals = { code: c.code, title: c.title, creditHours: c.creditHours, semesterNumber: c.semesterNumber, courseType: c.courseType };
    const b = base.get(c.id) || master; // no record yet: assume it was imported as the master was
    const fields = FIELDS.map(([f, label]) => {
      const m = master[f], cc = mine[f], bb = b[f];
      const sameElective = f === "title" && /elective/i.test(String(m)) && /elective/i.test(String(cc)); // slots are renamed "<Degree> Elective N" on import
      const s = sameElective || String(m ?? "") === String(cc ?? "") ? "SAME" : String(cc ?? "") === String(bb ?? "") ? "MASTER" : String(m ?? "") === String(bb ?? "") ? "LOCAL" : "BOTH";
      return { f, label, m, c: cc, s } as SyncRow["fields"][number];
    });
    const st = fields.some((x) => x.s === "BOTH") ? "BOTH" : fields.some((x) => x.s === "MASTER") ? "MASTER" : fields.some((x) => x.s === "LOCAL") ? "LOCAL" : "SAME";
    rows.push({ courseId: c.id, code: c.code, title: c.title, master, mine, state: st, fields, locked: st === "SAME" ? null : await courseLock(c.id, "scheme") });
  }
  return rows;
}

/** take = "master": the course takes the master's values (only fields the master changed, or all with all = true);
 *  take = "mine": keep the course as it is and stop offering this master change. */
export async function resolve(by: string, batchId: string, courseIds: string[], take: "master" | "mine", all = false) {
  const rows = (await syncRows(batchId)).filter((r) => courseIds.includes(r.courseId));
  let n = 0;
  for (const r of rows) {
    if (take === "master") {
      const data: Record<string, unknown> = {};
      for (const x of r.fields) if (x.s !== "SAME" && (all || x.s === "MASTER")) data[x.f] = x.m;
      if (Object.keys(data).length) {
        if (data.code && (await prisma.course.findFirst({ where: { batchId, code: String(data.code), id: { not: r.courseId } } }))) delete data.code;
        await prisma.course.update({ where: { id: r.courseId }, data });
        n++;
      }
    }
    await sdb.courseMasterSync.upsert({ where: { courseId: r.courseId }, create: { courseId: r.courseId, baseJson: JSON.stringify(r.master) }, update: { baseJson: JSON.stringify(r.master), updatedAt: new Date() } });
  }
  await writeAuditLog({ actorUserId: by, action: take === "master" ? "BATCH_SYNCED_TO_MASTER" : "BATCH_KEPT_LOCAL", entityType: "Batch", entityId: batchId, metadata: { courses: rows.length, changed: n } });
  return n;
}

/** The batch scheme against the master curriculum's course types: credit hours and courses per type. */
export async function requirementCheck(batchId: string) {
  const cs = await prisma.course.findMany({ where: { batchId }, select: { id: true, code: true, title: true, creditHours: true, courseType: true, isNonCredit: true, masterCourse: { select: { masterCurriculumId: true, category: true } } } });
  const cid = cs.find((c) => c.masterCourse)?.masterCourse?.masterCurriculumId;
  if (!cid) return null;
  const defs = (await typeMap([cid])).sort((a, b) => a.position - b.position);
  if (!defs.length) return null;
  const cur = await prisma.masterCurriculum.findUnique({ where: { id: cid }, select: { authority: true, title: true, version: true } });
  const per = defs.map((d) => {
    const xs = cs.filter((c) => c.masterCourse?.category === d.name);
    const ch = xs.reduce((s, c) => s + c.creditHours, 0);
    const counts = kindInfo(d.kind).counts;
    const ok = (!counts || ((d.minCredits == null || ch >= d.minCredits) && (d.maxCredits == null || ch <= d.maxCredits))) && (d.minCourses == null || xs.length >= d.minCourses);
    return { name: d.name, kind: d.kind, counts, ch, n: xs.length, minCredits: d.minCredits, maxCredits: d.maxCredits, minCourses: d.minCourses, ok };
  });
  const local = cs.filter((c) => !c.masterCourse);
  const total = per.filter((p) => p.counts).reduce((s, p) => s + p.ch, 0) + local.filter((c) => !c.isNonCredit && !/^domain /i.test(c.courseType)).reduce((s, c) => s + c.creditHours, 0);
  return { curriculum: cur ? `${cur.authority} ${cur.title} ${cur.version}` : "", per, local: local.map((c) => `${c.code} ${c.title}`), total };
}
