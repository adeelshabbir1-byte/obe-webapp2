import { prisma } from "./db";
import { termIndex } from "./termLogic";

// Which term a course offering is (or was) taught in, and whether that term is already over.
// Order: Fall Y -> Spring Y+1 -> Fall Y+1 ... (see termLogic.termIndex).

type CourseTermInput = {
  semesterNumber: number | null; offeredTermName?: string | null; offeredTermYear?: number | null;
  batch?: { startTerm: string; startYear: number } | null;
};

/** The term index the course is taught in: the stamped offering term if any, else its batch's start term + semester. */
export function courseTermIndex(c: CourseTermInput): number | null {
  if (c.offeredTermName && c.offeredTermYear) return termIndex(c.offeredTermName, c.offeredTermYear);
  if (c.batch && c.semesterNumber && c.semesterNumber > 0) return termIndex(c.batch.startTerm, c.batch.startYear) + c.semesterNumber - 1;
  return null;
}

export function termLabel(index: number): string {
  return index % 2 === 0 ? `Fall ${index / 2}` : `Spring ${(index + 1) / 2}`;
}

const currentCache = new Map<string, number | null>();
/** The program's current term index (the Coordinator's "current term" setting), or null when it was never set. */
export async function currentTermIndexFor(coordinatorId: string): Promise<number | null> {
  if (currentCache.has(coordinatorId)) return currentCache.get(coordinatorId)!;
  const t = await prisma.currentTerm.findUnique({ where: { coordinatorId }, select: { termName: true, year: true } });
  const v = t ? termIndex(t.termName, t.year) : null;
  currentCache.set(coordinatorId, v);
  setTimeout(() => currentCache.delete(coordinatorId), 5000);
  return v;
}

/** true when the course's term ended before the program's current term (it can no longer be given to anyone). */
export function isPastTerm(c: CourseTermInput, currentIndex: number | null) {
  const i = courseTermIndex(c);
  return i !== null && currentIndex !== null && i < currentIndex;
}

/** An error message when a course belongs to a term that is already over, else null. */
export async function pastTermError(courseId: string, who: "Subject Expert" | "Instructor"): Promise<string | null> {
  const c = await prisma.course.findUnique({
    where: { id: courseId },
    select: { coordinatorId: true, code: true, semesterNumber: true, offeredTermName: true, offeredTermYear: true, batch: { select: { startTerm: true, startYear: true } } },
  });
  if (!c) return null;
  const cur = await currentTermIndexFor(c.coordinatorId);
  const i = courseTermIndex(c);
  if (i === null || cur === null || i >= cur) return null;
  return `${c.code} was taught in ${termLabel(i)}, which is already over (current term: ${termLabel(cur)}). Only current and future courses can be given a ${who}.`;
}
