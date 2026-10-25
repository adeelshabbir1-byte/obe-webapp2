import { prisma } from "./db";
import { batchBoard, curriculumBoard, batchTypeMapper, type BoardCourse } from "./batchBoard";
import { batchSource } from "./universityCurriculum";
import { sameName } from "./batchSetup";

// The three-way comparison of a new batch: the new batch · the council curriculum · the previous batch of the program.
// Totals (credit hours, number of courses, credit hours per type) against the council's minimum or range, and course by
// course in three columns, each row tagged: same · renamed/recoded · moved semester · CH changed · added · dropped ·
// chosen elective. Shown to the Program Lead at the end of the set-up and to the OMC at the start of its review.

export type Side = { code: string; title: string; ch: number; type: string; semester: number | null } | null;
export type Tag = "same" | "renamed" | "recoded" | "moved" | "ch" | "added" | "dropped" | "elective" | "not in curriculum";
export type CompareRow = { courseId: string | null; now: Side; council: Side; previous: Side; tags: Tag[] };
export type TypeTotal = { type: string; now: number; council: number; previous: number; min: number | null; max: number | null; ok: boolean | null };
export type Comparison = {
  batch: string; councilTitle: string | null; previousTitle: string | null;
  totals: { ch: [number, number, number]; count: [number, number, number]; chOk: boolean | null; target: [number, number] | null };
  byType: TypeTotal[]; rows: CompareRow[]; counts: Record<Tag, number>;
};

const side = (c: BoardCourse | undefined | null): Side => (c ? { code: c.code, title: c.title, ch: c.ch, type: c.type, semester: c.semester } : null);
const sum = (cs: BoardCourse[]) => cs.reduce((a, c) => a + (c.ch || 0), 0);

/** The previous batch of the same program: the one this batch was copied from, else the newest earlier one. */
export async function previousBatchOf(batchId: string) {
  const b = await prisma.batch.findUnique({ where: { id: batchId }, select: { id: true, degreeProgram: true, createdAt: true, coordinator: { select: { managedById: true } } } });
  if (!b) return null;
  const src = await batchSource(batchId);
  if (src?.fromBatchId) return prisma.batch.findUnique({ where: { id: src.fromBatchId }, select: { id: true, degreeProgram: true, batchName: true } });
  return prisma.batch.findFirst({ where: { id: { not: b.id }, degreeProgram: b.degreeProgram, createdAt: { lt: b.createdAt }, coordinator: { managedById: b.coordinator.managedById } }, orderBy: { createdAt: "desc" }, select: { id: true, degreeProgram: true, batchName: true } });
}

