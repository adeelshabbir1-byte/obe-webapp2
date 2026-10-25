import { randomUUID } from "crypto";
import { prisma } from "./db";
import { writeAuditLog } from "./audit";
import { LIST_TYPES } from "./autoCopyPreviousBatch";
import { batchSource } from "./universityCurriculum";
import { linkAsFollowerOfSource, syncGroupSubjectHome } from "./contentSync";
import { deleteCourseCompletely } from "./deleteCourseCompletely";
import { copyCourseContent } from "./benchmarkCopy";

// The steps after a batch takes its courses from a curriculum (e.g. NCEAC): ① sync & equalise each course with the course
// already taught (the existing content-sync link — the course then takes that course's home department), or mark it new;
// ② home department of the new courses; ③ final names and codes where the equal courses differ. Plus the scheme's own
// changes (courses added from another degree, removed), merging duplicates, and the tracks the batch offers.

const db = prisma as unknown as Record<string, any>;
type U = { id: string; name: string; managedById?: string | null };
const norm = (t: string) => t.toLowerCase().replace(/&/g, " and ").replace(/\(.*?\)/g, " ").replace(/\b(with|w\/)\s*lab\b/g, " ").replace(/[-–]\s*(i{1,3}|iv|\d)\b/g, " $1").replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
export const sameName = (a: string, b: string) => norm(a) === norm(b);

export async function logChange(batchId: string, by: U, action: string, c: { id?: string | null; code?: string; title?: string }, why?: string | null) {
  await db.batchSchemeChange.create({ data: { id: randomUUID(), batchId, courseId: c.id || null, code: c.code || "", title: c.title || "", action, why: why || null, byId: by.id, byName: by.name } }).catch(() => null);
}

export type SetupRow = { id: string; code: string; title: string; home: string | null; homeId: string | null; matched: { id: string; code: string; title: string; batch: string } | null; isNew: boolean; suggestion: { id: string; code: string; title: string; batch: string } | null };

/** The set-up state of a batch: which courses are equalised, new or still open, and where names / codes differ. */
export async function setupStatus(batchId: string) {
  const batch = await prisma.batch.findUnique({ where: { id: batchId }, select: { id: true, degreeProgram: true, coordinatorId: true, coordinator: { select: { managedById: true } } } });
  if (!batch) return null;
  const src = await batchSource(batchId);
  const fromCurriculum = !!src && src.how !== "BATCH_AS_TAUGHT";
  const cs = await prisma.course.findMany({ where: { batchId, courseType: { notIn: LIST_TYPES } }, orderBy: [{ semesterNumber: "asc" }, { code: "asc" }], select: { id: true, code: true, title: true, masterCourseId: true, subjectHomeDepartmentId: true, subjectHomeDepartment: { select: { name: true } } } });
  const ids = cs.map((c) => c.id).concat("none");
  const mem = await prisma.courseContentSyncMember.findMany({ where: { courseId: { in: ids } }, select: { courseId: true, groupId: true } });
  const others = await prisma.courseContentSyncMember.findMany({ where: { groupId: { in: mem.map((m) => m.groupId).concat("none") }, courseId: { notIn: ids } }, select: { groupId: true, course: { select: { id: true, code: true, title: true, createdAt: true, batch: { select: { batchName: true } } } } } });
  const newOnes = new Set(((await db.batchCourseNew.findMany({ where: { batchId } }).catch(() => [])) as { courseId: string }[]).map((x) => x.courseId));
  // Courses already taught: the program's other batches in the institute.
  const prior = await prisma.course.findMany({ where: { batchId: { not: batchId }, batch: { degreeProgram: batch.degreeProgram, coordinator: { managedById: batch.coordinator.managedById } }, courseType: { notIn: LIST_TYPES } }, orderBy: { createdAt: "desc" }, select: { id: true, code: true, title: true, masterCourseId: true, batch: { select: { batchName: true } } } });
  const seen = new Set<string>(); const candidates = prior.filter((p) => { const k = p.code.toUpperCase(); if (seen.has(k)) return false; seen.add(k); return true; });
  const rows: SetupRow[] = cs.map((c) => {
    const g = mem.find((m) => m.courseId === c.id);
    const o = g ? others.filter((x) => x.groupId === g.groupId).sort((a, b) => +b.course.createdAt - +a.course.createdAt)[0]?.course : null;
    const sug = o ? null : candidates.find((p) => c.masterCourseId && p.masterCourseId === c.masterCourseId) || candidates.find((p) => p.code.toUpperCase() === c.code.toUpperCase()) || candidates.find((p) => sameName(p.title, c.title)) || null;
    return { id: c.id, code: c.code, title: c.title, home: c.subjectHomeDepartment?.name || null, homeId: c.subjectHomeDepartmentId, matched: o ? { id: o.id, code: o.code, title: o.title, batch: o.batch?.batchName || "" } : null, isNew: newOnes.has(c.id), suggestion: sug ? { id: sug.id, code: sug.code, title: sug.title, batch: sug.batch?.batchName || "" } : null };
  });
  const open = rows.filter((r) => !r.matched && !r.isNew);
  const noHome = rows.filter((r) => !r.homeId);
  // Names / codes still to decide: equal courses that differ, unless the program already chose this exact name and code.
  const chosen = batch.coordinator.managedById ? await namingFor(batch.coordinator.managedById, batch.degreeProgram) : new Map<string, { code: string; title: string }>();
  const masterOf = new Map(cs.map((c) => [c.id, c.masterCourseId]));
  const naming = rows.filter((r) => { if (!r.matched || (r.matched.code.toUpperCase() === r.code.toUpperCase() && sameName(r.matched.title, r.title))) return false; const ch = chosen.get(masterOf.get(r.id) || ""); return !(ch && ch.code === r.code && ch.title === r.title); });
  return {
    fromCurriculum, source: src, rows, open: open.length, noHome: noHome.length, naming,
    candidates: candidates.map((p) => ({ id: p.id, code: p.code, title: p.title, batch: p.batch?.batchName || "" })),
    done: !fromCurriculum || (open.length === 0 && noHome.length === 0),
  };
}

