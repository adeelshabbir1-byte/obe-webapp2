import { prisma } from "./db";
import { approvalFieldsFor } from "./approvals";
import { writeAuditLog } from "./audit";
import { headFacultyWhere } from "./departments";
import { blockedAsNonBaseCourse, syncSubjectExpertToLinkedCourses } from "./contentSync";

export type LoanKind = "INSTRUCTOR" | "SUBJECT_EXPERT";

// Who may ask for which kind of help from another department.
export const REQUEST_ROLES: Record<LoanKind, string[]> = {
  INSTRUCTOR: ["COURSE_ASSIGNER", "PROGRAM_COORDINATOR", "HEAD_OF_DEPARTMENT", "CHAIRMAN"],
  SUBJECT_EXPERT: ["OMC", "PROGRAM_COORDINATOR", "HEAD_OF_DEPARTMENT", "CHAIRMAN"],
};

// People a department can lend. For a Subject Expert request only real Subject Experts qualify (they need the SE screens);
// for a teaching request any faculty member does, including a Chairman who also teaches.
export function lendableWhere(chairmanId: string, kind: LoanKind, departmentId?: string) {
  const dept = departmentId ? { departmentId } : { departmentId: { not: null } };
  if (kind === "SUBJECT_EXPERT") {
    return {
      ...dept, isVisitingPlaceholder: false,
      OR: [
        { role: "SUBJECT_EXPERT" as const, managedBy: { managedById: chairmanId } },
        { role: { in: ["HEAD_OF_DEPARTMENT", "DEAN", "PROGRAM_COORDINATOR", "DEPARTMENT_COORDINATOR"] as ("HEAD_OF_DEPARTMENT" | "DEAN" | "PROGRAM_COORDINATOR" | "DEPARTMENT_COORDINATOR")[] }, managedById: chairmanId, OR: [{ secondaryRole: "SUBJECT_EXPERT" }, { tertiaryRole: "SUBJECT_EXPERT" }, { extraRoles: { has: "SUBJECT_EXPERT" } }] },
      ],
    };
  }
  return {
    ...dept, isVisitingPlaceholder: false,
    OR: [{ role: { in: ["INSTRUCTOR", "SUBJECT_EXPERT"] as ("INSTRUCTOR" | "SUBJECT_EXPERT")[] }, managedBy: { managedById: chairmanId } }, headFacultyWhere(chairmanId)],
  };
}

// Puts one of the allowed teachers on the course. The borrowed person is then asked to accept or decline.
export async function assignFromLoan(loanId: string, instructorId: string, actorUserId: string): Promise<string | null> {
  const loan = await prisma.teacherLoanRequest.findUnique({ where: { id: loanId }, include: { allowed: true } });
  if (!loan || loan.status !== "APPROVED") return "this request has not been approved";
  if (loan.requesterDeanStatus === "PENDING" || loan.lenderDeanStatus === "PENDING") return "this request is still waiting for the Dean";
  if (!loan.allowed.some((a) => a.instructorId === instructorId)) return "that person is not on the allowed list for this request";

  if (loan.kind === "SUBJECT_EXPERT") {
    const blocked = await blockedAsNonBaseCourse(loan.courseId);
    if (blocked) return blocked.replace("edited directly", "assigned a Subject Expert directly");
    await prisma.course.update({ where: { id: loan.courseId }, data: { subjectExpertId: instructorId, seResponse: "PENDING", seResponseNote: null } });
    await syncSubjectExpertToLinkedCourses(loan.courseId, instructorId);
  } else {
    await prisma.course.update({
      where: { id: loan.courseId },
      data: { instructorId, instructorResponse: "PENDING", instructorResponseNote: null, ...(await approvalFieldsFor(loan.courseId, instructorId)) },
    });
  }
  await writeAuditLog({ actorUserId, action: "TEACHER_BORROWED", entityType: "Course", entityId: loan.courseId, metadata: { instructorId, loanId, kind: loan.kind } });
  return null;
}
