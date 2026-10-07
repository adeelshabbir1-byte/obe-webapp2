// Roles a teacher can be given on top of teaching. Such a person keeps teaching (secondaryRole INSTRUCTOR)
// and picks which hat to wear each time they sign in.
export const TEACHER_EXTRA_ROLES = ["HEAD_OF_DEPARTMENT", "DEAN", "PROGRAM_COORDINATOR"] as const;
export const DUAL_CAPABLE_PRIMARY = ["SUBJECT_EXPERT", ...TEACHER_EXTRA_ROLES];
export const DUAL_ROLE_LABEL: Record<string, string> = {
  INSTRUCTOR: "Instructor", SUBJECT_EXPERT: "Subject Expert", HEAD_OF_DEPARTMENT: "Chairman", DEAN: "Dean", PROGRAM_COORDINATOR: "Program Lead",
};
export const isDualCapable = (rawRole: string, secondaryRole: string | null | undefined) => DUAL_CAPABLE_PRIMARY.includes(rawRole) && secondaryRole === "INSTRUCTOR";
