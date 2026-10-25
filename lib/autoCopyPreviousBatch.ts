import { prisma } from "./db";
import { copyCourseContent } from "./benchmarkCopy";
import { linkAsFollowerOfSource } from "./contentSync";
import { termIndex } from "./termLogic";

/** When a new batch is created, automatically copies courses (with their
 * CLOs/lecture plan) and PLOs from the most recent EARLIER batch of the
 * same degree program under the same coordinator — so a Coordinator never
 * has to manually re-import data for every new intake of an existing
 * program. Silently does nothing if no earlier batch exists (e.g. the
 * very first batch of a brand new program) — that's a normal case, not
 * an error. */
export async function autoCopyFromPreviousBatch(newBatch: { id: string; coordinatorId: string; degreeProgram: string; startTerm: string; startYear: number }, opts: { courses?: boolean } = {}) {
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

  let coursesCopied = 0;
  // Elective / IDS list courses (a pool, not studied by the batch) are not carried forward unless they fill a slot.
  const listCourse = new Set([...(await listCourseIds(sourceCourses)), ...(await (await import("./listCourses")).batchListCourses(previous.id).catch(() => ({ list: new Map() }))).list.keys()]);
  if (opts.courses === false) sourceCourses.length = 0;
  for (const sc of sourceCourses) {
    if (existingCodes.has(sc.code) || listCourse.has(sc.id)) continue;
    try {
      // Elective-type courses carry forward exactly as the previous batch
      // had them — same code, same title, same masterCourseId (whatever
      // specific course the previous batch had already picked for that
      // slot, if any) — same as every other course type. The new batch
      // starts with that as a sensible default rather than a blank slot,
      // and can still change it: the "choose a course for this slot"
      // popup on Prerequisite Map / Course Repositioning stays clickable
      // even on an already-filled elective (see InteractiveCourseMap),
      // so re-picking a different course for the new batch is always one
      // click away — it just isn't forced to start over from scratch.
      const newCourse = await prisma.course.create({
        data: {
          code: sc.code, title: sc.title, creditHours: sc.creditHours, courseType: sc.courseType, semesterNumber: sc.semesterNumber,
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

/** Courses of a batch that came from an Elective / IDS list (batch type "Domain Elective" / "Domain IDS") — a pool to choose
 *  from, not studied as such. A filled elective slot keeps its slot type ("Elective" / "IDS") and is not one of these. */
export const LIST_TYPES = ["Domain Elective", "Domain IDS"];
export async function listCourseIds(courses: { id: string; courseType: string | null }[]) {
  return new Set(courses.filter((c) => LIST_TYPES.includes(c.courseType || "")).map((c) => c.id));
}