/** ① Equal to a course already taught: the existing content-sync link; the home department comes with it. */
export async function equalise(by: U, courseId: string, prevCourseId: string) {
  const [c, p] = await Promise.all([
    prisma.course.findUnique({ where: { id: courseId }, select: { id: true, code: true, title: true, batchId: true, coordinator: { select: { managedById: true } } } }),
    prisma.course.findUnique({ where: { id: prevCourseId }, select: { id: true, code: true, subjectHomeDepartmentId: true, coordinator: { select: { managedById: true } } } }),
  ]);
  if (!c || !p || c.coordinator.managedById !== p.coordinator.managedById) throw new Error("Choose a course of this institute.");
  await linkAsFollowerOfSource(p.id, c.id, c.coordinator.managedById || "");
  const m = await prisma.courseContentSyncMember.findUnique({ where: { courseId: c.id } });
  if (m) await syncGroupSubjectHome(m.groupId);
  if (p.subjectHomeDepartmentId) await prisma.course.updateMany({ where: { id: c.id, subjectHomeDepartmentId: null }, data: { subjectHomeDepartmentId: p.subjectHomeDepartmentId } });
  await db.batchCourseNew.deleteMany({ where: { courseId: c.id } }).catch(() => null);
  // The synced course takes the previous course's semester (unless moved by hand), Subject Expert and plan.
  const { applySyncDefaults } = await import("./batchFlow");
  await applySyncDefaults([c.id], by.id).catch(() => null);
  await writeAuditLog({ actorUserId: by.id, action: "BATCH_COURSE_EQUALISED", entityType: "Course", entityId: c.id, metadata: { to: p.id, code: p.code } }).catch(() => null);
}
/** ① New course (equal to nothing taught before), with ② its home department. */
export async function markNew(by: U, courseId: string, homeDepartmentId?: string | null) {
  const c = await prisma.course.findUnique({ where: { id: courseId }, select: { id: true, batchId: true } });
  if (!c?.batchId) throw new Error("Course not found.");
  await db.batchCourseNew.upsert({ where: { courseId }, create: { courseId, batchId: c.batchId, byId: by.id }, update: { byId: by.id, at: new Date() } });
  if (homeDepartmentId !== undefined) await setHome(courseId, homeDepartmentId);
}
export async function setHome(courseId: string, departmentId: string | null) {
  await prisma.course.update({ where: { id: courseId }, data: { subjectHomeDepartmentId: departmentId || null } });
}

