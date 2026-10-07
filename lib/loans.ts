import { prisma } from "./db";
import { approvalFieldsFor } from "./approvals";
import { writeAuditLog } from "./audit";

// Puts a borrowed teacher on the course (the lending head has said yes). The course's own head still signs off
// through the normal teacher approval, unless the department has no head.
export async function applyLoan(loanId: string, actorUserId: string) {
  const loan = await prisma.teacherLoanRequest.findUnique({ where: { id: loanId } });
  if (!loan) return;
  await prisma.course.update({
    where: { id: loan.courseId },
    data: { instructorId: loan.instructorId, ...(await approvalFieldsFor(loan.courseId, loan.instructorId)) },
  });
  await writeAuditLog({ actorUserId, action: "TEACHER_BORROWED", entityType: "Course", entityId: loan.courseId, metadata: { instructorId: loan.instructorId, loanId } });
}
