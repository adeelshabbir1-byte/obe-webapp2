import { randomUUID } from "crypto";
import { prisma } from "./db";
import { writeAuditLog } from "./audit";
import { notifyUsers } from "./notifications";

// End-of-term archive (Adeel prompt §10). When a term's results are approved, the Controller / HOD archives it: one
// read-only JSON snapshot per course (plan, lecture rows, CLOs and mappings, assessments, marks, paper items, CQI,
// timetable). After that, marks of that course can't change without an approved amendment (Controller / HOD), which
// opens editing for 48 hours and is recorded with its reason. Reports for an archived term read the snapshot.
const db = prisma as unknown as Record<string, any>;
export const termOf = (c: { offeredTermName: string | null; offeredTermYear: number | null }) => `${c.offeredTermName || ""} ${c.offeredTermYear || ""}`.trim();

/** Terms of the institute with how many courses, how many approved results and whether archived. */
export async function termsOverview(chairmanId: string) {
  const courses = await prisma.course.findMany({ where: { coordinator: { managedById: chairmanId }, offeredTermYear: { not: null } }, select: { id: true, offeredTermName: true, offeredTermYear: true } });
  const ids = courses.map((c) => c.id).concat("none");
  const [results, archived] = await Promise.all([
    ((await db.courseResult?.findMany({ where: { courseId: { in: ids }, status: "APPROVED" }, select: { courseId: true } }).catch(() => [])) || []) as { courseId: string }[],
    ((await db.termArchive?.findMany({ where: { chairmanId }, select: { courseId: true, term: true, createdAt: true } }).catch(() => [])) || []) as { courseId: string; term: string; createdAt: Date }[],
  ]);
  const ok = new Set(results.map((r) => r.courseId));
  const by = new Map<string, { term: string; courses: number; approved: number; archived: number; at: Date | null }>();
  for (const c of courses) {
    const t = termOf(c); if (!t) continue;
    const o = by.get(t) || { term: t, courses: 0, approved: 0, archived: 0, at: null };
    o.courses++; if (ok.has(c.id)) o.approved++;
    const a = archived.find((x) => x.courseId === c.id && x.term === t); if (a) { o.archived++; o.at = a.createdAt; }
    by.set(t, o);
  }
  return Array.from(by.values()).sort((a, b) => b.term.localeCompare(a.term));
}

async function snapshot(courseId: string) {
  const [course, clos, lectures, instruments, marks, paper, cqi, sections, result] = await Promise.all([
    prisma.course.findUnique({ where: { id: courseId } }),
    prisma.cLO.findMany({ where: { courseId } }),
    prisma.lectureRow.findMany({ where: { courseId } }),
    prisma.assessmentInstrument.findMany({ where: { courseId } }),
    prisma.studentMark.findMany({ where: { courseId } }),
    prisma.paperDistributionItem.findMany({ where: { courseId } }),
    prisma.cqiRecord.findMany({ where: { courseId } }).catch(() => []),
    prisma.scheduleSection.findMany({ where: { courseId } }).catch(() => []),
    db.courseResult?.findUnique({ where: { courseId } }).catch(() => null),
  ]);
  return { version: 1, takenAt: new Date().toISOString(), course, clos, lectures, instruments, marks, paper, cqi, sections, result };
}

/** Archive every course of a term whose result is approved (others are listed back as not ready). */
export async function archiveTerm(chairmanId: string, term: string, byId: string) {
  if (!db.termArchive) throw new Error("Run prisma/migration_adeel_p4.sql in Supabase first.");
  const courses = (await prisma.course.findMany({ where: { coordinator: { managedById: chairmanId }, offeredTermYear: { not: null } }, select: { id: true, code: true, offeredTermName: true, offeredTermYear: true } })).filter((c) => termOf(c) === term);
  const approved = new Set((((await db.courseResult?.findMany({ where: { courseId: { in: courses.map((c) => c.id).concat("none") }, status: "APPROVED" }, select: { courseId: true } })) || []) as { courseId: string }[]).map((r) => r.courseId));
  let done = 0; const notReady: string[] = [];
  for (const c of courses) {
    if (!approved.has(c.id)) { notReady.push(c.code); continue; }
    const dataJson = JSON.stringify(await snapshot(c.id));
    await db.termArchive.upsert({ where: { courseId_term: { courseId: c.id, term } }, create: { id: randomUUID(), chairmanId, term, courseId: c.id, dataJson, byId }, update: {} });
    done++;
  }
  await writeAuditLog({ actorUserId: byId, action: "TERM_ARCHIVED", entityType: "Term", entityId: term, metadata: { archived: done, notReady: notReady.length } }).catch(() => null);
  return { archived: done, notReady };
}

