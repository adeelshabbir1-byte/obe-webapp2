import { prisma } from "./db";
import { ensureInstructorCopy } from "./instructorCopy";
import { recomputeCourseRows } from "./lectureWeights";
import { blockedAsNonBaseCourse, syncCourseContentToLinkedCourses } from "./contentSync";

// Topic Workspace for faculty: a Subject Expert (their template's lecture plan) or an Instructor (their own delivery
// copy) opens 2 or 3 of their own courses side by side and moves topics between them or reorders them.
// A lecture row travels with its topic. Inside its own course it keeps its CLO and assessment links; moved to another
// course it drops them (they belonged to the old course's CLOs and quizzes) and has to be mapped again there.
// Lectures are renumbered 1, 2, 3 ... (two per week) after every save.

type Who = { id: string; role: string };
export const WORKSPACE_ROLES = ["SUBJECT_EXPERT", "INSTRUCTOR"];
const sourceFor = (role: string) => (role === "INSTRUCTOR" ? "INSTRUCTOR" : "SE") as "SE" | "INSTRUCTOR";

/** The courses this person may use in the workspace, with a reason when one is read-only. */
export async function workspaceCourses(user: Who) {
  if (!WORKSPACE_ROLES.includes(user.role)) return [];
  const source = sourceFor(user.role);
  const courses = await prisma.course.findMany({
    where: source === "SE" ? { subjectExpertId: user.id } : { instructorId: user.id },
    select: { id: true, code: true, title: true, templateStatus: true, batch: { select: { degreeProgram: true, batchName: true } } },
    orderBy: { code: "asc" },
  });
  const counts = await prisma.lectureRow.groupBy({ by: ["courseId"], where: { courseId: { in: courses.map((c) => c.id) }, source, topic: { not: "" } }, _count: { _all: true } });
  const out = [];
  for (const c of courses) {
    let locked = "";
    if (source === "SE") {
      if (c.templateStatus === "approved") locked = "approved by the OMC (locked)";
      else if (await blockedAsNonBaseCourse(c.id)) locked = "follows a base course";
    }
    out.push({ id: c.id, code: c.code, title: c.title, category: c.batch ? `${c.batch.degreeProgram} — ${c.batch.batchName}` : "", topicCount: counts.find((x) => x.courseId === c.id)?._count._all || 0, locked });
  }
  return out;
}

export async function loadWorkspace(user: Who, courseIds: string[]) {
  const allowed = await workspaceCourses(user);
  if (courseIds.length < 2 || courseIds.length > 3) return { error: "choose 2 or 3 courses" };
  const picked = courseIds.map((id) => allowed.find((c) => c.id === id));
  if (picked.some((c) => !c)) return { error: "one of those courses is not yours" };
  const lockedOne = picked.find((c) => c!.locked);
  if (lockedOne) return { error: `${lockedOne.code} can't be changed here: ${lockedOne.locked}` };
  const source = sourceFor(user.role);
  if (source === "INSTRUCTOR") for (const id of courseIds) await ensureInstructorCopy(id);
  const rows = await prisma.lectureRow.findMany({
    where: { courseId: { in: courseIds }, source },
    select: { id: true, courseId: true, lectureNumber: true, topic: true, subtopic: true, clo: { select: { code: true } }, _count: { select: { attendanceRecords: true, instrumentLinks: true } } },
    orderBy: { lectureNumber: "asc" },
  });
  return {
    courses: picked.map((c) => ({
      id: c!.id, code: c!.code, title: c!.title,
      topics: rows.filter((r) => r.courseId === c!.id).map((r) => ({
        id: r.id, topic: r.topic, subtopic: r.subtopic, originCourseId: r.courseId, clo: r.clo?.code || null,
        links: r._count.instrumentLinks, pinned: r._count.attendanceRecords > 0,
      })),
    })),
  };
}

export async function saveWorkspace(user: Who, layout: { courseId: string; rowIds: string[] }[]): Promise<{ error: string } | { ok: true; moved: number }> {
  if (!Array.isArray(layout) || layout.length < 2 || layout.length > 3) return { error: "send 2 or 3 courses" };
  const courseIds = layout.map((l) => l.courseId);
  const loaded = await loadWorkspace(user, courseIds);
  if (!("courses" in loaded) || !loaded.courses) return { error: String((loaded as { error?: string }).error || "could not open those courses") };
  const source = sourceFor(user.role);
  const original = new Map(loaded.courses.flatMap((c) => c.topics.map((t) => [t.id, t] as const)));
  const sent = layout.flatMap((l) => l.rowIds);
  // Every lecture row must still be there exactly once - nothing lost, nothing added.
  if (sent.length !== original.size || new Set(sent).size !== sent.length || sent.some((id) => !original.has(id))) {
    return { error: "The lecture plans changed since you opened the workspace. Reload it and try again." };
  }
  for (const l of layout) for (const id of l.rowIds) {
    const t = original.get(id)!;
    if (t.pinned && t.originCourseId !== l.courseId) return { error: `"${t.topic}" already has attendance recorded, so it can't move to another course.` };
  }
  const moved = layout.flatMap((l) => l.rowIds.filter((id) => original.get(id)!.originCourseId !== l.courseId));

  await prisma.$transaction(async (tx) => {
    if (moved.length) {
      await tx.lectureRowInstrument.deleteMany({ where: { lectureRowId: { in: moved } } });
      await tx.paperDistributionItem.updateMany({ where: { lectureRowId: { in: moved } }, data: { lectureRowId: null } });
    }
    // Two passes because (course, source, lecture number) must stay unique at every step.
    let k = 0;
    for (const id of sent) await tx.lectureRow.update({ where: { id }, data: { lectureNumber: -(++k) } });
    for (const l of layout) {
      for (let i = 0; i < l.rowIds.length; i++) {
        const id = l.rowIds[i];
        const isMoved = original.get(id)!.originCourseId !== l.courseId;
        await tx.lectureRow.update({
          where: { id },
          data: { courseId: l.courseId, lectureNumber: i + 1, week: Math.ceil((i + 1) / 2), ...(isMoved ? { cloId: null, weightPct: 0, actualDate: null, rescheduledNote: null } : {}) },
        });
      }
    }
  }, { timeout: 60000, maxWait: 15000 });

  for (const id of courseIds) {
    await recomputeCourseRows(id, source);
    if (source === "SE") await syncCourseContentToLinkedCourses(id).catch(() => {});
  }
  return { ok: true as const, moved: moved.length };
}
