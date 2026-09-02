import { prisma } from "./db";

export async function requireInstructorCourse(user: { id: string; role: string } | null, courseId: string) {
  if (!user || user.role !== "INSTRUCTOR") return null;
  const course = await prisma.course.findUnique({ where: { id: courseId } });
  if (!course || course.instructorId !== user.id) return null;
  return course;
}