/** The snapshot of a course for an archived term (reports read this instead of live data), or null. */
export async function archivedSnapshot(courseId: string, term: string) {
  const r = (await db.termArchive?.findUnique({ where: { courseId_term: { courseId, term } } }).catch(() => null)) as { dataJson: string } | null;
  try { return r ? JSON.parse(r.dataJson) : null; } catch { return null; }
}

/** Refuses edits to an archived course unless an amendment is open. Returns the message, or null. */
export async function archiveBlock(courseId: string): Promise<string | null> {
  if (!db.termArchive) return null;
  const c = await prisma.course.findUnique({ where: { id: courseId }, select: { offeredTermName: true, offeredTermYear: true } });
  if (!c) return null;
  const term = termOf(c);
  const a = await db.termArchive.findUnique({ where: { courseId_term: { courseId, term } }, select: { id: true } }).catch(() => null);
  if (!a) return null;
  const open = await db.archiveAmendment?.findFirst({ where: { courseId, term, status: "APPROVED", openUntil: { gte: new Date() } } }).catch(() => null);
  return open ? null : `${term} is archived. Changes need an approved amendment (Term Archive → Request an amendment).`;
}

export async function requestAmendment(user: { id: string; name: string }, courseId: string, reason: string) {
  const c = await prisma.course.findUnique({ where: { id: courseId }, select: { code: true, offeredTermName: true, offeredTermYear: true, coordinator: { select: { managedById: true } } } });
  if (!c) throw new Error("Course not found.");
  if (reason.trim().length < 10) throw new Error("Give the reason (at least 10 characters).");
  const id = randomUUID();
  await db.archiveAmendment.create({ data: { id, courseId, term: termOf(c), reason: reason.trim().slice(0, 500), requestedById: user.id } });
  const approvers = await prisma.user.findMany({ where: { isActive: true, OR: [{ role: "HEAD_OF_DEPARTMENT", managedById: c.coordinator.managedById }, { extraRoles: { has: "EXAM_CONTROLLER" }, managedById: c.coordinator.managedById }] }, select: { id: true } }).catch(() => []);
  await notifyUsers(approvers.map((a) => a.id), { kind: "AMENDMENT", title: `Amendment requested: ${c.code} (${termOf(c)})`, body: `${user.name}: ${reason}`, href: "/term-archive" }).catch(() => null);
  return id;
}
export async function decideAmendment(user: { id: string }, id: string, approve: boolean) {
  const a = (await db.archiveAmendment.findUnique({ where: { id } })) as { requestedById: string; status: string; courseId: string } | null;
  if (!a || a.status !== "PENDING") throw new Error("Not pending.");
  if (a.requestedById === user.id) throw new Error("You can't approve your own amendment.");
  await db.archiveAmendment.update({ where: { id }, data: { status: approve ? "APPROVED" : "REFUSED", approvedById: user.id, approvedAt: new Date(), openUntil: approve ? new Date(Date.now() + 48 * 3600e3) : null } });
  await writeAuditLog({ actorUserId: user.id, action: approve ? "AMENDMENT_APPROVED" : "AMENDMENT_REFUSED", entityType: "Course", entityId: a.courseId }).catch(() => null);
  await notifyUsers([a.requestedById], { kind: "AMENDMENT", title: approve ? "Amendment approved — editing open for 48 hours" : "Amendment refused", href: "/term-archive" }).catch(() => null);
}
