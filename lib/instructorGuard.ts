import { prisma } from "./db";
import { blockedForCurriculum } from "./training";

export async function requireInstructorCourse(user: { id: string; role: string; managedById?: string | null } | null, courseId: string) {
  if (!user || user.role !== "INSTRUCTOR") return null;
  if (await blockedForCurriculum(user)) return null; // OBE certification required (Institute Head's training rule)
  const course = await prisma.course.findUnique({ where: { id: courseId } });
  if (!course || course.instructorId !== user.id) return null;
  return course;
}
