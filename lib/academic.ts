import { prisma } from "./db";

export const CAL_KINDS: Record<string, string> = {
  ADMISSION: "Admissions", REGISTRATION: "Registration", SEMESTER_START: "Semester starts", MIDTERM: "Midterm exams", FINAL: "Final exams",
  SEMESTER_END: "Semester ends", HOLIDAY: "Holiday", BREAK: "Break / vacation", OTHER: "Other",
};
export const CAL_COLOUR: Record<string, string> = {
  ADMISSION: "#6A4C93", REGISTRATION: "#1B6CA8", SEMESTER_START: "#2E7D4F", MIDTERM: "#B7791F", FINAL: "#B3261E",
  SEMESTER_END: "#2E7D4F", HOLIDAY: "#7A7F85", BREAK: "#7A7F85", OTHER: "#4B5563",
};
export const SETTER_ROLES = ["CHAIRMAN", "DEAN"];
export const VIEWER_ROLES = ["CHAIRMAN", "STUDENT_AFFAIRS", "DEAN", "HEAD_OF_DEPARTMENT", "DEPARTMENT_COORDINATOR", "PROGRAM_COORDINATOR"];
export const INSTITUTE_KEY = "INSTITUTE";

type U = { id: string; role: string; managedById: string | null; facultyId?: string | null; departmentId?: string | null };

/** Who the person works for, and which faculty they belong to. */
export async function academicScope(user: U) {
  const chairmanId = user.role === "CHAIRMAN" ? user.id : user.managedById || "none";
  let facultyId: string | null = user.role === "DEAN" ? user.facultyId || null : null;
  if (user.role !== "CHAIRMAN" && user.role !== "DEAN" && user.departmentId) {
    facultyId = (await prisma.department.findUnique({ where: { id: user.departmentId }, select: { facultyId: true } }))?.facultyId || null;
  }
  return { chairmanId, facultyId, isChairman: user.role === "CHAIRMAN", isDean: user.role === "DEAN", isStudentAffairs: user.role === "STUDENT_AFFAIRS" };
}

/** Degree programs that belong to a faculty (or to the institute when it has no faculties). */
export async function programsOf(chairmanId: string, facultyId: string | null) {
  const deps = await prisma.department.findMany({ where: { chairmanId, facultyId }, select: { id: true } });
  const ids = deps.map((d) => d.id);
  if (!ids.length) return [] as string[];
  const [progs, leads] = await Promise.all([
    prisma.departmentProgram.findMany({ where: { departmentId: { in: ids } }, select: { degreeProgram: true } }),
    prisma.user.findMany({ where: { role: "PROGRAM_COORDINATOR", departmentId: { in: ids }, leadProgram: { not: null } }, select: { leadProgram: true } }),
  ]);
  return Array.from(new Set([...progs.map((p) => p.degreeProgram), ...leads.map((l) => l.leadProgram as string)])).sort();
}
