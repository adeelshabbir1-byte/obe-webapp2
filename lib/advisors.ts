// Who a Program Lead may name as a batch's Advisor: active teaching staff they manage, themself, or anyone teaching in
// the same department (a Chairman, another Program Lead, an Instructor or Subject Expert there).
const TEACHING = ["INSTRUCTOR", "SUBJECT_EXPERT", "PROGRAM_COORDINATOR", "HEAD_OF_DEPARTMENT", "DEAN", "DEPARTMENT_COORDINATOR", "OMC", "COURSE_ASSIGNER"];

export function advisorCandidatesWhere(lead: { id: string; managedById: string | null; departmentId?: string | null }) {
  const sameInstitute = lead.managedById ? [{ managedById: lead.managedById }, { managedBy: { managedById: lead.managedById } }] : [];
  return {
    isActive: true,
    isVisitingPlaceholder: false,
    role: { in: TEACHING },
    OR: [
      { id: lead.id },
      { managedById: lead.id },
      ...(lead.departmentId ? [{ departmentId: lead.departmentId, OR: sameInstitute }] : []),
    ],
  } as never;
}
