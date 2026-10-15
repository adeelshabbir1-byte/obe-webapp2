import { prisma } from "./db";
import { ensureInstructorCopy } from "./instructorCopy";
import { recomputeCourseRows } from "./lectureWeights";
import { blockedAsNonBaseCourse, syncCourseContentToLinkedCourses } from "./contentSync";
import { chairmanIdFor } from "./reportScope";

// Topic Workspace for faculty: a Subject Expert (their template's lecture plan) or an Instructor (their own delivery
// copy) opens 1 to 3 of their own courses side by side, plus up to 2 other courses of the institute for reference.
// In their own courses they reorder topics or move them between courses; from a reference course they copy topics
// in (the source is left untouched); to a course that is not theirs they can only suggest a topic (see
// lib/topicSuggestions.ts), which its teachers accept or decline.
// A lecture row travels with its topic. Inside its own course it keeps its CLO and assessment links; moved to another
// course it drops them (they belonged to the old course's CLOs and quizzes) and has to be mapped again there.
// Lectures are renumbered 1, 2, 3 ... (two per week) after every save.

type Who = { id: string; role: string; managedById: string | null };
export const WORKSPACE_ROLES = ["SUBJECT_EXPERT", "INSTRUCTOR"];
export const sourceFor = (role: string) => (role === "INSTRUCTOR" ? "INSTRUCTOR" : "SE") as "SE" | "INSTRUCTOR";

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

/** Any course of the institute, to open next to one's own for reference (search by code, title or program). */
export async function referenceCourses(user: Who, q: string) {
  const chairmanId = await chairmanIdFor(user);
  const needle = q.trim();
  const rows = await prisma.course.findMany({
    where: {
      coordinator: { managedById: chairmanId },
      ...(needle ? { OR: [{ code: { contains: needle, mode: "insensitive" } }, { title: { contains: needle, mode: "insensitive" } }, { batch: { degreeProgram: { contains: needle, mode: "insensitive" } } }] } : {}),
    },
    select: { id: true, code: true, title: true, isOffered: true, batch: { select: { degreeProgram: true, batchName: true } }, subjectExpert: { select: { name: true } }, instructor: { select: { name: true } } },
    orderBy: [{ isOffered: "desc" }, { code: "asc" }],
    take: 40,
  });
  // Courses that already have a lecture plan are the useful ones to open: they come first, with their topic count.
  const counts = await prisma.lectureRow.groupBy({ by: ["courseId"], where: { courseId: { in: rows.map((c) => c.id).concat(["none"]) }, topic: { not: "" } }, _count: { _all: true } });
  const topicsOf = (id: string) => counts.filter((x) => x.courseId === id).reduce((n, x) => n + x._count._all, 0);
  return rows
    .map((c) => ({ id: c.id, code: c.code, title: c.title, category: c.batch ? `${c.batch.degreeProgram} — ${c.batch.batchName}` : "", topicCount: topicsOf(c.id), teachers: [c.subjectExpert?.name ? `SE: ${c.subjectExpert.name}` : "", c.instructor?.name ? `Instructor: ${c.instructor.name}` : ""].filter(Boolean).join(" · ") }))
    .sort((a, b) => Number(b.topicCount > 0) - Number(a.topicCount > 0));
}

/** Topics of a course for reference: its Subject Expert's plan, or the Instructor's copy when there is no plan. */
async function referenceTopics(courseId: string) {
  let rows = await prisma.lectureRow.findMany({ where: { courseId, source: "SE" }, select: { id: true, topic: true, subtopic: true }, orderBy: { lectureNumber: "asc" } });
  if (!rows.length) rows = await prisma.lectureRow.findMany({ where: { courseId, source: "INSTRUCTOR" }, select: { id: true, topic: true, subtopic: true }, orderBy: { lectureNumber: "asc" } });
  return rows.filter((r) => r.topic.trim());
}

export async function loadWorkspace(user: Who, courseIds: string[], referenceIds: string[] = []) {
  const allowed = await workspaceCourses(user);
  if (courseIds.length < 1 || courseIds.length > 3) return { error: "choose 1 to 3 of your courses" };
  if (referenceIds.length > 2) return { error: "open at most 2 reference courses" };
  if (courseIds.length + referenceIds.length < 2) return { error: "open at least two courses (one of yours and a reference course, or two of yours)" };
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
  const chairmanId = await chairmanIdFor(user);
  const refs = referenceIds.length
    ? await prisma.course.findMany({ where: { id: { in: referenceIds.filter((id) => !courseIds.includes(id)) }, coordinator: { managedById: chairmanId } }, select: { id: true, code: true, title: true, batch: { select: { degreeProgram: true, batchName: true } } } })
    : [];
  return {
    courses: picked.map((c) => ({
      id: c!.id, code: c!.code, title: c!.title, reference: false,
      topics: rows.filter((r) => r.courseId === c!.id).map((r) => ({
        id: r.id, topic: r.topic, subtopic: r.subtopic, originCourseId: r.courseId, clo: r.clo?.code || null,
        links: r._count.instrumentLinks, pinned: r._count.attendanceRecords > 0,
      })),
    })).concat(await Promise.all(refs.map(async (c) => ({
      id: c.id, code: c.code, title: `${c.title}${c.batch ? ` (${c.batch.batchName})` : ""}`, reference: true,
      topics: (await referenceTopics(c.id)).map((r) => ({ id: r.id, topic: r.topic, subtopic: r.subtopic, originCourseId: c.id, clo: null, links: 0, pinned: false })),
    })))),
  };
}

