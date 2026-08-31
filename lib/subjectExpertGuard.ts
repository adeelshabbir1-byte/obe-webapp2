import { prisma } from "./db";

// Verifies the given user is a SUBJECT_EXPERT and owns the given course.
// Returns the course if valid, or null if not — callers should return a
// 403/404 when this comes back null, never reveal whether the course exists
// to someone who doesn't own it.
export async function requireOwnedCourse(user: { id: string; role: string } | null, courseId: string) {
  if (!user || user.role !== "SUBJECT_EXPERT") return null;
  const course = await prisma.course.findUnique({ where: { id: courseId } });
  if (!course || course.subjectExpertId !== user.id) return null;
  return course;
}
