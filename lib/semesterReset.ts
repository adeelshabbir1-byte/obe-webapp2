import { randomUUID } from "crypto";
import { gzipSync, gunzipSync } from "zlib";
import { prisma } from "./db";
import { writeAuditLog } from "./audit";

// "Reset this semester's offering" (Program Lead / Department Coordinator): un-offers the courses and removes this
// term's sections, timetable entries, registrations, attendance and marks — keeping plans, CLOs and everything from
// earlier terms. Everything removed is kept in a snapshot first, so it can be restored within 7 days. Refused once a
// result of this term has been approved.

const db = prisma as unknown as Record<string, any>;
export const RESTORE_DAYS = 7;
export const RESET_HINT = "Semester reset needs prisma/migration_prompt10a.sql — run it in Supabase (System Health).";

type Scope = { coordinatorIds: string[]; label: string };

/** This term's offering only: offered courses of each program's current term (else its latest offered term). */
async function termFilter(coordinatorIds: string[]) {
  const terms = await prisma.currentTerm.findMany({ where: { coordinatorId: { in: coordinatorIds.concat("none") } }, select: { coordinatorId: true, termName: true, year: true } });
  const ors: Record<string, unknown>[] = [];
  for (const id of coordinatorIds) {
    let t = terms.find((x) => x.coordinatorId === id) as { termName: string; year: number } | undefined;
    if (!t) {
      const latest = await prisma.course.findFirst({ where: { coordinatorId: id, isOffered: true, offeredTermYear: { not: null } }, orderBy: [{ offeredTermYear: "desc" }, { offeredTermName: "asc" }], select: { offeredTermName: true, offeredTermYear: true } });
      if (latest?.offeredTermName && latest.offeredTermYear) t = { termName: latest.offeredTermName, year: latest.offeredTermYear };
    }
    ors.push(t ? { coordinatorId: id, offeredTermName: t.termName, offeredTermYear: t.year } : { coordinatorId: id });
  }
  return ors.length ? { OR: ors } : { coordinatorId: "none" };
}

async function scopeData(scope: Scope) {
  const courses = await prisma.course.findMany({ where: { ...(await termFilter(scope.coordinatorIds)), isOffered: true }, select: { id: true, code: true, title: true, offeredTermName: true, offeredTermYear: true, batch: { select: { batchName: true } } } });
  const ids = courses.map((c) => c.id).concat("none");
  const groupIds = (await prisma.courseEquivalenceMember.findMany({ where: { courseId: { in: ids } }, select: { groupId: true } })).map((g) => g.groupId);
  const sections = await prisma.scheduleSection.findMany({ where: { OR: [{ courseId: { in: ids } }, { groupId: { in: groupIds.concat("none") } }] } });
  const sectionIds = sections.map((s) => s.id).concat("none");
  return { courses, ids, sections, sectionIds };
}

export async function resetPreview(scope: Scope) {
  const { courses, ids, sections, sectionIds } = await scopeData(scope);
  const [entries, enrollments, attendance, sessions, marks, approved] = await Promise.all([
    prisma.timetableEntry.count({ where: { scheduleSectionId: { in: sectionIds } } }),
    prisma.studentEnrollment.count({ where: { courseId: { in: ids } } }),
    prisma.attendanceRecord.count({ where: { courseId: { in: ids } } }),
    prisma.attendanceSession.count({ where: { courseId: { in: ids } } }).catch(() => 0),
    prisma.studentMark.count({ where: { courseId: { in: ids } } }),
    prisma.courseResult.findMany({ where: { courseId: { in: ids }, status: "APPROVED" }, select: { courseId: true } }).catch(() => []),
  ]);
  const terms = Array.from(new Set(courses.map((c) => `${c.offeredTermName || ""} ${c.offeredTermYear || ""}`.trim()).filter(Boolean)));
  const approvedCodes = courses.filter((c) => approved.some((a) => a.courseId === c.id)).map((c) => `${c.code} (${c.batch?.batchName || ""})`);
  return {
    scope: scope.label, terms, confirmWord: terms[0] || scope.label,
    counts: { offeredCourses: courses.length, sections: sections.length, timetableEntries: entries, registrations: enrollments, attendance: attendance + sessions, marks },
    refused: approvedCodes.length ? `Results of this term are already approved for ${approvedCodes.length} course(s): ${approvedCodes.slice(0, 6).join(", ")}${approvedCodes.length > 6 ? "…" : ""}. The offering can no longer be reset.` : null,
  };
}

const pack = (o: unknown) => gzipSync(Buffer.from(JSON.stringify(o))).toString("base64");
const unpack = (s: string) => JSON.parse(gunzipSync(Buffer.from(s, "base64")).toString("utf8"));
const DATE_KEY = /(At|Date|Time)$/;
const revive = (rows: Record<string, unknown>[]) => rows.map((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, typeof v === "string" && DATE_KEY.test(k) && /^\d{4}-\d\d-\d\dT/.test(v) ? new Date(v) : v])));

