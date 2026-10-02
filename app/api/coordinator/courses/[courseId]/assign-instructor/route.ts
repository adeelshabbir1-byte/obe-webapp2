import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../../../lib/session";
import { prisma } from "../../../../../../lib/db";
import { writeAuditLog } from "../../../../../../lib/audit";
import { courseScopeFor } from "../../../../../../lib/reportScope";

// Originally Course Assigner-only. Chairman, Program Coordinator, and OMC
// can now also assign/change an instructor directly from the Program
// Semester Map's click-to-assign picker — same institution-wide scope
// those roles already get everywhere else via courseScopeFor.
const ASSIGNABLE_ROLES = ["COURSE_ASSIGNER", "PROGRAM_COORDINATOR", "OMC", "CHAIRMAN"];

export async function PUT(req: NextRequest, { params }: { params: { courseId: string } }) {
  const user = await getAuthenticatedUser();
  if (!user || !ASSIGNABLE_ROLES.includes(user.role)) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  // validManagerIds: the managedById value(s) an instructor/Subject Expert
  // must have to be a legal pick for this course. Course Assigner's scope
  // is deliberately wider (unchanged from before) — any Coordinator under
  // their own Chairman, not just this one course's Coordinator — since an
  // Assigner's whole job spans every Coordinator at once.
  let course;
  let validManagerIds: string[];

  if (user.role === "COURSE_ASSIGNER") {
    const coordinators = await prisma.user.findMany({ where: { role: "PROGRAM_COORDINATOR", managedById: user.managedById || "" } });
    const coordinatorIds = coordinators.map((c) => c.id);
    course = await prisma.course.findUnique({ where: { id: params.courseId } });
    if (!course || !coordinatorIds.includes(course.coordinatorId)) return NextResponse.json({ error: "not found" }, { status: 404 });
    validManagerIds = coordinatorIds;
  } else {
    course = await prisma.course.findFirst({ where: { id: params.courseId, ...courseScopeFor(user) } });
    if (!course) return NextResponse.json({ error: "not found" }, { status: 404 });
    validManagerIds = [course.coordinatorId];
  }

  const body = await req.json();
  const instructorId = body.instructorId || null;

  if (instructorId && !course.isOffered) {
    return NextResponse.json({ error: "this course must be offered before an instructor can be assigned to it" }, { status: 400 });
  }

  if (instructorId) {
    const instructor = await prisma.user.findUnique({ where: { id: instructorId } });
    const isValidInstructor = instructor && validManagerIds.includes(instructor.managedById || "") && (instructor.role === "INSTRUCTOR" || instructor.role === "SUBJECT_EXPERT");
    if (!isValidInstructor) {
      return NextResponse.json({ error: "invalid instructor" }, { status: 400 });
    }
  }

  const updated = await prisma.course.update({ where: { id: course.id }, data: { instructorId } });

  await writeAuditLog({
    actorUserId: user.id, action: "INSTRUCTOR_ASSIGNED", entityType: "Course", entityId: course.id,
    metadata: { instructorId: instructorId || "none" },
  });

  return NextResponse.json({ course: updated });
}
