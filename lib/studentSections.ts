import { prisma } from "./db";

// Student sections and the section limit for the department timetable.
//
//  - A batch with more students than the limit (default 50) is split into student sections A, B, C…, as even as
//    possible (120 → 40 + 40 + 40, 51 → 26 + 25, never 50 + 1). Section A of a batch is the same students in every course.
//  - Every timetable section (ScheduleSection) covers one or more student sections (ScheduleSectionCover). Its size is
//    the sum of what it covers and is never over the limit.
//  - A combined class (Course Equivalence) joins student sections of different batches only while the total stays within
//    the limit; three or more are packed first-fit decreasing into as few classes as possible, never splitting one
//    student section across two classes.
//  - In the timetable data a student section is "batchId#A": A and B of one batch may run at the same time; A can't be
//    in two places at once.

export const MAX_SECTION = 50;
const db = prisma as unknown as Record<string, any>;
export const STUDENT_SECTIONS_HINT = "Student sections need prisma/migration_student_sections.sql — run it in Supabase.";

export type StudentSection = { label: string; size: number };
export type Cover = { batchId: string; label: string; size: number };
export const sectionKey = (batchId: string, label: string) => `${batchId}#${label}`;
export const labelOf = (i: number) => (i < 26 ? String.fromCharCode(65 + i) : `${String.fromCharCode(65 + Math.floor(i / 26) - 1)}${String.fromCharCode(65 + (i % 26))}`);

/** ceil(count / max) sections, as even as possible (the first ones get the extra student). */
export function splitSizes(count: number, max = MAX_SECTION): number[] {
  const n = Math.max(1, Math.ceil(Math.max(0, count) / Math.max(1, max)));
  const base = Math.floor(Math.max(0, count) / n), extra = Math.max(0, count) % n;
  return Array.from({ length: n }, (_, i) => base + (i < extra ? 1 : 0));
}

export type PackItem = { key: string; batchId: string; size: number };
/** First-fit decreasing into classes of at most `max`; a class never holds two sections of the same batch. */
export function packCombined(items: PackItem[], max = MAX_SECTION): { items: PackItem[]; total: number }[] {
  const bins: { items: PackItem[]; total: number }[] = [];
  for (const it of items.slice().sort((a, b) => b.size - a.size || a.key.localeCompare(b.key))) {
    const bin = bins.find((b) => b.total + it.size <= max && !b.items.some((x) => x.batchId === it.batchId));
    if (bin) { bin.items.push(it); bin.total += it.size; } else bins.push({ items: [it], total: it.size });
  }
  return bins;
}

/** Why a group is (not) combined, e.g. "not combined — 30 + 30 = 60 > 50". */
export function packNote(items: PackItem[], bins: { items: PackItem[]; total: number }[], max = MAX_SECTION): string {
  if (items.length < 2) return "";
  const combined = bins.filter((b) => b.items.length > 1);
  const total = items.reduce((a, b) => a + b.size, 0);
  if (!combined.length) return `not combined — ${items.map((i) => i.size).join(" + ")} = ${total} > ${max}`;
  if (bins.length === 1) return `combined (${total})`;
  return `combined into ${bins.length} classes (${bins.map((b) => b.total).join(", ")}), each ≤ ${max}`;
}

// --------------------------------------------------------------------------------------------- the limit
export async function getMaxSection(chairmanId: string, scopeKey: string): Promise<number> {
  const row = await db.timetableSetting.findUnique({ where: { chairmanId_scopeKey: { chairmanId, scopeKey } } }).catch(() => null);
  return row?.maxSection && row.maxSection > 0 ? row.maxSection : MAX_SECTION;
}
export async function setMaxSection(chairmanId: string, scopeKey: string, max: number, byId: string) {
  const v = Math.max(5, Math.min(500, Math.round(max)));
  await db.timetableSetting.upsert({ where: { chairmanId_scopeKey: { chairmanId, scopeKey } }, create: { chairmanId, scopeKey, maxSection: v, updatedById: byId }, update: { maxSection: v, updatedById: byId, updatedAt: new Date() } });
  return v;
}