export async function resetOffering(scope: Scope, by: { id: string }, confirm: string) {
  const p = await resetPreview(scope);
  if (p.refused) return { error: p.refused, status: 409 };
  if (!p.counts.offeredCourses) return { error: "Nothing is offered this semester.", status: 400 };
  if (confirm.trim().toLowerCase() !== p.confirmWord.toLowerCase()) return { error: `Type "${p.confirmWord}" to confirm.`, status: 400 };
  try { await db.semesterReset.count({ where: { id: "none" } }); } catch { return { error: RESET_HINT, status: 500 }; }
  const { courses, ids, sections, sectionIds } = await scopeData(scope);
  // 1. Snapshot everything that is about to go.
  const [entries, enrollments, attendance, sessions, marks, covers, retired, courseRows] = await Promise.all([
    prisma.timetableEntry.findMany({ where: { scheduleSectionId: { in: sectionIds } } }),
    prisma.studentEnrollment.findMany({ where: { courseId: { in: ids } } }),
    prisma.attendanceRecord.findMany({ where: { courseId: { in: ids } } }),
    prisma.attendanceSession.findMany({ where: { courseId: { in: ids } } }).catch(() => []),
    prisma.studentMark.findMany({ where: { courseId: { in: ids } } }),
    db.scheduleSectionCover.findMany({ where: { scheduleSectionId: { in: sectionIds } } }).catch(() => []),
    db.scheduleSectionRetired.findMany({ where: { scheduleSectionId: { in: sectionIds } } }).catch(() => []),
    prisma.course.findMany({ where: { id: { in: ids } }, select: { id: true, isOffered: true, offeredTermName: true, offeredTermYear: true } }),
  ]);
  const id = randomUUID();
  await db.semesterReset.create({ data: { id, scopeKey: scope.coordinatorIds.slice().sort().join(","), label: `${scope.label} · ${p.terms.join(", ") || "current term"}`, byUserId: by.id, expiresAt: new Date(Date.now() + RESTORE_DAYS * 864e5), summaryJson: JSON.stringify(p.counts), dataJson: pack({ courses: courseRows, sections, covers, retired, entries, enrollments, sessions, attendance, marks }) } });
  // 2. Remove (children first), then un-offer.
  await prisma.$transaction(async (tx) => {
    const t = tx as unknown as Record<string, any>;
    await tx.studentMark.deleteMany({ where: { courseId: { in: ids } } });
    await tx.attendanceRecord.deleteMany({ where: { courseId: { in: ids } } });
    if (sessions.length) await t.attendanceSession.deleteMany({ where: { courseId: { in: ids } } });
    await tx.studentEnrollment.deleteMany({ where: { courseId: { in: ids } } });
    await tx.timetableEntry.deleteMany({ where: { scheduleSectionId: { in: sectionIds } } });
    if (covers.length) await t.scheduleSectionCover.deleteMany({ where: { scheduleSectionId: { in: sectionIds } } });
    if (retired.length) await t.scheduleSectionRetired.deleteMany({ where: { scheduleSectionId: { in: sectionIds } } });
    await tx.scheduleSection.deleteMany({ where: { id: { in: sectionIds } } });
    await tx.course.updateMany({ where: { id: { in: ids } }, data: { isOffered: false, offeredTermName: null, offeredTermYear: null } });
  }, { timeout: 120000, maxWait: 15000 });
  await writeAuditLog({ actorUserId: by.id, action: "SEMESTER_OFFERING_RESET", entityType: "SemesterReset", entityId: id, metadata: { ...p.counts, scope: scope.label } as never });
  return { ok: true, id, counts: p.counts, until: new Date(Date.now() + RESTORE_DAYS * 864e5), status: 200, courses: courses.length };
}

export async function resetsFor(scope: Scope) {
  const rows = (await db.semesterReset.findMany({ where: { scopeKey: scope.coordinatorIds.slice().sort().join(",") }, orderBy: { createdAt: "desc" }, take: 10, select: { id: true, label: true, createdAt: true, expiresAt: true, restoredAt: true, summaryJson: true } }).catch(() => [])) as { id: string; label: string; createdAt: Date; expiresAt: Date; restoredAt: Date | null; summaryJson: string }[];
  return rows.map((r) => ({ ...r, counts: JSON.parse(r.summaryJson || "{}"), canRestore: !r.restoredAt && +new Date(r.expiresAt) > Date.now() }));
}

/** Within 7 days: puts back everything the reset removed and offers the courses again as they were. */
export async function restoreOffering(scope: Scope, by: { id: string }, resetId: string) {
  const r = await db.semesterReset.findUnique({ where: { id: resetId } }).catch(() => null);
  if (!r || r.scopeKey !== scope.coordinatorIds.slice().sort().join(",")) return { error: "not found", status: 404 };
  if (r.restoredAt) return { error: "Already restored.", status: 409 };
  if (+new Date(r.expiresAt) < Date.now()) return { error: `The ${RESTORE_DAYS}-day restore window has passed.`, status: 409 };
  const d = unpack(r.dataJson);
  await prisma.$transaction(async (tx) => {
    const t = tx as unknown as Record<string, any>;
    for (const c of d.courses as { id: string; isOffered: boolean; offeredTermName: string | null; offeredTermYear: number | null }[]) await tx.course.update({ where: { id: c.id }, data: { isOffered: c.isOffered, offeredTermName: c.offeredTermName, offeredTermYear: c.offeredTermYear } });
    const put = async (model: string, rows: Record<string, unknown>[]) => { for (let i = 0; i < rows.length; i += 2000) await t[model].createMany({ data: revive(rows.slice(i, i + 2000)), skipDuplicates: true }); };
    await put("scheduleSection", d.sections);
    if (d.covers?.length) await put("scheduleSectionCover", d.covers);
    if (d.retired?.length) await put("scheduleSectionRetired", d.retired);
    await put("timetableEntry", d.entries);
    await put("studentEnrollment", d.enrollments);
    if (d.sessions?.length) await put("attendanceSession", d.sessions);
    await put("attendanceRecord", d.attendance);
    await put("studentMark", d.marks);
  }, { timeout: 180000, maxWait: 15000 });
  await db.semesterReset.update({ where: { id: resetId }, data: { restoredAt: new Date(), restoredById: by.id } });
  await writeAuditLog({ actorUserId: by.id, action: "SEMESTER_OFFERING_RESTORED", entityType: "SemesterReset", entityId: resetId, metadata: JSON.parse(r.summaryJson || "{}") });
  return { ok: true, status: 200 };
}
