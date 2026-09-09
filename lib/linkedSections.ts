import { prisma } from "./db";

/** Finds every OTHER offered course this semester that shares the same code
 * and is taught by the same instructor — i.e. another section of the same
 * course. Detected automatically, independent of Course Equivalence. */
export async function getLinkedSections(instructorId: string, currentCourseId: string) {
  const current = await prisma.course.findUnique({ where: { id: currentCourseId } });
  if (!current) return [];

  return prisma.course.findMany({
    where: { instructorId, code: current.code, isOffered: true, id: { not: currentCourseId } },
    include: { batch: true },
    orderBy: { id: "asc" },
  });
}
