import { randomBytes } from "crypto";
import { prisma } from "./db";
import { hashPassword } from "./auth";

// A Chairman, Dean or Program Lead who also teaches (secondaryRole INSTRUCTOR) is offered wherever faculty are listed.
// They are managed directly by the chairman, not by a coordinator, so the normal "managed by one of the coordinators" test misses them.
export function headFacultyWhere(chairmanId: string) {
  return { role: { in: ["HEAD_OF_DEPARTMENT", "DEAN", "PROGRAM_COORDINATOR"] as ("HEAD_OF_DEPARTMENT" | "DEAN" | "PROGRAM_COORDINATOR")[] }, secondaryRole: "INSTRUCTOR", managedById: chairmanId };
}
export function isHeadFaculty(u: { role: string; secondaryRole?: string | null; managedById: string | null }, chairmanId: string) {
  return ["HEAD_OF_DEPARTMENT", "DEAN", "PROGRAM_COORDINATOR"].includes(u.role) && u.secondaryRole === "INSTRUCTOR" && u.managedById === chairmanId;
}

export const VISITING_NAME = "Visiting Faculty (to be decided)";
export const DEFAULT_DEPARTMENT_NAME = "Main Department";

// The department every existing / unassigned person falls into.
export async function ensureDefaultDepartment(chairmanId: string) {
  const existing = await prisma.department.findFirst({ where: { chairmanId }, orderBy: { createdAt: "asc" } });
  if (existing) return existing;
  return prisma.department.create({ data: { chairmanId, name: DEFAULT_DEPARTMENT_NAME } });
}

// The institute's built-in "Visiting Faculty (to be decided)" stand-in. Picking it for a course means
// "a teacher from outside or another department - we'll decide later". It is a placeholder, not a person:
// it never logs in, and the timetable gives each of its sections its own identity so two visiting
// courses can never clash with each other.
export async function getOrCreateVisitingFaculty(chairmanId: string) {
  const existing = await prisma.user.findFirst({ where: { isVisitingPlaceholder: true, managedById: chairmanId } });
  if (existing) return existing;
  const passwordHash = await hashPassword(randomBytes(24).toString("hex")); // random, never shown - nobody can log in as it
  return prisma.user.create({
    data: {
      email: `visiting-faculty-${chairmanId}@placeholder.invalid`, username: `visiting-faculty-${chairmanId}`,
      passwordHash, name: VISITING_NAME, role: "INSTRUCTOR", managedById: chairmanId, mustChangePassword: false, isVisitingPlaceholder: true,
    },
  });
}
