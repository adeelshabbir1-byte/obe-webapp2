import { prisma } from "./db";
import { LIST_TYPES } from "./autoCopyPreviousBatch";
import { batchSource } from "./universityCurriculum";

// One rule for "is this an Elective / IDS LIST option?" — a pool the slots are filled from, never counted as a course or
// credit hours. Works for curricula made in the Curriculum Builder (type kinds) and for older ones without type
// definitions (legacy categories "Domain Elective" / "Domain IDS", names with "list" / "pool" / "options", track pools,
// and elective-like courses with no semester when the scheme has its elective slots placed in semesters).

const db = prisma as unknown as Record<string, any>;
export const LIST_KINDS = ["ELECTIVE_LIST", "IDS_LIST"];
export type Flavour = "Elective" | "IDS";
type Def = { curriculumId: string; name: string; kind: string; minCourses: number | null };
const IDS_RE = /\bids\b|interdisciplin/i;
const ELECTIVE_RE = /elective/i;
const POOL_RE = /\b(list|pool|options?|basket)\b/i;
/** A slot placeholder title: "Elective I", "CS Elective-3", "IDS 2", "Domain Elective IV". */
export const isPlaceholderTitle = (t: string) => /\b(elective|ids)\s*[-–]?\s*(\d+|[ivx]+)\s*$/i.test(t.trim()) || /^(elective|ids)$/i.test(t.trim());
export const flavourOfName = (s: string | null | undefined): Flavour => (IDS_RE.test(s || "") ? "IDS" : "Elective");
const flavourOfKind = (k: string): Flavour => (k === "IDS_LIST" || k === "IDS" ? "IDS" : "Elective");

/** Does a curriculum category name an elective / IDS list (when the curriculum has no definition for it)? */
export function legacyListCategory(cat: string | null | undefined) {
  const k = (cat || "").trim().toLowerCase();
  return k === "domain elective" || k === "domain ids" || ((ELECTIVE_RE.test(k) || IDS_RE.test(k)) && POOL_RE.test(k));
}

export type Pool = { ids: Set<string>; flavour: Map<string, Flavour>; slots: Record<Flavour, number>; placeholders: Record<Flavour, { semester: number | null; ch: number }[]> };

/** The list options (pool) of each curriculum, with how many slots of each flavour the scheme has. */
export async function curriculumPools(curriculumIds: string[]): Promise<Map<string, Pool>> {
  const ids = Array.from(new Set(curriculumIds.filter(Boolean)));
  const out = new Map<string, Pool>();
  if (!ids.length) return out;
  const [courses, defs, tracks] = await Promise.all([
    prisma.masterCourse.findMany({ where: { masterCurriculumId: { in: ids } }, select: { id: true, masterCurriculumId: true, category: true, title: true, semesterNumber: true, creditHours: true } }),
    db.curriculumType.findMany({ where: { curriculumId: { in: ids } } }).catch(() => []) as Promise<Def[]>,
    db.curriculumTrack.findMany({ where: { curriculumId: { in: ids } }, select: { id: true } }).catch(() => []) as Promise<{ id: string }[]>,
  ]);
  const inTrack = new Set(((await db.masterCourseTrack.findMany({ where: { trackId: { in: tracks.map((t) => t.id).concat("none") } }, select: { masterCourseId: true } }).catch(() => [])) as { masterCourseId: string }[]).map((x) => x.masterCourseId));
  for (const cid of ids) {
    const cs = courses.filter((c) => c.masterCurriculumId === cid), ds = defs.filter((d) => d.curriculumId === cid);
    const def = (cat: string) => ds.find((d) => d.name === cat);
    const electiveLike = (c: (typeof cs)[number]) => { const d = def(c.category); return d ? ["ELECTIVE_SLOT", "ELECTIVE_LIST", "IDS", "IDS_LIST"].includes(d.kind) : ELECTIVE_RE.test(c.category) || IDS_RE.test(c.category); };
    const loose = cs.filter((c) => !def(c.category) && electiveLike(c) && !isPlaceholderTitle(c.title));
    const placed = loose.some((c) => c.semesterNumber != null) || cs.some((c) => electiveLike(c) && isPlaceholderTitle(c.title));
    const unplaced = loose.filter((c) => c.semesterNumber == null).length;
    const p: Pool = { ids: new Set(), flavour: new Map(), slots: { Elective: 0, IDS: 0 }, placeholders: { Elective: [], IDS: [] } };
    for (const c of cs) {
      const d = def(c.category);
      let list = d ? LIST_KINDS.includes(d.kind) : legacyListCategory(c.category);
      if (!list && inTrack.has(c.id) && electiveLike(c) && !isPlaceholderTitle(c.title)) list = true;
      if (!list && !d && electiveLike(c) && !isPlaceholderTitle(c.title) && c.semesterNumber == null && (placed || unplaced > 10)) list = true;
      const fl = d ? flavourOfKind(d.kind) : flavourOfName(c.category);
      if (list) { p.ids.add(c.id); p.flavour.set(c.id, fl); }
      else if (electiveLike(c) && (d ? ["ELECTIVE_SLOT", "IDS"].includes(d.kind) : true)) p.placeholders[fl].push({ semester: c.semesterNumber, ch: c.creditHours });
    }
    // Slot counts: the slot types' required number of courses, else the slots placed in the scheme.
    for (const fl of ["Elective", "IDS"] as Flavour[]) {
      const fromDefs = ds.filter((d) => (fl === "IDS" ? d.kind === "IDS" : d.kind === "ELECTIVE_SLOT")).reduce((t, d) => t + (d.minCourses || 0), 0);
      p.slots[fl] = Math.max(fromDefs, p.placeholders[fl].length);
    }
    out.set(cid, p);
  }
  return out;
}

