import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../../lib/session";
import { prisma } from "../../../../../lib/db";
import { writeAuditLog } from "../../../../../lib/audit";

export async function PUT(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user || user.role !== "COURSE_ASSIGNER") return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const body = await req.json();
  const { kind, id, instructorId, sectionCount } = body;
  if (!kind || !id || !instructorId || sectionCount === undefined) {
    return NextResponse.json({ error: "kind, id, instructorId, sectionCount are required" }, { status: 400 });
  }

  const instructor = await prisma.user.findUnique({ where: { id: instructorId } });
  if (!instructor) return NextResponse.json({ error: "invalid instructor" }, { status: 400 });

  const count = parseInt(sectionCount, 10);

  if (kind === "course") {
    const course = await prisma.course.findUnique({ where: { id }, include: { coordinator: true } });
    if (!course || course.coordinator.managedById !== user.managedById || instructor.managedById !== course.coordinatorId) {
      return NextResponse.json({ error: "not found" }, { status: 404 });
    }
    if (count <= 0) {
      await prisma.courseSectionAssignment.deleteMany({ where: { courseId: id, instructorId } });
    } else {
      await prisma.courseSectionAssignment.upsert({
        where: { courseId_instructorId: { courseId: id, instructorId } },
        create: { courseId: id, instructorId, sectionCount: count },
        update: { sectionCount: count },
      });
    }
  } else if (kind === "group") {
    const group = await prisma.courseEquivalenceGroup.findUnique({ where: { id } });
    if (!group || group.chairmanId !== user.managedById) {
      return NextResponse.json({ error: "not found" }, { status: 404 });
    }
    const instructorCoordinator = instructor.managedById ? await prisma.user.findUnique({ where: { id: instructor.managedById } }) : null;
    if (!instructorCoordinator || instructorCoordinator.managedById !== user.managedById) {
      return NextResponse.json({ error: "invalid instructor" }, { status: 400 });
    }
    if (count <= 0) {
      await prisma.groupSectionAssignment.deleteMany({ where: { groupId: id, instructorId } });
    } else {
      await prisma.groupSectionAssignment.upsert({
        where: { groupId_instructorId: { groupId: id, instructorId } },
        create: { groupId: id, instructorId, sectionCount: count },
        update: { sectionCount: count },
      });
    }
  } else {
    return NextResponse.json({ error: "kind must be 'course' or 'group'" }, { status: 400 });
  }

  await writeAuditLog({
    actorUserId: user.id, action: "SECTION_ASSIGNMENT_SET", entityType: kind === "course" ? "Course" : "CourseEquivalenceGroup", entityId: id,
    metadata: { instructorId, sectionCount: count },
  });

  return NextResponse.json({ ok: true });
}
