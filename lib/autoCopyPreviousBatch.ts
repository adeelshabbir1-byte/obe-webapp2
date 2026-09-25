import { prisma } from "./db";
import { copyCourseContent } from "./benchmarkCopy";
import { linkAsFollowerOfSource } from "./contentSync";
import { termIndex } from "./termLogic";
import { electiveTitleFor } from "./electiveNaming";

/** When a new batch is created, automatically copies courses (with their
 * CLOs/lecture plan) and PLOs from the most recent EARLIER batch of the
 * same degree program under the same coordinator — so a Coordinator never
 * has to manually re-import data for every new intake of an existing
 * program. Silently does nothing if no earlier batch exists (e.g. the
 * very first batch of a brand new program) — that's a normal case, not
 * an error. */
export async function autoCopyFromPreviousBatch(newBatch: { id: string; coordinatorId: string; degreeProgram: string; startTerm: string; startYear: number }) {
  const candidates = await prisma.batch.findMany({
    where: { coordinatorId: newBatch.coordinatorId, degreeProgram: newBatch.degreeProgram, id: { not: newBatch.id } },
  });

  const newIndex = termIndex(newBatch.startTerm, newBatch.startYear);
  let previous: (typeof candidates)[number] | null = null;
  let previousIndex = -Infinity;
  for (const c of candidates) {
    const idx = termIndex(c.startTerm, c.startYear);
    if (idx < newIndex && idx > previousIndex) { previous = c; previousIndex = idx; }
  }
  if (!previous) return { copiedFrom: null, coursesCopied: 0, plosCopied: 0 };

  // The chairman this batch's coordinator reports to — needed to scope
  // the content-sync link each copied course gets below.
  const coordinator = await prisma.user.findUnique({ where: { id: newBatch.coordinatorId } });
  const chairmanId = coordinator?.managedById || null;

  // Courses — skip anything the new batch somehow already has (e.g. this
  // ran twice), same as the manual "Copy From Another Batch" behavior.
  const [sourceCourses, existingInTarget] = await Promise.all([
    prisma.course.findMany({ where: { batchId: previous.id } }),
    prisma.course.findMany({ where: { batchId: newBatch.id }, select: { code: true } }),
  ]);
  const existingCodes = new Set(existingInTarget.map((c) => c.code));
  // Numbering continues from however many Elective-type courses the new
  // batch already has (normally zero, since it's brand new, but this
  // stays correct even if the function is ever re-run).
  let electiveCounter = existingInTarget.length > 0 ? (await prisma.course.count({ where: { batchId: newBatch.id, courseType: "Elective" } })) : 0;

  let coursesCopied = 0;
  for (const sc of sourceCourses) {
    if (existingCodes.has(sc.code)) continue;
    try {
      // Every Elective-type course gets a uniform "<Degree> Elective <N>"
      // title in the new batch — the same rule import-hec applies.
      const title = sc.courseType === "Elective" ? electiveTitleFor(newBatch.degreeProgram, ++electiveCounter) : sc.title;

      const newCourse = await prisma.course.create({
        data: {
          code: sc.code, title, creditHours: sc.creditHours, courseType: sc.courseType, semesterNumber: sc.semesterNumber,
          coordinatorId: newBatch.coordinatorId, batchId: newBatch.id, masterCourseId: sc.masterCourseId,
        },
      });
      await copyCourseContent(sc.id, newCourse.id);
      // The new batch's course is a copy of the previous batch's — link
      // them for content sync automatically, so future Subject Expert
      // updates on the (more senior) source keep propagating forward,
      // rather than this being a one-time snapshot that immediately
      // drifts out of sync.
      if (chairmanId) await linkAsFollowerOfSource(sc.id, newCourse.id, chairmanId);
      coursesCopied++;
    } catch {
      // Best-effort — one failed course shouldn't stop the rest from copying.
    }
  }

  // PLOs
  const [sourcePlos, existingPlos] = await Promise.all([
    prisma.pLO.findMany({ where: { batchId: previous.id } }),
    prisma.pLO.findMany({ where: { batchId: newBatch.id }, select: { number: true } }),
  ]);
  const existingNumbers = new Set(existingPlos.map((p) => p.number));

  let plosCopied = 0;
  for (const sp of sourcePlos) {
    if (existingNumbers.has(sp.number)) continue;
    try {
      await prisma.pLO.create({
        data: { coordinatorId: newBatch.coordinatorId, batchId: newBatch.id, number: sp.number, title: sp.title, description: sp.description },
      });
      plosCopied++;
    } catch {
      // Best-effort here too.
    }
  }

  return { copiedFrom: previous.batchName, coursesCopied, plosCopied };
}
