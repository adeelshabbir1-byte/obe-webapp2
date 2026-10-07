// Roles a teacher can be given on top of teaching. Such a person keeps their other roles (teaching, Subject Expert)
// and picks which hat to wear each time they sign in.
export const TEACHER_EXTRA_ROLES = ["HEAD_OF_DEPARTMENT", "DEAN", "PROGRAM_COORDINATOR", "DEPARTMENT_COORDINATOR"] as const;
export const DUAL_CAPABLE_PRIMARY = ["SUBJECT_EXPERT", ...TEACHER_EXTRA_ROLES];
export const DUAL_ROLE_LABEL: Record<string, string> = {
  INSTRUCTOR: "Instructor", SUBJECT_EXPERT: "Subject Expert", HEAD_OF_DEPARTMENT: "Chairman", DEAN: "Dean", PROGRAM_COORDINATOR: "Program Lead", DEPARTMENT_COORDINATOR: "Program Coordinator",
};
type Hats = { rawRole: string; secondaryRole?: string | null; tertiaryRole?: string | null };

/** Every role this person may work as: their main one plus the extra hats. */
export function hatsOf(u: Hats): string[] {
  return [u.rawRole, u.secondaryRole, u.tertiaryRole].filter((r): r is string => !!r);
}
export const isDualCapable = (rawRole: string, secondaryRole: string | null | undefined) => DUAL_CAPABLE_PRIMARY.includes(rawRole) && !!secondaryRole;

/** A Prisma filter for people who can act as Subject Expert: real Subject Experts of this coordinator,
 * plus Deans / Chairmen / Program Leads (managed directly by the institute head) who keep a Subject Expert hat. */
export function subjectExpertWhere(coordinatorId: string, chairmanId: string) {
  return {
    OR: [
      { role: "SUBJECT_EXPERT" as const, managedById: coordinatorId },
      { role: { in: ["HEAD_OF_DEPARTMENT", "DEAN", "PROGRAM_COORDINATOR", "DEPARTMENT_COORDINATOR"] as ("HEAD_OF_DEPARTMENT" | "DEAN" | "PROGRAM_COORDINATOR" | "DEPARTMENT_COORDINATOR")[] }, managedById: chairmanId, OR: [{ secondaryRole: "SUBJECT_EXPERT" }, { tertiaryRole: "SUBJECT_EXPERT" }] },
    ],
  };
}
/** Same test for one already-loaded person. */
export function hasSubjectExpertHat(u: { role: string; secondaryRole?: string | null; tertiaryRole?: string | null }) {
  return u.role === "SUBJECT_EXPERT" || (["HEAD_OF_DEPARTMENT", "DEAN", "PROGRAM_COORDINATOR", "DEPARTMENT_COORDINATOR"].includes(u.role) && (u.secondaryRole === "SUBJECT_EXPERT" || u.tertiaryRole === "SUBJECT_EXPERT"));
}