/** ③ Final names and codes. Remembered as the program's choice, so the next batch from the same curriculum starts with it. */
export async function saveNaming(by: U, batchId: string, picks: { courseId: string; code: string; title: string }[]) {
  const b = await prisma.batch.findUnique({ where: { id: batchId }, select: { degreeProgram: true, coordinator: { select: { managedById: true } } } });
  if (!b) throw new Error("Batch not found.");
  const cs = await prisma.course.findMany({ where: { batchId }, select: { id: true, code: true, title: true, masterCourseId: true } });
  const finalCode = new Map(cs.map((c) => [c.id, c.code.toUpperCase()]));
  for (const p of picks) finalCode.set(p.courseId, p.code.trim().toUpperCase());
  const counts = new Map<string, number>(); for (const v of Array.from(finalCode.values())) counts.set(v, (counts.get(v) || 0) + 1);
  const clash = picks.filter((p) => (counts.get(p.code.trim().toUpperCase()) || 0) > 1).map((p) => p.code);
  if (clash.length) throw new Error(`Two courses would have the same code: ${Array.from(new Set(clash)).join(", ")}.`);
  let n = 0;
  for (const p of picks) {
    const c = cs.find((x) => x.id === p.courseId); if (!c) continue;
    const code = p.code.trim().slice(0, 30), title = p.title.trim().slice(0, 200);
    if (!code || !title) continue;
    if (code !== c.code || title !== c.title) { await prisma.course.update({ where: { id: c.id }, data: { code, title } }); n++; }
    if (c.masterCourseId && b.coordinator.managedById) await db.programCourseNaming.upsert({ where: { chairmanId_program_masterCourseId: { chairmanId: b.coordinator.managedById, program: b.degreeProgram, masterCourseId: c.masterCourseId } }, create: { chairmanId: b.coordinator.managedById, program: b.degreeProgram, masterCourseId: c.masterCourseId, code, title, byId: by.id }, update: { code, title, byId: by.id, at: new Date() } }).catch(() => null);
  }
  await writeAuditLog({ actorUserId: by.id, action: "BATCH_NAMES_CODES_SET", entityType: "Batch", entityId: batchId, metadata: { changed: n } }).catch(() => null);
  return n;
}
/** The program's earlier choice of name / code for a curriculum course (used on import). */
export async function namingFor(chairmanId: string, program: string) {
  const rows = ((await db.programCourseNaming.findMany({ where: { chairmanId, program } }).catch(() => [])) as { masterCourseId: string; code: string; title: string }[]);
  return new Map(rows.map((r) => [r.masterCourseId, r]));
}

/** The same course twice in a batch (same curriculum course or same code): keep the one with students / marks / CLOs. */
export async function mergeDuplicates(by: U, batchId: string) {
  const cs = await prisma.course.findMany({ where: { batchId }, select: { id: true, code: true, title: true, masterCourseId: true, _count: { select: { studentEnrollments: true, studentMarks: true, attendanceRecords: true, clos: true } } } });
  const groups = new Map<string, typeof cs>();
  for (const c of cs) { const k = c.masterCourseId || `code:${c.code.replace(/-[^-]+$/, "").toUpperCase()}`; groups.set(k, [...(groups.get(k) || []), c]); }
  let removed = 0; const kept: string[] = [];
  for (const g of Array.from(groups.values())) {
    if (g.length < 2) continue;
    const score = (c: (typeof cs)[number]) => c._count.studentEnrollments * 1000 + c._count.studentMarks * 100 + c._count.attendanceRecords * 10 + c._count.clos;
    const sorted = g.slice().sort((a, b) => score(b) - score(a));
    for (const c of sorted.slice(1)) {
      if (c._count.studentEnrollments || c._count.studentMarks || c._count.attendanceRecords) { kept.push(`${c.code} ${c.title}`); continue; }
      await deleteCourseCompletely(c.id).then(() => { removed++; }).catch(() => kept.push(`${c.code} ${c.title}`));
      await logChange(batchId, by, "MERGED_DUPLICATE", c, `duplicate of ${sorted[0].code}`);
    }
  }
  return `${removed} duplicate course(s) removed.${kept.length ? ` Kept (students, marks or attendance): ${kept.join(", ")}.` : ""}`;
}

