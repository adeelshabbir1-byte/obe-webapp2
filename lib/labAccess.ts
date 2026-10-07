import { prisma } from "./db";
import { chairmanIdFor } from "./reportScope";

// A Lab course is a separate course (type "Lab", code "<THEORY CODE>-L"). Its Lab Engineer sets the manuals and enters the marks.
// The lab's lead is the lab course's own instructor and, until one is named, the instructor of the theory course.
export async function loadLabCourse(courseId: string) {
  const lab = await prisma.course.findUnique({
    where: { id: courseId },
    include: { batch: { select: { degreeProgram: true, batchName: true } }, labEngineer: { select: { id: true, name: true } }, instructor: { select: { id: true, name: true } } },
  });
  if (!lab || lab.courseType !== "Lab") return null;
  const theoryCode = lab.code.replace(/-L$/i, "");
  const theory = theoryCode !== lab.code
    ? await prisma.course.findFirst({ where: { coordinatorId: lab.coordinatorId, batchId: lab.batchId, code: theoryCode }, include: { instructor: { select: { id: true, name: true } } } })
    : null;
  const lead = lab.instructor || theory?.instructor || null;
  return { lab, theory, lead };
}

export type LabRole = "ENGINEER" | "LEAD";

/** What this person may do with this lab: the Lab Engineer, or the lab lead. Anyone else gets null. */
export async function labAccessFor(user: { id: string; role: string; managedById: string | null }, courseId: string) {
  const loaded = await loadLabCourse(courseId);
  if (!loaded) return null;
  if (user.role === "LAB_ENGINEER" && loaded.lab.labEngineerId === user.id) return { ...loaded, as: "ENGINEER" as LabRole };
  if (user.role === "INSTRUCTOR" && loaded.lead?.id === user.id) return { ...loaded, as: "LEAD" as LabRole };
  return null;
}

/** Lab courses this person works with. */
export async function labCoursesFor(user: { id: string; role: string }) {
  if (user.role === "LAB_ENGINEER") {
    return prisma.course.findMany({
      where: { courseType: "Lab", isOffered: true, labEngineerId: user.id },
      include: { batch: { select: { degreeProgram: true, batchName: true } } }, orderBy: [{ code: "asc" }],
    });
  }
  // Instructor: labs that name them, plus labs of theory courses they teach that have no instructor of their own.
  const mine = await prisma.course.findMany({ where: { instructorId: user.id, isOffered: true }, select: { code: true, coordinatorId: true, batchId: true } });
  const viaTheory = mine.filter((c) => !/-L$/i.test(c.code)).map((c) => ({ coordinatorId: c.coordinatorId, batchId: c.batchId, code: `${c.code}-L` }));
  return prisma.course.findMany({
    where: { courseType: "Lab", isOffered: true, OR: [{ instructorId: user.id }, ...viaTheory.map((v) => ({ ...v, instructorId: null }))] },
    include: { batch: { select: { degreeProgram: true, batchName: true } } }, orderBy: [{ code: "asc" }],
  });
}

export const LAB_FILE_OK = (name: string) => /\.(docx?|DOCX?)$/.test(name);
export async function labInstituteId(user: { id: string; role: string; managedById: string | null }) { return chairmanIdFor(user); }
