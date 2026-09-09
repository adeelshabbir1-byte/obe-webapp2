import { prisma } from "./db";
import type { Prisma } from "@prisma/client";

const REPORT_ROLES = ["OMC", "CHAIRMAN", "PROGRAM_COORDINATOR", "SUBJECT_EXPERT", "INSTRUCTOR", "SUPER_USER"];

export function canViewReports(role: string) {
  return REPORT_ROLES.includes(role);
}

/** A Prisma `where` filter for Course, scoped to what this role should see. */
export function courseScopeFor(user: { id: string; role: string; managedById: string | null }): Prisma.CourseWhereInput {
  switch (user.role) {
    case "SUPER_USER":
      return {}; // platform-wide — no institution restriction
    case "OMC":
      return { coordinator: { managedById: user.managedById || "" } };
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
export async function coordinatorIdsFor(user: { id: string; role: string; managedById: string | null }): Promise<string[]> {
  if (user.role === "SUPER_USER") {
    const coordinators = await prisma.user.findMany({ where: { role: "PROGRAM_COORDINATOR" } });
    return coordinators.map((c) => c.id);
  }
  if (user.role === "PROGRAM_COORDINATOR") return [user.id];
  if (user.role === "OMC" || user.role === "CHAIRMAN") {
    const chairmanId = user.role === "OMC" ? user.managedById || "" : user.id;
    const coordinators = await prisma.user.findMany({ where: { role: "PROGRAM_COORDINATOR", managedById: chairmanId } });
    return coordinators.map((c) => c.id);
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
  if (user.role === "OMC" || user.role === "PROGRAM_COORDINATOR") return user.managedById || "";
  // SE/Instructor: one more hop up (their manager is a Coordinator, whose manager is the Chairman).
  if (!user.managedById) return "";
  const coordinator = await prisma.user.findUnique({ where: { id: user.managedById } });
  return coordinator?.managedById || "";
}

export function roleLabel(role: string) {
  const labels: Record<string, string> = {
    OMC: "OMC Member", CHAIRMAN: "Chairman", PROGRAM_COORDINATOR: "Program Coordinator",
    SUBJECT_EXPERT: "Subject Expert", INSTRUCTOR: "Course Instructor", SUPER_USER: "Super User",
  };
  return labels[role] || role;
}