// --------------------------------------------------------------------------------------------- student sections of a batch
/** The stored sections of these batches, or (when none are stored yet) the split of the student count. Read-only. */
export async function sectionsOfBatches(batchIds: string[], max = MAX_SECTION): Promise<Map<string, StudentSection[]>> {
  const ids = Array.from(new Set(batchIds)).concat("none");
  const [batches, rows] = await Promise.all([
    prisma.batch.findMany({ where: { id: { in: ids } }, select: { id: true, studentCount: true } }),
    db.batchStudentSection.findMany({ where: { batchId: { in: ids } }, orderBy: { label: "asc" } }).catch(() => []) as Promise<{ batchId: string; label: string; size: number }[]>,
  ]);
  const out = new Map<string, StudentSection[]>();
  for (const b of batches) {
    const stored = rows.filter((r) => r.batchId === b.id);
    const fits = stored.length > 0 && stored.every((r) => r.size <= max) && stored.reduce((a, r) => a + r.size, 0) === b.studentCount && stored.length === splitSizes(b.studentCount, max).length;
    out.set(b.id, fits ? stored.map((r) => ({ label: r.label, size: r.size })) : splitSizes(b.studentCount, max).map((size, i) => ({ label: labelOf(i), size })));
  }
  return out;
}

/** Makes sure a batch's sections match its student count and the limit; recomputes (and re-places students) when not. */
export async function ensureBatchSections(batchId: string, max = MAX_SECTION): Promise<StudentSection[]> {
  const b = await prisma.batch.findUnique({ where: { id: batchId }, select: { studentCount: true } });
  if (!b) return [];
  const want = splitSizes(b.studentCount, max);
  const rows = ((await db.batchStudentSection.findMany({ where: { batchId }, orderBy: { label: "asc" } }).catch(() => null)) as { label: string; size: number }[] | null);
  if (rows === null) return want.map((size, i) => ({ label: labelOf(i), size })); // migration not run yet
  const total = rows.reduce((a, r) => a + r.size, 0);
  const fine = rows.length === want.length && total === b.studentCount && rows.every((r) => r.size <= max);
  if (fine) return rows.map((r) => ({ label: r.label, size: r.size }));
  await db.batchStudentSection.deleteMany({ where: { batchId } });
  await db.batchStudentSection.createMany({ data: want.map((size, i) => ({ batchId, label: labelOf(i), size })) });
  await placeStudents(batchId, want.map((size, i) => ({ label: labelOf(i), size })));
  return want.map((size, i) => ({ label: labelOf(i), size }));
}

/** Students into sections by roll number, evenly; a student moved by hand keeps the section while it exists. */
export async function placeStudents(batchId: string, sections: StudentSection[]) {
  const students = await prisma.student.findMany({ where: { batchId, status: "ACTIVE" }, select: { id: true, rollNumber: true }, orderBy: { rollNumber: "asc" } });
  const existing = ((await db.studentSectionMember.findMany({ where: { batchId } }).catch(() => [])) as { studentId: string; label: string; manual: boolean }[]);
  const labels = new Set(sections.map((s) => s.label));
  const keep = new Map(existing.filter((e) => e.manual && labels.has(e.label)).map((e) => [e.studentId, e.label]));
  // Each section's share of the students actually on the roll, as even as possible; hand-moved students count first.
  const n = sections.length, total = students.length;
  const target = sections.map((_, k) => Math.floor(total / n) + (k < total % n ? 1 : 0));
  sections.forEach((sec, k) => { for (const l of keep.values()) if (l === sec.label) target[k]--; });
  const plan: { studentId: string; label: string }[] = [];
  let k = 0;
  for (const st of students.filter((x) => !keep.has(x.id))) {
    while (k < n - 1 && target[k] <= 0) k++;
    plan.push({ studentId: st.id, label: sections[k].label });
    target[k]--;
  }
  await db.studentSectionMember.deleteMany({ where: { batchId, manual: false } });
  await db.studentSectionMember.deleteMany({ where: { batchId, manual: true, label: { notIn: Array.from(labels) } } });
  if (plan.length) await db.studentSectionMember.createMany({ data: plan.map((p) => ({ ...p, batchId, manual: false })), skipDuplicates: true });
}

/** Moves one student to another section of their batch (refused when that section is full). */
export async function moveStudent(studentId: string, label: string, max = MAX_SECTION) {
  const st = await prisma.student.findUnique({ where: { id: studentId }, select: { batchId: true, name: true } });
  if (!st) throw new Error("Student not found.");
  const sections = await ensureBatchSections(st.batchId, max);
  if (!sections.some((s) => s.label === label)) throw new Error(`The batch has no Section ${label}.`);
  const inTarget = await db.studentSectionMember.count({ where: { batchId: st.batchId, label, studentId: { not: studentId } } }).catch(() => { throw new Error(STUDENT_SECTIONS_HINT); });
  if (inTarget + 1 > max) throw new Error(`Section ${label} already has ${inTarget} students — the limit is ${max}.`);
  await db.studentSectionMember.upsert({ where: { studentId }, create: { studentId, batchId: st.batchId, label, manual: true }, update: { label, manual: true, updatedAt: new Date() } });
}

