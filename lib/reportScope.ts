import { prisma } from "./db";
import type { Prisma } from "@prisma/client";
import { deptScope, omcCourseScope } from "./omcScope";

const REPORT_ROLES = ["DEPARTMENT_COORDINATOR", "DEAN", "HEAD_OF_DEPARTMENT", "OMC", "CHAIRMAN", "PROGRAM_COORDINATOR", "SUBJECT_EXPERT", "INSTRUCTOR", "SUPER_USER"];

export function canViewReports(role: string) {
  return REPORT_ROLES.includes(role);
}

/** A Prisma `where` filter for Course, scoped to what this role should see. */
export function courseScopeFor(user: { id: string; role: string; managedById: string | null; departmentId?: string | null; facultyId?: string | null }): Prisma.CourseWhereInput {
  switch (user.role) {
    case "SUPER_USER":
      return {}; // platform-wide — no institution restriction
    case "OMC": {
      const own: Prisma.CourseWhereInput = { coordinator: { managedById: user.managedById || "" }, ...(omcCourseScope(user) as Prisma.CourseWhereInput) };
      const colleges = (user as { collegeIds?: string[] }).collegeIds || [];
      const dn = (user as { collegeDeptName?: string | null }).collegeDeptName;
      const collegeCourses: Prisma.CourseWhereInput = { coordinator: { managedById: { in: colleges }, ...(dn ? { OR: [{ department_: { name: { equals: dn, mode: "insensitive" } } }, { departmentId: null }] } : {}) } };
      return colleges.length ? { OR: [own, collegeCourses] } : own;
    }
    case "DEPARTMENT_COORDINATOR":
      return { coordinator: { managedById: user.managedById || "", departmentId: user.departmentId || "none" } };
    case "DEAN":
      return { coordinator: { managedById: user.managedById || "", department_: { facultyId: user.facultyId || "none" } } };
    case "HEAD_OF_DEPARTMENT":
      return { coordinator: { managedById: user.managedById || "", departmentId: user.departmentId || "none" } };
    case "CHAIRMAN":
      return { coordinator: { managedById: user.id } };
    case "PROGRAM_COORDINATOR":
      return { coordinatorId: user.id };
    case "SUBJECT_EXPERT":
      return { subjectExpertId: user.id };
    case "INSTRUCTOR":
      return { instructorId: user.id };
    default:
      return { id: "no-access" };
  }
}

/** Same idea, but for queries that filter on coordinatorId directly (batches, PLOs, faculty). */
export async function coordinatorIdsFor(user: { id: string; role: string; managedById: string | null; departmentId?: string | null; facultyId?: string | null }): Promise<string[]> {
  if (user.role === "SUPER_USER") {
    const coordinators = await prisma.user.findMany({ where: { role: "PROGRAM_COORDINATOR" } });
    return coordinators.map((c) => c.id);
  }
  if (user.role === "PROGRAM_COORDINATOR") return [user.id];
  if (user.role === "DEPARTMENT_COORDINATOR") {
    const coordinators = await prisma.user.findMany({ where: { role: "PROGRAM_COORDINATOR", managedById: user.managedById || "", departmentId: user.departmentId || "none" } });
    return coordinators.map((c) => c.id);
  }
  if (user.role === "DEAN") {
    const coordinators = await prisma.user.findMany({ where: { role: "PROGRAM_COORDINATOR", managedById: user.managedById || "", department_: { facultyId: user.facultyId || "none" } } });
    return coordinators.map((c) => c.id);
  }
  if (user.role === "HEAD_OF_DEPARTMENT") {
    const coordinators = await prisma.user.findMany({ where: { role: "PROGRAM_COORDINATOR", managedById: user.managedById || "", departmentId: user.departmentId || "none" } });
    return coordinators.map((c) => c.id);
  }
  if (user.role === "OMC" || user.role === "CHAIRMAN") {
    const chairmanId = user.role === "OMC" ? user.managedById || "" : user.id;
    const coordinators = await prisma.user.findMany({ where: { role: "PROGRAM_COORDINATOR", managedById: chairmanId, ...deptScope(user) } });
    const colleges = user.role === "OMC" ? (user as { collegeIds?: string[] }).collegeIds || [] : [];
    const dn = (user as { collegeDeptName?: string | null }).collegeDeptName;
    const collegeLeads = colleges.length ? await prisma.user.findMany({ where: { role: "PROGRAM_COORDINATOR", managedById: { in: colleges }, ...(dn ? { OR: [{ department_: { name: { equals: dn, mode: "insensitive" } } }, { departmentId: null }] } : {}) }, select: { id: true } }) : [];
    return coordinators.map((c) => c.id).concat(collegeLeads.map((c) => c.id));
  }
  // SE/Instructor: whichever coordinator(s) own the courses they're attached to.
  const courses = await prisma.course.findMany({
    where: user.role === "SUBJECT_EXPERT" ? { subjectExpertId: user.id } : { instructorId: user.id },
    select: { coordinatorId: true },
    distinct: ["coordinatorId"],
  });
  return courses.map((c) => c.coordinatorId);
}

