import { prisma } from "./db";
import { diffLists, changes, type Diff } from "./curriculumDiffCore";

// Per course of a batch: its CLOs and lecture topics (the Subject Expert's plan) against the master course it came from,
// and who last changed the course plan and when (from the audit log).
export async function batchDiff(batchId: string) {
  const cs = await prisma.course.findMany({ where: { batchId, masterCourseId: { not: null } }, orderBy: [{ semesterNumber: "asc" }, { code: "asc" }], select: { id: true, code: true, title: true, masterCourseId: true, clos: { where: { source: "SE" }, orderBy: { orderIndex: "asc" }, select: { statement: true } }, lectureRows: { where: { source: "SE" }, orderBy: { lectureNumber: "asc" }, select: { topic: true } } } });
  const masters = await prisma.masterCourse.findMany({ where: { id: { in: cs.map((c) => c.masterCourseId!).concat("none") } }, select: { id: true, code: true, seedClos: { orderBy: { orderIndex: "asc" }, select: { statement: true } }, seedTopics: { orderBy: { lectureNumber: "asc" }, select: { topic: true } } } });
  const logs = await prisma.auditLog.findMany({ where: { entityId: { in: cs.map((c) => c.id).concat("none") }, action: { in: ["CLO_UPDATED", "CLO_ADDED", "LECTURE_ROW_UPDATED", "LECTURE_ROW_ADDED", "COURSE_CONTENT_IMPORTED", "MASTER_CURRICULUM_PUSHED_TO_COURSES"] } }, orderBy: { createdAt: "desc" }, take: 2000, select: { entityId: true, createdAt: true, actorUserId: true, action: true } }).catch(() => []);
  const who = new Map((await prisma.user.findMany({ where: { id: { in: Array.from(new Set(logs.map((l) => l.actorUserId).filter((x): x is string => !!x))).concat("none") } }, select: { id: true, name: true } })).map((u) => [u.id, u.name]));
  return cs.map((c) => {
    const m = masters.find((x) => x.id === c.masterCourseId);
    const clo: Diff = diffLists((m?.seedClos || []).map((x) => x.statement), c.clos.map((x) => x.statement));
    const topics: Diff = diffLists((m?.seedTopics || []).map((x) => x.topic), c.lectureRows.map((x) => x.topic).filter((t) => !/^(midterm|final) exam/i.test(t)));
    const last = logs.find((l) => l.entityId === c.id);
    return { courseId: c.id, code: c.code, title: c.title, masterCode: m?.code || "", clo, topics, total: changes(clo) + changes(topics), lastBy: last?.actorUserId ? who.get(last.actorUserId) || "" : "", lastAt: last?.createdAt || null };
  });
}