export async function compareBatch(batchId: string): Promise<Comparison | null> {
  const b = await prisma.batch.findUnique({ where: { id: batchId }, select: { degreeProgram: true, batchName: true } });
  const now = await batchBoard(batchId);
  if (!b || !now) return null;
  const council = now.curriculumId ? await curriculumBoard(now.curriculumId) : null;
  const prevB = await previousBatchOf(batchId);
  const prev = prevB ? await batchBoard(prevB.id) : null;
  // Course of this batch ↔ course of the previous batch: the content-sync link first, then the same curriculum course, code or name.
  const ids = now.courses.map((c) => c.id);
  const mem = await prisma.courseContentSyncMember.findMany({ where: { courseId: { in: ids.concat("none") } }, select: { courseId: true, groupId: true } });
  const prevIds = new Set((prev?.courses || []).map((c) => c.id));
  const prevMem = prev ? await prisma.courseContentSyncMember.findMany({ where: { courseId: { in: Array.from(prevIds).concat("none") } }, select: { courseId: true, groupId: true } }) : [];
  const usedPrev = new Set<string>(), usedCouncil = new Set<string>();
  const findPrev = (c: BoardCourse) => {
    const g = mem.find((m) => m.courseId === c.id)?.groupId;
    const viaSync = g ? prevMem.find((m) => m.groupId === g && !usedPrev.has(m.courseId))?.courseId : null;
    const pool = (prev?.courses || []).filter((p) => !usedPrev.has(p.id));
    return pool.find((p) => p.id === viaSync) || pool.find((p) => !!c.masterCourseId && p.masterCourseId === c.masterCourseId) || pool.find((p) => p.code.toUpperCase() === c.code.toUpperCase()) || pool.find((p) => sameName(p.title, c.title)) || null;
  };
  const findCouncil = (c: { masterCourseId: string | null; code: string; title: string }) => {
    const pool = (council?.courses || []).filter((p) => !usedCouncil.has(p.id));
    return pool.find((p) => !!c.masterCourseId && p.id === c.masterCourseId) || pool.find((p) => p.code.toUpperCase() === c.code.toUpperCase()) || pool.find((p) => sameName(p.title, c.title)) || null;
  };
  const rows: CompareRow[] = [];
  for (const c of now.courses) {
    const p = findPrev(c); if (p) usedPrev.add(p.id);
    const k = findCouncil(c); if (k) usedCouncil.add(k.id);
    const tags: Tag[] = [];
    const ref = p || k;
    if (/elective|ids/i.test(c.type)) tags.push("elective");
    if (!p && prev) tags.push("added");
    if (!k && council && !tags.includes("elective")) tags.push("not in curriculum");
    if (ref) {
      if (!sameName(ref.title, c.title)) tags.push("renamed");
      if (ref.code.toUpperCase() !== c.code.toUpperCase()) tags.push("recoded");
      if (ref.semester && c.semester && ref.semester !== c.semester) tags.push("moved");
      if (ref.ch !== c.ch) tags.push("ch");
    }
    if (!tags.length || (tags.length === 1 && tags[0] === "elective")) tags.unshift("same");
    rows.push({ courseId: c.id, now: side(c), council: side(k), previous: side(p), tags });
  }
  for (const p of (prev?.courses || []).filter((x) => !usedPrev.has(x.id))) {
    const k = findCouncil(p); if (k) usedCouncil.add(k.id);
    rows.push({ courseId: null, now: null, council: side(k), previous: side(p), tags: ["dropped"] });
  }
  for (const k of (council?.courses || []).filter((x) => !usedCouncil.has(x.id))) rows.push({ courseId: null, now: null, council: side(k), previous: null, tags: ["dropped"] });
  rows.sort((a, b) => ((a.now || a.previous || a.council)?.semester || 99) - ((b.now || b.previous || b.council)?.semester || 99));

  // Per type, in the batch's own type names: the council's categories mapped the way the import maps them, with their
  // minimums / ranges added up per batch type.
  const asBatchType = now.curriculumId ? await batchTypeMapper(now.curriculumId) : (x: string) => x;
  const counted = now.types.filter((t) => t.counts !== false);
  const names = Array.from(new Set([...counted.map((t) => asBatchType(t.name)), ...now.courses.map((c) => c.type)]));
  const byType: TypeTotal[] = names.map((name) => {
    const defs = counted.filter((t) => asBatchType(t.name) === name || t.name === name);
    const mins = defs.map((t) => t.minCredits).filter((x): x is number => x !== null && x !== undefined);
    const maxs = defs.map((t) => t.maxCredits).filter((x): x is number => x !== null && x !== undefined);
    const min = mins.length ? mins.reduce((a, b) => a + b, 0) : null, max = maxs.length ? maxs.reduce((a, b) => a + b, 0) : null;
    const n = sum(now.courses.filter((c) => c.type === name));
    return { type: name, now: n, council: sum((council?.courses || []).filter((c) => asBatchType(c.type) === name)), previous: sum((prev?.courses || []).filter((c) => c.type === name)), min, max, ok: min === null && max === null ? null : (min === null || n >= min) && (max === null || n <= max) };
  }).filter((t) => t.now || t.council || t.previous || t.min !== null);
  const chNow = sum(now.courses), target = council ? council.target : null;
  const counts = { same: 0, renamed: 0, recoded: 0, moved: 0, ch: 0, added: 0, dropped: 0, elective: 0, "not in curriculum": 0 } as Record<Tag, number>;
  for (const r of rows) for (const t of r.tags) counts[t]++;
  return {
    batch: `${b.degreeProgram} ${b.batchName}`, councilTitle: council?.title || null, previousTitle: prevB ? `${prevB.degreeProgram} ${prevB.batchName}` : null,
    totals: { ch: [chNow, sum(council?.courses || []), sum(prev?.courses || [])], count: [now.courses.length, council?.courses.length || 0, prev?.courses.length || 0], chOk: target ? chNow >= target[0] && chNow <= target[1] : null, target },
    byType, rows, counts,
  };
}

export const TAG_LABEL: Record<Tag, string> = { same: "same", renamed: "renamed", recoded: "recoded", moved: "moved semester", ch: "CH changed", added: "added", dropped: "dropped", elective: "chosen elective", "not in curriculum": "not in curriculum" };
export const sideText = (s: Side) => (s ? `${s.code} ${s.title} · ${s.ch} CH${s.semester ? ` · S${s.semester}` : ""}` : "—");
