import { prisma } from "./db";

// Which master curricula an institute (Institute Head) may see:
//   * its own copies (chairmanId = that chairman) - always, and
//   * official shared curricula (chairmanId = null) the Super User has assigned to it.
// Nothing else - other institutes' copies and unassigned official curricula stay hidden.
export function curriculaVisibleTo(chairmanId: string) {
  return { OR: [{ chairmanId }, { chairmanId: null, assignments: { some: { chairmanId } } }] };
}

export async function officialCurriculumIsAssigned(curriculumId: string, chairmanId: string | null): Promise<boolean> {
  if (!chairmanId) return false;
  const row = await prisma.curriculumAssignment.findUnique({ where: { curriculumId_chairmanId: { curriculumId, chairmanId } } });
  return !!row;
}

export { degreeSortKey } from "./degreeGroup";
