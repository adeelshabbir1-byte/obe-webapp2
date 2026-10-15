import { prisma } from "./db";

// Topic links are kept on base courses. When several courses share content (a content-sync group), only the base
// course is edited; the others copy it. So a course's links are found under its base course's program and code, and a
// link on a base course applies to every course that copies it.

export type CourseKey = { coordinatorId: string; code: string };

/** Courses that are a base course, or not in a content-sync group at all (the ones whose topics are linked). */
export const BASE_COURSES = { OR: [{ contentSyncMember: null }, { contentSyncMember: { isBase: true } }] };

/** The program and code under which each course's topic links are kept (its base course's, for a course that copies one). */
export async function keysOf(courseIds: string[]): Promise<Map<string, CourseKey>> {
  const ids = Array.from(new Set(courseIds));
  const out = new Map<string, CourseKey>();
  if (!ids.length) return out;
  const [courses, members] = await Promise.all([
    prisma.course.findMany({ where: { id: { in: ids } }, select: { id: true, code: true, coordinatorId: true } }),
    prisma.courseContentSyncMember.findMany({ where: { courseId: { in: ids }, isBase: false }, select: { courseId: true, groupId: true } }),
  ]);
  const bases = members.length
    ? await prisma.courseContentSyncMember.findMany({ where: { groupId: { in: members.map((m) => m.groupId) }, isBase: true }, select: { groupId: true, course: { select: { code: true, coordinatorId: true } } } })
    : [];
  for (const c of courses) {
    const m = members.find((x) => x.courseId === c.id);
    const base = m ? bases.find((b) => b.groupId === m.groupId)?.course : null;
    out.set(c.id, base ? { coordinatorId: base.coordinatorId, code: base.code } : { coordinatorId: c.coordinatorId, code: c.code });
  }
  return out;
}

export async function keyOf(courseId: string): Promise<CourseKey | null> {
  return (await keysOf([courseId])).get(courseId) || null;
}

/** Every course a link key covers: each batch's copy of the course in the program, and the courses that copy one of them. */
export async function courseIdsForKey(key: CourseKey): Promise<string[]> {
  const own = (await prisma.course.findMany({ where: { coordinatorId: key.coordinatorId, code: key.code }, select: { id: true } })).map((c) => c.id);
  if (!own.length) return [];
  const groups = await prisma.courseContentSyncMember.findMany({ where: { courseId: { in: own }, isBase: true }, select: { groupId: true } });
  const followers = groups.length
    ? (await prisma.courseContentSyncMember.findMany({ where: { groupId: { in: groups.map((g) => g.groupId) }, isBase: false }, select: { courseId: true } })).map((m) => m.courseId)
    : [];
  return Array.from(new Set([...own, ...followers]));
}
