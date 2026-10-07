import { prisma } from "./db";

export async function labWorkspaceData(lab: { id: string; batchId: string }, theory: { id: string; code: string } | null, as: "ENGINEER" | "LEAD", userId: string) {
  const [manualsRaw, enrollments, marks, instruments] = await Promise.all([
    prisma.labManual.findMany({ where: { courseId: lab.id }, orderBy: { labNumber: "asc" }, include: { versions: { orderBy: { version: "desc" } } } }),
    prisma.studentEnrollment.findMany({ where: { courseId: lab.id, status: "ACTIVE" }, include: { student: true } }),
    prisma.labMark.findMany({ where: { courseId: lab.id } }),
    as === "LEAD" && theory ? prisma.assessmentInstrument.findMany({ where: { courseId: theory.id, type: "Lab", source: "INSTRUCTOR" }, orderBy: { createdAt: "asc" } }) : Promise.resolve([] as any[]),
  ]);
  const uploaderIds = Array.from(new Set<string>(manualsRaw.flatMap((m: any) => m.versions.map((v: any) => v.uploadedById))));
  const users = await prisma.user.findMany({ where: { id: { in: uploaderIds } }, select: { id: true, name: true } });
  const nameOf = new Map<string, string>(users.map((u: any) => [u.id, u.name]));
  return {
    manuals: manualsRaw.map((m: any) => ({
      labNumber: m.labNumber, title: m.title,
      versions: m.versions.map((v: any) => ({ version: v.version, fileName: v.fileName, fileUrl: v.fileUrl, note: v.note, by: nameOf.get(v.uploadedById) || "—", at: new Date(v.createdAt).toISOString().slice(0, 10) })),
    })),
    students: enrollments.map((e: any) => ({ id: e.student.id, name: e.student.name, rollNumber: e.student.rollNumber })).sort((a: any, b: any) => a.rollNumber.localeCompare(b.rollNumber)),
    marks: marks.map((m: any) => ({ studentId: m.studentId, labNumber: m.labNumber, score: m.score, maxScore: m.maxScore })),
    instruments: instruments.map((i: any) => ({ id: i.id, name: i.label, maxScore: i.maxScore })),
  };
}