/** The curriculum a batch follows (its recorded source, else the curriculum most of its courses came from). */
export async function batchCurriculumId(batchId: string) {
  const src = await batchSource(batchId);
  if (src?.curriculumId) return src.curriculumId;
  const g = await prisma.course.findMany({ where: { batchId, masterCourseId: { not: null } }, select: { masterCourse: { select: { masterCurriculumId: true } } } });
  const n = new Map<string, number>(); for (const c of g) if (c.masterCourse) n.set(c.masterCourse.masterCurriculumId, (n.get(c.masterCourse.masterCurriculumId) || 0) + 1);
  return Array.from(n.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] || null;
}

/** Courses of a batch that fill a slot by a recorded choice (this page's picker, or the OMC's fill-elective). */
export async function filledSlotIds(courseIds: string[]) {
  const ids = courseIds.concat("none");
  const [mine, omc] = await Promise.all([
    db.batchSlotChoice.findMany({ where: { courseId: { in: ids } }, select: { courseId: true } }).catch(() => []) as Promise<{ courseId: string }[]>,
    prisma.auditLog.findMany({ where: { action: "ELECTIVE_SLOT_FILLED", entityType: "Course", entityId: { in: ids } }, select: { entityId: true } }).catch(() => [] as { entityId: string | null }[]),
  ]);
  return new Set<string>([...mine.map((x) => x.courseId), ...omc.map((x) => x.entityId || "")].filter(Boolean));
}

/**
 * Which of a batch's courses are list options (pool), by the shared rule: typed "Domain Elective" / "Domain IDS", or taken
 * from a pool option of its curriculum without filling a slot (no recorded choice, no students). Options placed in a
 * semester are kept as filled slots up to the curriculum's slot count; the rest are list options.
 */
export async function batchListCourses(batchId: string) {
  const cs = await prisma.course.findMany({ where: { batchId }, select: { id: true, courseType: true, title: true, masterCourseId: true, semesterNumber: true, _count: { select: { studentEnrollments: true } } }, orderBy: [{ semesterNumber: "asc" }, { code: "asc" }] });
  const curId = await batchCurriculumId(batchId);
  const masterCurs = (await prisma.masterCourse.findMany({ where: { id: { in: cs.map((c) => c.masterCourseId).filter((x): x is string => !!x).concat("none") } }, select: { id: true, masterCurriculumId: true } }));
  const pools = await curriculumPools([curId || "", ...masterCurs.map((m) => m.masterCurriculumId)]);
  const curOf = new Map(masterCurs.map((m) => [m.id, m.masterCurriculumId]));
  const filled = await filledSlotIds(cs.map((c) => c.id));
  const options = new Set(((await prisma.electiveSlotOption.findMany({ where: { courseId: { in: cs.map((c) => c.id).concat("none") } }, select: { courseId: true } }).catch(() => [])) as { courseId: string }[]).map((x) => x.courseId));
  const list = new Map<string, Flavour>();
  const keep: Record<Flavour, number> = { Elective: 0, IDS: 0 };
  const main = pools.get(curId || "");
  // Slots already taken: placeholders, recorded choices, courses with students.
  for (const c of cs) {
    if (LIST_TYPES.includes(c.courseType || "")) continue;
    const pool = c.masterCourseId ? pools.get(curOf.get(c.masterCourseId) || "") : null;
    const isOpt = !!(c.masterCourseId && pool?.ids.has(c.masterCourseId));
    const fl = isOpt ? pool!.flavour.get(c.masterCourseId!)! : flavourOfName(c.courseType);
    if ((!isOpt && (ELECTIVE_RE.test(c.courseType || "") || IDS_RE.test(c.courseType || ""))) || (isOpt && (filled.has(c.id) || c._count.studentEnrollments))) keep[fl]++;
  }
  for (const c of cs) {
    if (options.has(c.id)) continue; // a registration option of an elective group — handled by elective registration
    if (LIST_TYPES.includes(c.courseType || "")) { list.set(c.id, c.courseType === "Domain IDS" ? "IDS" : "Elective"); continue; }
    if (!c.masterCourseId) continue;
    const pool = pools.get(curOf.get(c.masterCourseId) || "");
    if (!pool?.ids.has(c.masterCourseId) || filled.has(c.id) || c._count.studentEnrollments) continue;
    const fl = pool.flavour.get(c.masterCourseId)!;
    const cap = (main || pool).slots[fl];
    if (c.semesterNumber != null && !isPlaceholderTitle(c.title) && cap > 0 && keep[fl] < cap) { keep[fl]++; continue; }
    list.set(c.id, fl);
  }
  return { list, curriculumId: curId, pool: main || null };
}

/** Give a batch's list options their list type ("Domain Elective" / "Domain IDS") so every count, report and copy skips
 *  them. Idempotent; returns how many were retyped. */
export async function retypeListCourses(batchId: string) {
  const { list } = await batchListCourses(batchId);
  const cs = await prisma.course.findMany({ where: { id: { in: Array.from(list.keys()).concat("none") } }, select: { id: true, courseType: true } });
  let n = 0;
  for (const c of cs) {
    const t = list.get(c.id) === "IDS" ? "Domain IDS" : "Domain Elective";
    if (c.courseType !== t && !LIST_TYPES.includes(c.courseType || "")) { await prisma.course.update({ where: { id: c.id }, data: { courseType: t } }); n++; }
  }
  return n;
}
