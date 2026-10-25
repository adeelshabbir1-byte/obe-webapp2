import { prisma } from "./db";
import { kindInfo } from "./curriculumTemplates";
import { curriculaWhere } from "./curriculumLibrary";
import { sourceOf, cleanVersion, currentRevision, batchSource, udb } from "./universityCurriculum";
import { LIST_TYPES } from "./autoCopyPreviousBatch";
import { curriculumPools, retypeListCourses, isPlaceholderTitle, type Flavour } from "./listCourses";

// The batch courses board (like the Curriculum Builder) and the picker of where a batch's courses come from.

const bdb = prisma as unknown as Record<string, any>;
export type BoardType = { name: string; kind: string; minCredits: number | null; maxCredits: number | null; minCourses: number | null; counts: boolean; color: string };
export type BoardCourse = { id: string; code: string; title: string; ch: number; type: string; semester: number | null; se: string | null; instructor: string | null; clos: number; lectures: number; mapped: number; from: string | null; masterCourseId: string | null; gradesOnly?: string | null; deficiency?: string | null; home?: string | null; semNote?: string | null; planFlag?: string | null };
export type Board = { curriculumId: string | null; title: string; types: BoardType[]; courses: BoardCourse[]; missing: { masterCourseId: string; code: string; title: string; ch: number; type: string; semester: number | null }[]; listPool: number; slots: Record<Flavour, number>; obeNote?: string | null; target: [number, number] };

/** Discipline family of a program title — a Program Lead sees only their family's curricula. */
export function familyOf(title: string) {
  const t = title.toLowerCase();
  if (/comput|software|artificial|data science|cyber|information tech|\bit\b|\bcs\b|\bse\b|\bai\b/.test(t)) return "Computing";
  if (/business|bba|mba|account|financ|commerce|econom|management|marketing/.test(t)) return "Management Sciences";
  if (/engineer/.test(t)) return "Engineering";
  if (/nurs|pharm|physio|medic|health|dental/.test(t)) return "Health Sciences";
  if (/math|physics|chemi|biolog|botany|zoology|statist|biotech/.test(t)) return "Natural Sciences";
  return t.replace(/^(bs|ms|mphil|phd|ba|ma)\s+/i, "").trim();
}

const typeFor = (types: { name: string; kind: string }[], cat: string) => { const d = types.find((t) => t.name === cat); return d ? kindInfo(d.kind).batchType : cat; };
/** A curriculum's course category → the type name its courses get in a batch (e.g. "Major" → "Core"). */
export async function batchTypeMapper(curriculumId: string) {
  const defs = ((await bdb.curriculumType.findMany({ where: { curriculumId } }).catch(() => [])) as { name: string; kind: string }[]);
  const { typeKey } = await import("./courseTypes");
  // The same mapping the curriculum import uses: the category's kind, else the standard type of its name.
  return (cat: string) => { const d = defs.find((t) => t.name === cat); return d ? kindInfo(d.kind).batchType : typeKey(cat); };
}

/** Board of a curriculum (preview) — courses by type, the list pool counted apart. */
export async function curriculumBoard(curriculumId: string): Promise<Board | null> {
  await prisma.masterCourse.updateMany({ where: { masterCurriculumId: curriculumId, category: "General Education / Other" }, data: { category: "General Education" } }).catch(() => null);
  const c = await prisma.masterCurriculum.findUnique({ where: { id: curriculumId }, select: { title: true, version: true, authority: true, courses: { select: { id: true, code: true, title: true, creditHours: true, category: true, semesterNumber: true, _count: { select: { seedClos: true, seedTopics: true } } } } } });
  if (!c) return null;
  const defs = ((await bdb.curriculumType.findMany({ where: { curriculumId }, orderBy: { position: "asc" } }).catch(() => [])) as { name: string; kind: string; minCredits: number | null; maxCredits: number | null; minCourses: number | null }[]);
  const listNames = new Set(defs.filter((d) => d.kind === "ELECTIVE_LIST" || d.kind === "IDS_LIST").map((d) => d.name));
  const pool = (await curriculumPools([curriculumId])).get(curriculumId);
  const types: BoardType[] = defs.filter((d) => !listNames.has(d.name)).map((d) => ({ name: d.name, kind: d.kind, minCredits: d.minCredits, maxCredits: d.maxCredits, minCourses: d.minCourses, counts: kindInfo(d.kind).counts, color: kindInfo(d.kind).color }));
  const own = c.courses.filter((x) => !listNames.has(x.category) && !pool?.ids.has(x.id));
  for (const x of own) if (!types.some((t) => t.name === x.category)) types.push({ name: x.category, kind: "CORE", minCredits: null, maxCredits: null, minCourses: null, counts: true, color: "#6B7177" });
  return {
    curriculumId, title: `${c.authority} ${c.title} ${cleanVersion(c.version)}`, types,
    courses: own.map((x) => ({ id: x.id, code: x.code, title: x.title, ch: x.creditHours, type: x.category, semester: x.semesterNumber, se: null, instructor: null, clos: x._count.seedClos, lectures: x._count.seedTopics, mapped: 0, from: null, masterCourseId: x.id })),
    missing: [], listPool: c.courses.length - own.length, slots: pool?.slots || { Elective: 0, IDS: 0 }, target: [120, 144],
  };
}