export async function sectionOfStudents(studentIds: string[]): Promise<Map<string, string>> {
  const rows = ((await db.studentSectionMember.findMany({ where: { studentId: { in: studentIds.concat("none") } } }).catch(() => [])) as { studentId: string; label: string }[]);
  return new Map(rows.map((r) => [r.studentId, r.label]));
}

// --------------------------------------------------------------------------------------------- what a timetable section covers
type SecForCovers = { id: string; course?: { batchId: string | null } | null; group?: { members: { course: { batchId: string | null; isOffered?: boolean } }[] } | null };
/** The student sections each timetable section covers. A section made before student sections existed covers its whole
 *  batch (for a combined class: every offered member batch). */
export async function coversOf(sections: SecForCovers[], max = MAX_SECTION): Promise<Map<string, Cover[]>> {
  const rows = ((await db.scheduleSectionCover.findMany({ where: { scheduleSectionId: { in: sections.map((s) => s.id).concat("none") } } }).catch(() => [])) as (Cover & { scheduleSectionId: string })[]);
  const batchIds = new Set<string>();
  for (const s of sections) {
    if (s.course?.batchId) batchIds.add(s.course.batchId);
    for (const m of s.group?.members || []) if (m.course.batchId && m.course.isOffered !== false) batchIds.add(m.course.batchId);
  }
  const split = await sectionsOfBatches(Array.from(batchIds), max);
  const out = new Map<string, Cover[]>();
  for (const s of sections) {
    const mine = rows.filter((r) => r.scheduleSectionId === s.id).map((r) => ({ batchId: r.batchId, label: r.label, size: r.size }));
    if (mine.length) { out.set(s.id, mine); continue; }
    const bs = s.course ? [s.course.batchId] : (s.group?.members || []).filter((m) => m.course.isOffered !== false).map((m) => m.course.batchId);
    out.set(s.id, Array.from(new Set(bs.filter((x): x is string => !!x))).flatMap((b) => (split.get(b) || []).map((x) => ({ batchId: b, label: x.label, size: x.size }))));
  }
  return out;
}

export async function retiredSectionIds(ids?: string[]): Promise<Set<string>> {
  const rows = ((await db.scheduleSectionRetired.findMany({ where: ids ? { scheduleSectionId: { in: ids.concat("none") } } : {} }).catch(() => [])) as { scheduleSectionId: string }[]);
  return new Set(rows.map((r) => r.scheduleSectionId));
}

// --------------------------------------------------------------------------------------------- the section plan (pure)
export type PlanCourse = {
  id: string; code: string; batchId: string; batchLabel: string; courseType: string; isNonCredit: boolean; contactHours: number | null;
  instructorId: string | null; assignments: { instructorId: string; sectionCount: number }[]; groupId: string | null;
};
export type PlanGroup = { id: string; name: string; assignments: { instructorId: string; sectionCount: number }[] };
export type PlannedSection = {
  courseId: string | null; groupId: string | null; label: string; roomType: string; sessionsPerWeek: number; durationMinutes: number;
  covers: Cover[]; instructorId: string | null; code: string;
};
export type Plan = { sections: PlannedSection[]; toAssign: string[]; extraUnits: string[]; groupNotes: { group: string; note: string }[] };

export function sessionShape(c: { courseType: string; isNonCredit: boolean; contactHours: number | null }) {
  const roomType = c.courseType === "Lab" ? "LAB" : "LECTURE";
  const nonCreditHours = c.isNonCredit && c.contactHours ? c.contactHours : 0;
  const sessionsPerWeek = nonCreditHours ? (nonCreditHours <= 1 ? 1 : 2) : roomType === "LAB" ? 1 : 2;
  const durationMinutes = nonCreditHours ? Math.round((nonCreditHours * 60) / sessionsPerWeek) : roomType === "LAB" ? 180 : 90;
  return { roomType, sessionsPerWeek, durationMinutes };
}

