import { prisma } from "./db";
import { labAccessFor } from "./labAccess";

const gdb = prisma as unknown as Record<string, any>;
export type Group = { id: string; name: string; title: string | null; studentIds: string[] };

/** The course's instructor (or a lab's engineer / lead) manages its groups and evaluations. */
export async function canEvaluate(user: { id: string; role: string; managedById: string | null }, courseId: string) {
  const c = await prisma.course.findUnique({ where: { id: courseId }, select: { instructorId: true, courseType: true } });
  if (!c) return false;
  if (c.courseType === "Lab" && (await labAccessFor(user, courseId))) return true;
  if (c.instructorId === user.id) return true;
  return (await prisma.courseSectionAssignment.count({ where: { courseId, instructorId: user.id } })) > 0;
}

export async function groupsOf(courseId: string): Promise<Group[] | null> {
  try {
    const groups = (await gdb.workGroup.findMany({ where: { courseId }, orderBy: { name: "asc" } })) as { id: string; name: string; title: string | null }[];
    const members = (await gdb.workGroupMember.findMany({ where: { groupId: { in: groups.map((g) => g.id) } } })) as { groupId: string; studentId: string }[];
    return groups.map((g) => ({ ...g, studentIds: members.filter((m) => m.groupId === g.id).map((m) => m.studentId) }));
  } catch { return null; } // tables not created yet
}

/** Replace the course's groups. A student can be in one group only (the first one listing them wins). */
export async function saveGroups(courseId: string, userId: string, groups: { name: string; title?: string | null; studentIds: string[] }[]) {
  const enrolled = new Set((await prisma.studentEnrollment.findMany({ where: { courseId, status: { not: "WITHDRAWN" } }, select: { studentId: true } })).map((e) => e.studentId));
  const old = (await gdb.workGroup.findMany({ where: { courseId }, select: { id: true } })) as { id: string }[];
  await gdb.workGroupMember.deleteMany({ where: { groupId: { in: old.map((g) => g.id) } } });
  await gdb.workGroup.deleteMany({ where: { courseId } });
  const used = new Set<string>();
  for (const [i, g] of groups.entries()) {
    const ids = g.studentIds.filter((s) => enrolled.has(s) && !used.has(s));
    if (!ids.length) continue;
    ids.forEach((s) => used.add(s));
    const row = await gdb.workGroup.create({ data: { courseId, name: (g.name || `Group ${i + 1}`).slice(0, 60), title: g.title ? String(g.title).slice(0, 160) : null, createdById: userId } });
    await gdb.workGroupMember.createMany({ data: ids.map((studentId) => ({ groupId: row.id, studentId })) });
  }
}

/** Groups of about `size`, in roll-number order. */
export async function autoGroups(courseId: string, size: number) {
  const st = await prisma.studentEnrollment.findMany({ where: { courseId, status: { not: "WITHDRAWN" } }, select: { student: { select: { id: true, rollNumber: true } } } });
  const ids = st.map((s) => s.student).sort((a, b) => a.rollNumber.localeCompare(b.rollNumber)).map((s) => s.id);
  const n = Math.max(1, Math.round(ids.length / Math.max(2, size)));
  return Array.from({ length: n }, (_, i) => ({ name: `Group ${i + 1}`, studentIds: ids.filter((_, k) => k % n === i) }));
}
