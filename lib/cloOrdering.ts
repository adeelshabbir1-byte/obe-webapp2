import { prisma } from "./db";

/** Re-sequences a course's CLOs (for one source, SE or INSTRUCTOR) so their
 * codes are always "CLO-1", "CLO-2"... in orderIndex order, with no gaps
 * and no manual typing ever involved. Call this after any create, delete,
 * or reorder. */
export async function renumberClos(courseId: string, source: string) {
  const clos = await prisma.cLO.findMany({ where: { courseId, source }, orderBy: { orderIndex: "asc" } });

  // Two phases to avoid tripping the @@unique([courseId, source, code])
  // constraint mid-update — e.g. swapping CLO-1 and CLO-2 would otherwise
  // briefly try to give two rows the same code.
  for (let i = 0; i < clos.length; i++) {
    await prisma.cLO.update({ where: { id: clos[i].id }, data: { code: `TEMP-${clos[i].id}` } });
  }
  for (let i = 0; i < clos.length; i++) {
    await prisma.cLO.update({ where: { id: clos[i].id }, data: { orderIndex: i, code: `CLO-${i + 1}` } });
  }
}