/** × on a course card: only while nobody studies it yet. */
export async function removeCourse(by: U, courseId: string, why: string) {
  const c = await prisma.course.findUnique({ where: { id: courseId }, select: { id: true, code: true, title: true, batchId: true, _count: { select: { studentEnrollments: true, studentMarks: true, attendanceRecords: true } } } });
  if (!c?.batchId) throw new Error("Course not found.");
  if (c._count.studentEnrollments || c._count.studentMarks || c._count.attendanceRecords) throw new Error(`${c.code} has students, marks or attendance — it can't be removed.`);
  await deleteCourseCompletely(c.id);
  await logChange(c.batchId, by, "REMOVED", c, why);
}

/** "+ Add a course from another degree": a copy of another batch's course (with its plan and home department), or a
 *  curriculum course (with the university plan / curriculum CLOs). */
export async function addCourse(by: U, batchId: string, from: { courseId?: string; masterCourseId?: string }, type: string, semester: number | null) {
  const b = await prisma.batch.findUnique({ where: { id: batchId }, select: { id: true, coordinatorId: true } });
  if (!b) throw new Error("Batch not found.");
  const codes = new Set((await prisma.course.findMany({ where: { batchId }, select: { code: true } })).map((c) => c.code.toUpperCase()));
  const uniq = (code: string) => { let x = code, i = 2; while (codes.has(x.toUpperCase())) x = `${code}-${i++}`; return x; };
  if (from.courseId) {
    const s = await prisma.course.findUnique({ where: { id: from.courseId } });
    if (!s) throw new Error("Course not found.");
    const n = await prisma.course.create({ data: { code: uniq(s.code), title: s.title, creditHours: s.creditHours, courseType: type || s.courseType, semesterNumber: semester ?? s.semesterNumber, coordinatorId: b.coordinatorId, batchId, masterCourseId: s.masterCourseId, subjectHomeDepartmentId: s.subjectHomeDepartmentId, isNonCredit: s.isNonCredit, textbook: s.textbook, catalogDescription: s.catalogDescription, referenceMaterial: s.referenceMaterial } });
    await copyCourseContent(s.id, n.id).catch(() => null);
    await logChange(batchId, by, "ADDED", n, `from another degree (${s.code})`);
    return n;
  }
  const m = from.masterCourseId ? await prisma.masterCourse.findUnique({ where: { id: from.masterCourseId } }) : null;
  if (!m) throw new Error("Course not found.");
  const n = await prisma.course.create({ data: { code: uniq(m.code), title: m.title, creditHours: m.creditHours, courseType: type || "Core", semesterNumber: semester ?? m.semesterNumber, coordinatorId: b.coordinatorId, batchId, masterCourseId: m.id, textbook: m.textbook, catalogDescription: m.catalogDescription, referenceMaterial: m.referenceMaterial } });
  const uc = await import("./universityCurriculum");
  const { seedFromMasterCourseIfAvailable } = await import("./benchmarkCopy");
  if (!(await uc.seedFromUniversityPlan(n.id, m.id, by.id).catch(() => false))) await seedFromMasterCourseIfAvailable(n.id, m.id).catch(() => null);
  await uc.assignDefaultSubjectExpert(n.id, by.id).catch(() => null);
  await logChange(batchId, by, "ADDED", n, "from a curriculum");
  return n;
}

export async function schemeChanges(batchId: string) {
  return ((await db.batchSchemeChange.findMany({ where: { batchId }, orderBy: { at: "desc" }, take: 50 }).catch(() => [])) as { id: string; code: string; title: string; action: string; why: string | null; byName: string; at: Date }[]);
}

/** Tracks this batch offers (from its curriculum's specialisation tracks). */
export async function offeredTracks(batchId: string) {
  return ((await db.batchTrackOffer.findMany({ where: { batchId } }).catch(() => [])) as { trackId: string; name: string }[]);
}
export async function setOfferedTracks(batchId: string, tracks: { id: string; name: string }[]) {
  await db.batchTrackOffer.deleteMany({ where: { batchId } }).catch(() => null);
  for (const t of tracks) await db.batchTrackOffer.create({ data: { batchId, trackId: t.id, name: t.name } }).catch(() => null);
}