const units = (direct: string | null, a: { instructorId: string; sectionCount: number }[]) => {
  const out: string[] = [];
  if (direct && !a.some((x) => x.instructorId === direct)) out.push(direct);
  for (const x of a) for (let i = 0; i < Math.max(1, x.sectionCount); i++) out.push(x.instructorId);
  return out;
};

/** One timetable section per student section of every offered course; combined groups packed into classes ≤ max. */
export function planSections(courses: PlanCourse[], groups: PlanGroup[], sectionsByBatch: Map<string, StudentSection[]>, max = MAX_SECTION): Plan {
  const plan: Plan = { sections: [], toAssign: [], extraUnits: [], groupNotes: [] };
  const byGroup = new Map<string, PlanCourse[]>();
  for (const c of courses) if (c.groupId) byGroup.set(c.groupId, [...(byGroup.get(c.groupId) || []), c]);
  const leftoverGroupUnits = new Map<string, string[]>();
  const inGroup = new Map<string, string[]>(); // course in a combined group -> its student sections taught alone

  for (const g of groups) {
    const members = (byGroup.get(g.id) || []).filter((c) => (sectionsByBatch.get(c.batchId) || []).length);
    if (members.length < 2) continue; // one offered member: taught as its own course below
    const shape = sessionShape(members[0]);
    const items: (PackItem & { course: PlanCourse; label: string })[] = members.flatMap((c) => (sectionsByBatch.get(c.batchId) || []).map((s) => ({ key: sectionKey(c.batchId, s.label), batchId: c.batchId, size: s.size, course: c, label: s.label })));
    const bins = packCombined(items, max);
    plan.groupNotes.push({ group: g.name, note: packNote(items, bins, max) });
    const gUnits = units(null, g.assignments);
    let n = 0;
    for (const bin of bins.filter((b) => b.items.length > 1)) {
      n++;
      const instructorId = gUnits.shift() || null;
      if (!instructorId) plan.toAssign.push(`${g.name} — Combined ${n}`);
      plan.sections.push({ courseId: null, groupId: g.id, label: `Combined ${n}`, ...shape, covers: bin.items.map((x) => { const it = x as (typeof items)[number]; return { batchId: it.batchId, label: it.label, size: it.size }; }), instructorId, code: g.name });
    }
    leftoverGroupUnits.set(g.id, gUnits);
    // Student sections left alone are taught in their own course (with the courses below, using the group's spare teachers).
    for (const c of members) inGroup.set(c.id, []);
    for (const bin of bins.filter((b) => b.items.length === 1)) {
      const it = bin.items[0] as (typeof items)[number];
      inGroup.get(it.course.id)!.push(it.label);
    }
  }

  for (const c of courses) {
    const sections = sectionsByBatch.get(c.batchId) || [];
    const alone = inGroup.get(c.id);
    const mine = alone ? sections.filter((s) => alone.includes(s.label)) : sections;
    const u = units(c.instructorId, c.assignments);
    const spare = c.groupId ? leftoverGroupUnits.get(c.groupId) || [] : [];
    const shape = sessionShape(c);
    for (const s of mine) {
      const instructorId = u.shift() || spare.shift() || null;
      if (!instructorId) plan.toAssign.push(`${c.code} ${c.batchLabel} — Section ${s.label}`);
      plan.sections.push({ courseId: c.id, groupId: null, label: `Section ${s.label}`, ...shape, covers: [{ batchId: c.batchId, label: s.label, size: s.size }], instructorId, code: c.code });
    }
    if (u.length && !alone) plan.extraUnits.push(`${c.code} ${c.batchLabel}: ${u.length} more section(s) assigned than the batch has (${sections.length})`);
  }
  return plan;
}

/** Student-section keys ("batchId#A") of each timetable section — what clash checks compare. */
export async function sectionKeysById(sectionIds: string[], max = MAX_SECTION): Promise<Map<string, string[]>> {
  const ss = await prisma.scheduleSection.findMany({ where: { id: { in: Array.from(new Set(sectionIds)).concat("none") } }, include: { course: { select: { batchId: true } }, group: { include: { members: { include: { course: { select: { batchId: true, isOffered: true } } } } } } } });
  const cv = await coversOf(ss.map((s) => ({ id: s.id, course: s.course, group: s.group })), max);
  return new Map(ss.map((s) => [s.id, (cv.get(s.id) || []).map((c) => sectionKey(c.batchId, c.label))]));
}
