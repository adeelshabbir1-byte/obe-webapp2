import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../../../lib/session";
import { prisma } from "../../../../../../lib/db";
import { writeAuditLog } from "../../../../../../lib/audit";

export async function PATCH(req: NextRequest, { params }: { params: { courseId: string } }) {
  const user = await getAuthenticatedUser();
  // Owning Coordinator edits their own course directly; OMC can edit any
  // course in a batch belonging to a Coordinator under their own
  // Chairman — same institution-wide scope OMC already has for
  // repositioning and filling elective slots on this same page.
  if (!user || (user.role !== "PROGRAM_COORDINATOR" && user.role !== "OMC")) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const course = await prisma.course.findUnique({ where: { id: params.courseId }, include: { coordinator: true } });
  if (!course) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (user.role === "PROGRAM_COORDINATOR" && course.coordinatorId !== user.id) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (user.role === "OMC" && course.coordinator.managedById !== user.managedById) return NextResponse.json({ error: "not found" }, { status: 404 });

  const body = await req.json();
  if (!body.code || !body.title || !body.creditHours) {
    return NextResponse.json({ error: "code, title, creditHours are required" }, { status: 400 });
  }

  if (body.code !== course.code) {
    const clash = await prisma.course.findFirst({ where: { coordinatorId: course.coordinatorId, batchId: course.batchId, code: body.code, NOT: { id: course.id } } });
    if (clash) return NextResponse.json({ error: "another course in this batch already uses this code" }, { status: 409 });
  }

  const hasLab = body.hasLab !== undefined ? !!body.hasLab : course.hasLab;
  const zeroingLab = course.hasLab && !hasLab; // was true, now being turned off

  const updated = await prisma.course.update({
    where: { id: course.id },
    data: {
      code: body.code, title: body.title, creditHours: parseInt(body.creditHours, 10),
      courseType: body.courseType || course.courseType,
      semesterNumber: body.semesterNumber ? parseInt(body.semesterNumber, 10) : null,
      hasLab,
      ...(zeroingLab ? { labPct: 0, instructorLabPct: 0 } : {}),
    },
  });

  await writeAuditLog({ actorUserId: user.id, action: "COURSE_EDITED", entityType: "Course", entityId: course.id });

  return NextResponse.json({ course: updated });
}
