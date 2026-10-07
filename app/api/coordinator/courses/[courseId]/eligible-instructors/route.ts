import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../../../lib/session";
import { prisma } from "../../../../../../lib/db";
import { courseScopeFor, chairmanIdFor } from "../../../../../../lib/reportScope";
import { getOrCreateVisitingFaculty, headFacultyWhere } from "../../../../../../lib/departments";

// Candidate list for the Program Semester Map's click-to-assign instructor
// picker. Scoping mirrors assign-instructor/route.ts's PUT exactly (kept as
// a second inline copy rather than shared, since Course Assigner's
// whole-chairman scope and everyone else's single-course scope are
// genuinely different shapes) — a role that can't assign here shouldn't be
// able to see who's assignable either.
const ASSIGNABLE_ROLES = ["COURSE_ASSIGNER", "PROGRAM_COORDINATOR", "OMC", "CHAIRMAN"];

export async function GET(req: NextRequest, { params }: { params: { courseId: string } }) {
  const user = await getAuthenticatedUser();
  if (!user || !ASSIGNABLE_ROLES.includes(user.role)) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  let validManagerIds: string[];

  if (user.role === "COURSE_ASSIGNER") {
    const coordinators = await prisma.user.findMany({ where: { role: "PROGRAM_COORDINATOR", managedById: user.managedById || "" } });
    const coordinatorIds = coordinators.map((c) => c.id);
    const course = await prisma.course.findUnique({ where: { id: params.courseId } });
    if (!course || !coordinatorIds.includes(course.coordinatorId)) return NextResponse.json({ error: "not found" }, { status: 404 });
    validManagerIds = coordinatorIds;
  } else {
    const course = await prisma.course.findFirst({ where: { id: params.courseId, ...courseScopeFor(user) } });
    if (!course) return NextResponse.json({ error: "not found" }, { status: 404 });
    validManagerIds = [course.coordinatorId];
  }

  const chairmanId = user.role === "COURSE_ASSIGNER" ? user.managedById || "" : await chairmanIdFor(user);
  const instructors = await prisma.user.findMany({
    where: { OR: [{ role: { in: ["INSTRUCTOR", "SUBJECT_EXPERT"] }, managedById: { in: validManagerIds } }, headFacultyWhere(chairmanId)] },
    select: { id: true, name: true, role: true },
    orderBy: { name: "asc" },
  });

  // Built-in "Visiting Faculty (to be decided)" option, always offered first.
  const visiting = chairmanId ? await getOrCreateVisitingFaculty(chairmanId) : null;
  const list = visiting ? [{ id: visiting.id, name: visiting.name, role: "INSTRUCTOR" }, ...instructors] : instructors;

  return NextResponse.json({ instructors: list });
}