/** Board of a batch, with the courses its curriculum requires but it doesn't have yet. */
export async function batchBoard(batchId: string): Promise<Board | null> {
  // Older imports carried the elective / IDS list options as ordinary courses: give them their list type first.
  await retypeListCourses(batchId).catch(() => 0);
  const b = await prisma.batch.findUnique({ where: { id: batchId }, select: { degreeProgram: true, batchName: true, courses: { select: { id: true, code: true, title: true, creditHours: true, courseType: true, semesterNumber: true, masterCourseId: true, isNonCredit: true, trackName: true, subjectHomeDepartment: { select: { name: true } }, subjectExpert: { select: { name: true } }, instructor: { select: { name: true } }, clos: { where: { source: "SE" }, select: { mappedPloId: true } }, _count: { select: { lectureRows: true } } } } } });
  if (!b) return null;
  const src = await batchSource(batchId);
  const curId = src?.curriculumId || (await prisma.masterCourse.findFirst({ where: { id: { in: b.courses.map((c) => c.masterCourseId).filter((x): x is string => !!x).concat("none") } }, select: { masterCurriculumId: true } }))?.masterCurriculumId || null;
  const cur = curId ? await curriculumBoard(curId) : null;
  const defs = curId ? ((await bdb.curriculumType.findMany({ where: { curriculumId: curId } }).catch(() => [])) as { name: string; kind: string }[]) : [];
  const courses = b.courses.filter((c) => !LIST_TYPES.includes(c.courseType || ""));
  const types: BoardType[] = [];
  for (const t of cur?.types || []) { const name = typeFor(defs, t.name); const ex = types.find((x) => x.name === name); if (ex) { ex.minCredits = (ex.minCredits || 0) + (t.minCredits || 0) || null; ex.minCourses = (ex.minCourses || 0) + (t.minCourses || 0) || null; } else types.push({ ...t, name }); }
  for (const c of courses) if (!types.some((t) => t.name === c.courseType)) types.push({ name: c.courseType || "Other", kind: "CORE", minCredits: null, maxCredits: null, minCourses: null, counts: true, color: "#6B7177" });
  const have = new Set(courses.map((c) => c.masterCourseId).filter(Boolean));
  const slotTypes = new Set(defs.filter((d) => d.kind === "ELECTIVE_SLOT").map((d) => d.name));
  const gOnly = await (await import("./obeTerm")).gradesOnlyCourses(courses.map((c) => c.id)).catch(() => new Map<string, string>());
  const obeNote = await (await import("./obeTerm")).batchObeNote(batchId).catch(() => null);
  const fromLabel = src ? (src.how === "BATCH_AS_TAUGHT" ? "previous batch (as taught)" : cur ? `${cur.title}${src.revision ? ` rev ${src.revision}` : ""}` : null) : cur?.title || null;
  return {
    curriculumId: curId, title: `${b.degreeProgram} — ${b.batchName}`, types,
    courses: courses.map((c) => ({ id: c.id, code: c.code, title: c.title, ch: c.creditHours, type: c.courseType || "Other", semester: c.semesterNumber, se: c.subjectExpert?.name || null, instructor: c.instructor?.name || null, clos: c.clos.length, lectures: c._count.lectureRows, mapped: c.clos.filter((x) => x.mappedPloId).length, from: fromLabel, masterCourseId: c.masterCourseId, gradesOnly: gOnly.get(c.id) || null, deficiency: c.isNonCredit ? `Deficiency${c.trackName ? ` — ${c.trackName} only` : ""}, pass / fail` : null, home: c.subjectHomeDepartment?.name || null })),
    // Elective slots are compared by count (a filled slot points at the chosen elective), other courses one by one.
    missing: (cur?.courses || []).filter((m) => !have.has(m.id) && !slotTypes.has(m.type) && !isPlaceholderTitle(m.title)).map((m) => ({ masterCourseId: m.id, code: m.code, title: m.title, ch: m.ch, type: typeFor(defs, m.type), semester: m.semester })),
    listPool: cur?.listPool || 0, slots: cur?.slots || { Elective: 0, IDS: 0 }, obeNote: obeNote?.text || null, target: [120, 144],
  };
}

export type SourceRow = { kind: "CURRICULUM" | "BATCH"; id: string; name: string; badge: string; badgeColor: string; basedOn: string | null; byType: [string, number][]; ch: number; courses: number; listPool: number; usedBy: string[]; revision: number; isNew: boolean; curriculumId: string | null };

