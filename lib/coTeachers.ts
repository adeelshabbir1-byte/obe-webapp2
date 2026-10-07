import { prisma } from "./db";
import { chairmanIdFor } from "./reportScope";

export type PeerEntry = {
  courseId: string; teacher: string; sectionTeachers: string[]; batch: string; semester: number | null; mine: boolean;
};
export type PeerGroup = { code: string; title: string; entries: PeerEntry[] };

// Teachers who teach the same course (same course code in the same institute, this term) - on other batches,
// or splitting the sections of one course - may read each other's teaching plans.
// Only the plan is shared (CLOs, lecture plan, assessments); never students, marks or attendance.
export async function peerGroupsFor(user: { id: string; role: string; managedById: string | null }): Promise<PeerGroup[]> {
  const [direct, sections] = await Promise.all([
    prisma.course.findMany({ where: { instructorId: user.id, isOffered: true }, select: { id: true, code: true } }),
    prisma.courseSectionAssignment.findMany({ where: { instructorId: user.id, course: { isOffered: true } }, select: { course: { select: { id: true, code: true } } } }),
  ]);
  const mine = new Map<string, string>();
  for (const c of direct) mine.set(c.id, c.code);
  for (const s of sections) mine.set(s.course.id, s.course.code);
  const codes = Array.from(new Set(Array.from(mine.values()).map((c) => c.trim().toLowerCase())));
  if (codes.length === 0) return [];
  const chairmanId = await chairmanIdFor(user);
  if (!chairmanId) return [];

  const rows = await prisma.course.findMany({
    where: { isOffered: true, coordinator: { managedById: chairmanId }, OR: codes.map((c) => ({ code: { equals: c, mode: "insensitive" as const } })) },
    select: {
      id: true, code: true, title: true, semesterNumber: true,
      instructor: { select: { id: true, name: true } },
      batch: { select: { degreeProgram: true, batchName: true } },
      sectionAssignments: { select: { instructor: { select: { id: true, name: true } } } },
    },
    orderBy: [{ code: "asc" }],
  });

  const groups: Map<string, PeerGroup> = new Map();
  for (const r of rows) {
    const teachers = new Map<string, string>();
    if (r.instructor) teachers.set(r.instructor.id, r.instructor.name);
    for (const a of r.sectionAssignments) teachers.set(a.instructor.id, a.instructor.name);
    const iAmHere = teachers.has(user.id);
    const others = Array.from(teachers.entries()).filter(([id]) => id !== user.id).map(([, n]) => n);
    if (!iAmHere && others.length === 0) continue; // nobody teaching it yet
    if (iAmHere && others.length === 0) continue; // only me - nothing to look at
    const key = r.code.trim().toLowerCase();
    const g: PeerGroup = groups.get(key) || { code: r.code, title: r.title, entries: [] };
    g.entries.push({
      courseId: r.id, teacher: (r.instructor?.name || others[0]) as string, sectionTeachers: others,
      batch: r.batch ? `${r.batch.degreeProgram} — ${r.batch.batchName}` : "—", semester: r.semesterNumber, mine: iAmHere,
    });
    groups.set(key, g);
  }
  return Array.from(groups.values()).sort((a, b) => a.code.localeCompare(b.code));
}