type LayoutItem = { id: string } | { topic: string; subtopic?: string | null };
type LayoutCourse = { courseId: string; items: LayoutItem[] };

export async function saveWorkspace(user: Who, layout: LayoutCourse[]): Promise<{ error: string } | { ok: true; moved: number; copied: number }> {
  if (!Array.isArray(layout) || layout.length < 1 || layout.length > 3) return { error: "send 1 to 3 of your courses" };
  const courseIds = layout.map((l) => l.courseId);
  const allowed = await workspaceCourses(user);
  for (const id of courseIds) {
    const c = allowed.find((x) => x.id === id);
    if (!c) return { error: "one of those courses is not yours" };
    if (c.locked) return { error: `${c.code} can't be changed here: ${c.locked}` };
  }
  const source = sourceFor(user.role);
  if (source === "INSTRUCTOR") for (const id of courseIds) await ensureInstructorCopy(id);
  const existing = await prisma.lectureRow.findMany({ where: { courseId: { in: courseIds }, source }, select: { id: true, courseId: true, topic: true, _count: { select: { attendanceRecords: true } } } });
  const original = new Map(existing.map((r) => [r.id, r]));
  const sent = layout.flatMap((l) => l.items.filter((i): i is { id: string } => "id" in i && !!i.id).map((i) => i.id));
  // Every lecture row must still be there exactly once - nothing lost, nothing added twice.
  if (sent.length !== original.size || new Set(sent).size !== sent.length || sent.some((id) => !original.has(id))) {
    return { error: "The lecture plans changed since you opened the workspace. Reload it and try again." };
  }
  for (const l of layout) for (const i of l.items) {
    if (!("id" in i)) {
      if (typeof i.topic !== "string" || !i.topic.trim()) return { error: "A copied topic has no text." };
      continue;
    }
    const t = original.get(i.id)!;
    if (t._count.attendanceRecords > 0 && t.courseId !== l.courseId) return { error: `"${t.topic}" already has attendance recorded, so it can't move to another course.` };
  }
  const moved = layout.flatMap((l) => l.items.filter((i) => "id" in i && original.get(i.id)!.courseId !== l.courseId).map((i) => (i as { id: string }).id));
  const copied = layout.reduce((n, l) => n + l.items.filter((i) => !("id" in i)).length, 0);

  await prisma.$transaction(async (tx) => {
    if (moved.length) {
      await tx.lectureRowInstrument.deleteMany({ where: { lectureRowId: { in: moved } } });
      await tx.paperDistributionItem.updateMany({ where: { lectureRowId: { in: moved } }, data: { lectureRowId: null } });
    }
    // Two passes because (course, source, lecture number) must stay unique at every step.
    let k = 0;
    for (const id of sent) await tx.lectureRow.update({ where: { id }, data: { lectureNumber: -(++k) } });
    for (const l of layout) {
      for (let i = 0; i < l.items.length; i++) {
        const item = l.items[i];
        const pos = { lectureNumber: i + 1, week: Math.ceil((i + 1) / 2) };
        if ("id" in item) {
          const isMoved = original.get(item.id)!.courseId !== l.courseId;
          await tx.lectureRow.update({ where: { id: item.id }, data: { courseId: l.courseId, ...pos, ...(isMoved ? { cloId: null, weightPct: 0, actualDate: null, rescheduledNote: null } : {}) } });
        } else {
          await tx.lectureRow.create({ data: { courseId: l.courseId, source, ...pos, topic: item.topic.trim().slice(0, 300), subtopic: item.subtopic ? String(item.subtopic).slice(0, 500) : null } });
        }
      }
    }
  }, { timeout: 60000, maxWait: 15000 });

  for (const id of courseIds) {
    await recomputeCourseRows(id, source);
    if (source === "SE") await syncCourseContentToLinkedCourses(id).catch(() => {});
  }
  return { ok: true as const, moved: moved.length, copied };
}

/** Adds one topic at the end of a course's plan (used when a suggested topic is accepted). */
export async function appendTopic(courseId: string, source: "SE" | "INSTRUCTOR", topic: string, subtopic: string | null) {
  if (source === "INSTRUCTOR") await ensureInstructorCopy(courseId);
  const last = await prisma.lectureRow.findFirst({ where: { courseId, source }, orderBy: { lectureNumber: "desc" }, select: { lectureNumber: true } });
  const n = (last?.lectureNumber || 0) + 1;
  const row = await prisma.lectureRow.create({ data: { courseId, source, lectureNumber: n, week: Math.ceil(n / 2), topic: topic.slice(0, 300), subtopic: subtopic ? subtopic.slice(0, 500) : null } });
  if (source === "SE") await syncCourseContentToLinkedCourses(courseId).catch(() => {});
  return row;
}