/** Where a batch's courses can come from: curricula of the Program Lead's discipline and earlier batches of the program. */
export async function sourcesFor(user: { id: string; role: string }, chairmanId: string, batchId: string): Promise<SourceRow[]> {
  const batch = await prisma.batch.findUnique({ where: { id: batchId }, select: { id: true, degreeProgram: true, coordinatorId: true } });
  if (!batch) return [];
  return sourcesForProgram(chairmanId, batch.coordinatorId, batch.degreeProgram, batch.id);
}
/** Sources for a program before its new batch exists (the batch set-up wizard). */
export async function sourcesForProgram(chairmanId: string, coordinatorId: string, degreeProgram: string, excludeBatchId = "none"): Promise<SourceRow[]> {
  const batch = { id: excludeBatchId, degreeProgram, coordinatorId };
  const fam = familyOf(batch.degreeProgram);
  const curs = await prisma.masterCurriculum.findMany({ where: { AND: [await curriculaWhere(chairmanId), { status: "PUBLISHED" }] }, select: { id: true, title: true, version: true, authority: true, chairmanId: true, createdAt: true, parentCurriculum: { select: { authority: true, title: true, version: true } }, courses: { select: { id: true, creditHours: true, category: true } } }, orderBy: [{ createdAt: "desc" }] });
  const mine = curs.filter((c) => familyOf(c.title) === fam);
  const metas = ((await bdb.curriculumMeta.findMany({ where: { curriculumId: { in: mine.map((c) => c.id).concat("none") } } }).catch(() => [])) as { curriculumId: string; sourceKind?: string | null }[]);
  const defs = ((await bdb.curriculumType.findMany({ where: { curriculumId: { in: mine.map((c) => c.id).concat("none") } } }).catch(() => [])) as { curriculumId: string; name: string; kind: string }[]);
  const used = await prisma.course.findMany({ where: { masterCourse: { masterCurriculumId: { in: mine.map((c) => c.id).concat("none") } }, coordinator: { managedById: chairmanId } }, select: { batch: { select: { id: true, batchName: true } }, masterCourse: { select: { masterCurriculumId: true } } }, distinct: ["batchId"] });
  const lastUsed = await batchSource((await prisma.batch.findFirst({ where: { coordinatorId: batch.coordinatorId, degreeProgram: batch.degreeProgram, id: { not: batch.id } }, orderBy: [{ startYear: "desc" }, { createdAt: "desc" }], select: { id: true } }))?.id || "none");
  const lastCreated = lastUsed?.curriculumId ? curs.find((c) => c.id === lastUsed.curriculumId)?.createdAt : null;
  const rows: SourceRow[] = [];
  const pools = await curriculumPools(mine.map((c) => c.id));
  for (const c of mine) {
    const d = defs.filter((x) => x.curriculumId === c.id);
    const list = new Set(d.filter((x) => x.kind === "ELECTIVE_LIST" || x.kind === "IDS_LIST").map((x) => x.name));
    const counted = new Set(d.filter((x) => kindInfo(x.kind).counts).map((x) => x.name));
    const own = c.courses.filter((x) => !list.has(x.category) && !pools.get(c.id)?.ids.has(x.id));
    const by = new Map<string, number>(); for (const x of own) by.set(x.category, (by.get(x.category) || 0) + 1);
    const s = sourceOf(c, metas.find((m) => m.curriculumId === c.id)?.sourceKind);
    rows.push({ kind: "CURRICULUM", id: c.id, name: `${c.title} · ${cleanVersion(c.version)}`, badge: s.label, badgeColor: s.color, basedOn: s.basedOn, byType: Array.from(by.entries()), ch: own.filter((x) => !d.length || counted.has(x.category)).reduce((t, x) => t + x.creditHours, 0), courses: own.length, listPool: c.courses.length - own.length, usedBy: used.filter((u) => u.masterCourse?.masterCurriculumId === c.id).map((u) => u.batch?.batchName || "").filter(Boolean), revision: c.chairmanId ? await currentRevision(c.id) : 0, isNew: !c.chairmanId && !!lastCreated && c.createdAt > lastCreated, curriculumId: c.id });
  }
  const batches = await prisma.batch.findMany({ where: { coordinator: { managedById: chairmanId }, degreeProgram: batch.degreeProgram, id: { not: batch.id } }, orderBy: [{ startYear: "desc" }], take: 8, select: { id: true, batchName: true, courses: { where: { courseType: { notIn: LIST_TYPES } }, select: { creditHours: true, courseType: true } } } });
  for (const b of batches) {
    if (!b.courses.length) continue;
    const by = new Map<string, number>(); for (const x of b.courses) by.set(x.courseType || "Other", (by.get(x.courseType || "Other") || 0) + 1);
    const src = await batchSource(b.id);
    rows.push({ kind: "BATCH", id: b.id, name: `Batch ${b.batchName}`, badge: "Previous batch", badgeColor: "#8A5A0F", basedOn: src?.curriculumId ? `followed ${curs.find((c) => c.id === src.curriculumId)?.title || "a curriculum"}${src.revision ? ` rev ${src.revision}` : ""}` : null, byType: Array.from(by.entries()), ch: b.courses.reduce((t, x) => t + x.creditHours, 0), courses: b.courses.length, listPool: 0, usedBy: [], revision: src?.revision || 0, isNew: false, curriculumId: src?.curriculumId || null });
  }
  return rows;
}

export { udb };