/** The chairmanId that owns this user's institution — needed for chairman-scoped
 * data like WeightPolicy and CourseEquivalenceGroup. */
export async function chairmanIdFor(user: { id: string; role: string; managedById: string | null }): Promise<string> {
  if (user.role === "CHAIRMAN") return user.id;
  if (user.role === "OMC" || user.role === "PROGRAM_COORDINATOR" || user.role === "HEAD_OF_DEPARTMENT" || user.role === "DEAN" || user.role === "DEPARTMENT_COORDINATOR" || user.role === "LIBRARIAN" || user.role === "FACILITIES_MANAGER" || user.role === "FINANCE_OFFICER" || user.role === "STUDENT_AFFAIRS") return user.managedById || "";
  // SE/Instructor: one more hop up (their manager is a Coordinator, whose manager is the Institute Head).
  if (!user.managedById) return "";
  const coordinator = await prisma.user.findUnique({ where: { id: user.managedById } });
  if (coordinator?.role === "CHAIRMAN") return coordinator.id; // a Chairman acting as an Instructor is managed by the chairman directly
  return coordinator?.managedById || "";
}

export function roleLabel(role: string) {
  const labels: Record<string, string> = {
    DEAN: "Dean", HEAD_OF_DEPARTMENT: "Chairman", OMC: "OMC Member", CHAIRMAN: "Institute Head", PROGRAM_COORDINATOR: "Program Lead", DEPARTMENT_COORDINATOR: "Program Coordinator",
    SUBJECT_EXPERT: "University Subject Expert", INSTRUCTOR: "Course Instructor", LAB_ENGINEER: "Lab Engineer", LAB_MANAGER: "Lab Manager", LIBRARIAN: "Librarian", FINANCE_OFFICER: "Finance Officer", STUDENT_AFFAIRS: "Student Affairs", FACILITIES_MANAGER: "Facilities Manager", SUPER_USER: "Super User",
  };
  return labels[role] || role;
}

/** Extra batch filter for report pickers: an Instructor or Subject Expert only sees the batches where they teach / design a course. */
export function batchScopeFor(user: { id: string; role: string }): Prisma.BatchWhereInput {
  if (user.role === "INSTRUCTOR") return { courses: { some: { instructorId: user.id } } };
  if (user.role === "SUBJECT_EXPERT") return { courses: { some: { subjectExpertId: user.id } } };
  return {};
}

/** For a university OMC that also covers affiliated colleges: add the college's name to its batches' names in pickers. */
export async function nameCollegeBatches<T extends { id: string; batchName?: string }>(user: { role: string }, batches: T[]): Promise<T[]> {
  const colleges = (user as { collegeIds?: string[] }).collegeIds || [];
  if (!colleges.length || !batches.length) return batches;
  const cb = await prisma.batch.findMany({ where: { id: { in: batches.map((b) => b.id) }, coordinator: { managedById: { in: colleges } } }, select: { id: true, coordinator: { select: { managedBy: { select: { instituteName: true, name: true } } } } } });
  const name = new Map(cb.map((b) => [b.id, b.coordinator.managedBy?.instituteName || b.coordinator.managedBy?.name || "college"]));
  for (const b of batches) if (name.has(b.id) && typeof b.batchName === "string" && !b.batchName.includes(" — ")) b.batchName = `${b.batchName} — ${name.get(b.id)}`;
  return batches;
}
