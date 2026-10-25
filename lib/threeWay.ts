import { prisma } from "./db";
import { computeHecComparison } from "./hecCompare";
import { LIST_TYPES } from "./autoCopyPreviousBatch";

// The three-way comparison of a new batch: the batch itself · the council curriculum it is measured against (the same
// reference the HEC Comparison page picks) · the previous batch of the same program. One row per course, matched by
// content-sync group, council link, code or title. Shown to the Program Lead at the end of set-up and to the OMC first.

const norm = (s: string) => s.trim().toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
export type Cell = { code: string; title: string; ch: number; sem: number | null } | null;
export type ThreeRow = { key: string; batch: Cell; council: Cell; prev: Cell; status: string };

export async function threeWay(batchId: string) {
  const b = await prisma.batch.findUnique({ where: { id: batchId }, select: { id: true, coordinatorId: true, degreeProgram: true, batchName: true, startYear: true, startTerm: true, createdAt: true } });
  if (!b) return null;
  const prevBatch = (await prisma.batch.findMany({ where: { coordinatorId: b.coordinatorId, degreeProgram: b.degreeProgram, id: { not: b.id } }, orderBy: [{ startYear: "desc" }, { createdAt: "desc" }], select: { id: true, batchName: true, startYear: true, startTerm: true } }))
    .find((x) => x.startYear < b.startYear || (x.startYear === b.startYear && x.startTerm === "Fall" && b.startTerm === "Spring") || (x.startYear === b.startYear && x.startTerm === b.startTerm)) || null;
  const sel = { id: true, code: true, title: true, creditHours: true, semesterNumber: true, masterCourseId: true, isNonCredit: true } as const;
  const [mine, prev] = await Promise.all([
    prisma.course.findMany({ where: { batchId: b.id, courseType: { notIn: LIST_TYPES } }, select: sel }),
    prevBatch ? prisma.course.findMany({ where: { batchId: prevBatch.id, courseType: { notIn: LIST_TYPES } }, select: sel }) : Promise.resolve([]),
  ]);
  const hec = await computeHecComparison(b.coordinatorId, b.id, "").catch(() => null);
  const ref = hec && !hec.empty ? hec.ref : null;
  const master = ref ? await prisma.masterCourse.findMany({ where: { masterCurriculumId: ref.id, domain: null }, select: { id: true, code: true, title: true, creditHours: true, semesterNumber: true } }) : [];
  // Content-sync links: a course of this batch and one of the previous batch in the same group are the same course.
  const members = await prisma.courseContentSyncMember.findMany({ where: { courseId: { in: [...mine, ...prev].map((c) => c.id).concat("none") } }, select: { courseId: true, groupId: true } });
  const groupOf = new Map(members.map((m) => [m.courseId, m.groupId]));

  const cell = (c: { code: string; title: string; creditHours: number; semesterNumber: number | null }): Cell => ({ code: c.code, title: c.title, ch: c.creditHours, sem: c.semesterNumber });
  const rows: ThreeRow[] = [];
  const usedPrev = new Set<string>(), usedMaster = new Set<string>();
  const findPrev = (c: (typeof mine)[number]) => prev.find((p) => !usedPrev.has(p.id) && ((groupOf.get(c.id) && groupOf.get(c.id) === groupOf.get(p.id)) || norm(p.code) === norm(c.code) || norm(p.title) === norm(c.title)));
  const findMaster = (c: { masterCourseId: string | null; code: string; title: string }) => master.find((m) => !usedMaster.has(m.id) && (m.id === c.masterCourseId || norm(m.code) === norm(c.code) || norm(m.title) === norm(c.title)));
  for (const c of mine) {
    const p = findPrev(c); if (p) usedPrev.add(p.id);
    const m = findMaster(c) || (p ? findMaster(p) : undefined); if (m) usedMaster.add(m.id);
    rows.push({ key: c.id, batch: cell(c), council: m ? cell(m) : null, prev: p ? cell(p) : null, status: "" });
  }
  for (const p of prev.filter((x) => !usedPrev.has(x.id))) {
    const m = findMaster(p); if (m) usedMaster.add(m.id);
    rows.push({ key: p.id, batch: null, council: m ? cell(m) : null, prev: cell(p), status: "" });
  }
  for (const m of master.filter((x) => !usedMaster.has(x.id))) rows.push({ key: m.id, batch: null, council: cell(m), prev: null, status: "" });
  for (const r of rows) {
    const diff = (a: Cell, z: Cell) => !!a && !!z && (a.ch !== z.ch || (a.sem != null && z.sem != null && a.sem !== z.sem) || norm(a.title) !== norm(z.title));
    r.status = !r.batch ? (r.prev ? "Dropped from the previous batch" : "Council course not in this batch")
      : !r.prev && !r.council ? "New — in neither"
      : !r.prev ? "New since the previous batch"
      : diff(r.batch, r.prev) ? "Changed since the previous batch"
      : !r.council ? "Not in the council curriculum" : "Same";
  }
  const order = (r: ThreeRow) => (r.batch?.sem ?? r.prev?.sem ?? r.council?.sem ?? 99);
  rows.sort((a, z) => order(a) - order(z) || (a.batch?.code || a.prev?.code || a.council?.code || "").localeCompare(z.batch?.code || z.prev?.code || z.council?.code || ""));
  const ch = (xs: Cell[]) => xs.reduce((n, x) => n + (x?.ch || 0), 0);
  const totals = { batch: ch(rows.map((r) => r.batch)), council: ch(rows.map((r) => r.council)), prev: ch(rows.map((r) => r.prev)) };
  const counts = rows.reduce<Record<string, number>>((m, r) => ((m[r.status] = (m[r.status] || 0) + 1), m), {});
  return { batch: b, prevBatch, ref: ref ? { id: ref.id, title: ref.title, authority: ref.authority, version: ref.version } : null, rows, totals, counts };
}
