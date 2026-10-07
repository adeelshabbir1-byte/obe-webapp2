import { prisma } from "./db";

// What approval state a course's teacher assignment should get when it changes.
// No teacher, or the "Visiting Faculty (to be decided)" stand-in -> nothing to approve.
// A department with no Chairman yet -> approved automatically (nobody to ask).
// Otherwise the head has to approve it.
export async function approvalFieldsFor(courseId: string, instructorId: string | null) {
  const cleared = { instructorApprovalNote: null, instructorApprovedById: null, instructorApprovedAt: null };
  if (!instructorId) return { instructorApproval: "NONE", ...cleared };
  const [instructor, course] = await Promise.all([
    prisma.user.findUnique({ where: { id: instructorId }, select: { isVisitingPlaceholder: true } }),
    prisma.course.findUnique({ where: { id: courseId }, select: { coordinator: { select: { departmentId: true } } } }),
  ]);
  if (instructor?.isVisitingPlaceholder) return { instructorApproval: "NONE", ...cleared };
  const departmentId = course?.coordinator.departmentId;
  const heads = departmentId ? await prisma.user.count({ where: { role: "HEAD_OF_DEPARTMENT", departmentId } }) : 0;
  if (heads === 0) return { instructorApproval: "APPROVED", ...cleared };
  return { instructorApproval: "PENDING", ...cleared };
}
