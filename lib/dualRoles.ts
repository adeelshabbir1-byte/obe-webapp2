// Roles a teacher can be given on top of teaching. Such a person keeps their other roles (teaching, Subject Expert)
// and picks which hat to wear each time they sign in.
export const TEACHER_EXTRA_ROLES = ["HEAD_OF_DEPARTMENT", "DEAN", "PROGRAM_COORDINATOR", "DEPARTMENT_COORDINATOR"] as const;
export const DUAL_CAPABLE_PRIMARY = ["SUBJECT_EXPERT", ...TEACHER_EXTRA_ROLES];
export const DUAL_ROLE_LABEL: Record<string, string> = {
  INSTRUCTOR: "Instructor", SUBJECT_EXPERT: "Subject Expert", HEAD_OF_DEPARTMENT: "Chairman", DEAN: "Dean", PROGRAM_COORDINATOR: "Program Lead", DEPARTMENT_COORDINATOR: "Program Coordinator", COURSE_ASSIGNER: "Course Assigner", OMC: "OMC Member",
};
type Hats = { rawRole: string; secondaryRole?: string | null; tertiaryRole?: string | null; extraRoles?: string[] | null; assignerHat?: boolean; omcHat?: boolean };

/** Every role this person may work as: their main one plus the extra hats. */
export function hatsOf(u: Hats): string[] {
  const hats = [u.rawRole, u.secondaryRole, u.tertiaryRole, ...(u.extraRoles || [])].filter((r): r is string => !!r);
  if (u.assignerHat && !hats.includes("COURSE_ASSIGNER")) hats.push("COURSE_ASSIGNER");
  if (u.omcHat && !hats.includes("OMC")) hats.push("OMC");
  return hats;
}
export const isDualCapable = (rawRole: string, secondaryRole: string | null | undefined, assignerHat?: boolean) =>
  (DUAL_CAPABLE_PRIMARY.includes(rawRole) && !!secondaryRole) || (!!assignerHat && rawRole !== "COURSE_ASSIGNER" && rawRole !== "OMC");

/** A Prisma filter for people who can act as Subject Expert: real Subject Experts of this coordinator,
 * plus Deans / Chairmen / Program Leads (managed directly by the institute head) who keep a Subject Expert hat. */
export function subjectExpertWhere(coordinatorId: string, chairmanId: string) {
  return {
    OR: [
      { role: "SUBJECT_EXPERT" as const, managedById: coordinatorId },
      { role: { in: ["HEAD_OF_DEPARTMENT", "DEAN", "PROGRAM_COORDINATOR", "DEPARTMENT_COORDINATOR"] as ("HEAD_OF_DEPARTMENT" | "DEAN" | "PROGRAM_COORDINATOR" | "DEPARTMENT_COORDINATOR")[] }, managedById: chairmanId, OR: [{ secondaryRole: "SUBJECT_EXPERT" }, { tertiaryRole: "SUBJECT_EXPERT" }, { extraRoles: { has: "SUBJECT_EXPERT" } }] },
    ],
  };
}
/** A Prisma filter for everyone who holds a role, whether as the main role or as an extra hat
 * (a person can be both Dean and Chairman, so a Chairman may be listed as a hat on a Dean's account). */
export function holdsRoleWhere(role: "DEAN" | "HEAD_OF_DEPARTMENT" | "PROGRAM_COORDINATOR" | "DEPARTMENT_COORDINATOR" | "SUBJECT_EXPERT" | "INSTRUCTOR") {
  return { OR: [{ role }, { secondaryRole: role }, { tertiaryRole: role }, { extraRoles: { has: role } }] };
}
/** Same test for one already-loaded person. */
export function hasSubjectExpertHat(u: { role: string; secondaryRole?: string | null; tertiaryRole?: string | null; extraRoles?: string[] | null }) {
  return u.role === "SUBJECT_EXPERT" || (["HEAD_OF_DEPARTMENT", "DEAN", "PROGRAM_COORDINATOR", "DEPARTMENT_COORDINATOR"].includes(u.role) && (u.secondaryRole === "SUBJECT_EXPERT" || u.tertiaryRole === "SUBJECT_EXPERT" || !!u.extraRoles?.includes("SUBJECT_EXPERT")));
}

/** Order in which a person's roles decide the main (stored) role. The role that owns data comes first,
 * because lists and ownership are keyed on it; every other role is kept as a hat. */
export const ROLE_PRECEDENCE = ["PROGRAM_COORDINATOR", "DEPARTMENT_COORDINATOR", "HEAD_OF_DEPARTMENT", "DEAN", "SUBJECT_EXPERT", "INSTRUCTOR"];
/** All the roles held by a user row, main role first. */
export const heldSet = (u: { role: string; secondaryRole?: string | null; tertiaryRole?: string | null; extraRoles?: string[] | null }) =>
  Array.from(new Set([u.role, u.secondaryRole, u.tertiaryRole, ...(u.extraRoles || [])].filter((r): r is string => !!r)));
/** Turn a set of roles into the stored fields: the main role plus the hats (two named slots, the rest in extraRoles). */
export function packRoles(roles: string[]) {
  const ordered = ROLE_PRECEDENCE.filter((r) => roles.includes(r));
  const [role, ...hats] = ordered;
  return { role, secondaryRole: hats[0] || null, tertiaryRole: hats[1] || null, extraRoles: hats.slice(2) };
}
