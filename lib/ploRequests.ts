import { prisma } from "./db";
import { writeAuditLog } from "./audit";
import { notifyUsers, holdersOf } from "./notifications";
import { syncCoursePloMappingToLinkedCourses } from "./contentSync";

// PLO change requests: the Subject Expert (while building the course) or the Instructor (while teaching it) may ask the
// OMC to add one of the batch's PLOs to the course, or to take one off. Nothing changes until the OMC approves; then
// the PLO–Course matrix is updated exactly as if the OMC had ticked the box (and carried to linked future courses).
// Taking a PLO off also clears it from the course's CLOs that pointed to it, so they can be mapped again.

export const pdb = prisma as unknown as Record<string, any>;
export type PloRequestRow = { id: string; chairmanId: string; courseId: string; ploId: string; action: "ADD" | "REMOVE"; reason: string; requestedById: string; requestedAs: string; status: string; decidedById: string | null; decidedAt: Date | null; decisionNote: string | null; closUnmapped: number; createdAt: Date };

/** What the PLO panel on a CLO page needs: the course's PLOs, the batch's other PLOs, and this course's requests. */
export async function ploPanel(courseId: string) {
  const course = await prisma.course.findUnique({ where: { id: courseId }, select: { batchId: true } });
  const [mapped, all, clos] = await Promise.all([
    prisma.coursePloMapping.findMany({ where: { courseId }, select: { ploId: true } }),
    course?.batchId ? prisma.pLO.findMany({ where: { batchId: course.batchId }, orderBy: { number: "asc" }, select: { id: true, number: true, title: true } }) : Promise.resolve([]),
    prisma.cLO.findMany({ where: { courseId, mappedPloId: { not: null } }, select: { mappedPloId: true, code: true, source: true } }),
  ]);
  let requests: PloRequestRow[] = [], missing = false;
  try { requests = (await pdb.ploChangeRequest.findMany({ where: { courseId }, orderBy: { createdAt: "desc" }, take: 50 })) as PloRequestRow[]; } catch { missing = true; }
  const on = new Set(mapped.map((m) => m.ploId));
  const label = new Map(all.map((p) => [p.id, `PLO-${p.number}`]));
  const people = requests.length ? new Map((await prisma.user.findMany({ where: { id: { in: Array.from(new Set(requests.flatMap((r) => [r.requestedById, r.decidedById].filter((x): x is string => !!x)))) } }, select: { id: true, name: true } })).map((u) => [u.id, u.name])) : new Map<string, string>();
  return {
    missing,
    plos: all.map((p) => ({ id: p.id, number: p.number, title: p.title, onCourse: on.has(p.id), clos: clos.filter((c) => c.mappedPloId === p.id).map((c) => `${c.code}${c.source === "INSTRUCTOR" ? " (yours)" : ""}`) })),
    requests: requests.map((r) => ({ id: r.id, plo: label.get(r.ploId) || "PLO", action: r.action, reason: r.reason, status: r.status, by: people.get(r.requestedById) || "—", byId: r.requestedById, as: r.requestedAs, note: r.decisionNote, decidedBy: r.decidedById ? people.get(r.decidedById) || "" : "", createdAt: r.createdAt.toISOString(), closUnmapped: r.closUnmapped })),
  };
}

/** May this person ask for a PLO change on this course, acting in this role? */
export async function canRequest(user: { id: string; role: string }, courseId: string) {
  const c = await prisma.course.findUnique({ where: { id: courseId }, select: { subjectExpertId: true, instructorId: true, batchId: true, coordinator: { select: { managedById: true } }, contentSyncMember: { select: { isBase: true } } } });
  if (!c) return null;
  if (user.role === "SUBJECT_EXPERT" && c.subjectExpertId === user.id && (!c.contentSyncMember || c.contentSyncMember.isBase)) return c;
  if (user.role === "INSTRUCTOR" && c.instructorId === user.id) return c;
  return null;
}

/** OMC decision. On approval the matrix changes; on removal the course's CLOs that pointed to that PLO are cleared. */
export async function decide(r: PloRequestRow, approve: boolean, note: string, actor: { id: string; name: string }) {
  const [course, plo] = await Promise.all([
    prisma.course.findUnique({ where: { id: r.courseId }, select: { code: true, title: true, subjectExpertId: true, instructorId: true } }),
    prisma.pLO.findUnique({ where: { id: r.ploId }, select: { number: true } }),
  ]);
  if (!course || !plo) throw new Error("The course or GA no longer exists.");
  let unmapped = 0;
  if (approve) {
    if (r.action === "ADD") {
      await prisma.coursePloMapping.upsert({ where: { courseId_ploId: { courseId: r.courseId, ploId: r.ploId } }, create: { courseId: r.courseId, ploId: r.ploId, assignedById: actor.id, source: "MANUAL" }, update: {} });
    } else {
      await prisma.coursePloMapping.deleteMany({ where: { courseId: r.courseId, ploId: r.ploId } });
      unmapped = (await prisma.cLO.updateMany({ where: { courseId: r.courseId, mappedPloId: r.ploId }, data: { mappedPloId: null } })).count;
    }
    await syncCoursePloMappingToLinkedCourses(r.courseId, plo.number, r.action === "ADD", actor.id);
    await writeAuditLog({ actorUserId: actor.id, action: r.action === "ADD" ? "COURSE_PLO_MAPPED" : "COURSE_PLO_UNMAPPED", entityType: "Course", entityId: r.courseId, metadata: { ploId: r.ploId, requestId: r.id, requestedById: r.requestedById, closUnmapped: unmapped } });
  }
  await pdb.ploChangeRequest.update({ where: { id: r.id }, data: { status: approve ? "APPROVED" : "REJECTED", decidedById: actor.id, decidedAt: new Date(), decisionNote: note || null, closUnmapped: unmapped } });
  await writeAuditLog({ actorUserId: actor.id, action: approve ? "PLO_REQUEST_APPROVED" : "PLO_REQUEST_REJECTED", entityType: "Course", entityId: r.courseId, metadata: { requestId: r.id, action: r.action, ploNumber: plo.number } });
  const what = `${r.action === "ADD" ? "add" : "remove"} GA-${plo.number} ${r.action === "ADD" ? "to" : "from"} ${course.code}`;
  const href = r.requestedAs === "INSTRUCTOR" ? `/instructor/courses/${r.courseId}/clos` : `/subjectexpert/courses/${r.courseId}/clos`;
  const others = [course.subjectExpertId, course.instructorId].filter((x) => x && x !== r.requestedById);
  const body = `${actor.name}${note ? `: ${note}` : ""}.${unmapped ? ` ${unmapped} CLO(s) that pointed to GA-${plo.number} now need a GA again.` : ""}`;
  await notifyUsers([r.requestedById], { kind: "TEMPLATE", title: `OMC ${approve ? "approved" : "declined"} your request to ${what}`, body, href });
  if (approve) await notifyUsers(others, { kind: "TEMPLATE", title: `GA-${plo.number} was ${r.action === "ADD" ? "added to" : "removed from"} ${course.code}`, body, href: "/dashboard" });
  return unmapped;
}

export async function notifyOmc(chairmanId: string, title: string, body: string) {
  await notifyUsers(await holdersOf(chairmanId, "OMC"), { kind: "REQUEST", title, body, href: "/omc/plo-requests" });
}
