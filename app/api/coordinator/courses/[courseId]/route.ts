import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../../lib/session";
import { prisma } from "../../../../../lib/db";
import { deleteCourseCompletely } from "../../../../../lib/deleteCourseCompletely";
import { writeAuditLog } from "../../../../../lib/audit";

export async function DELETE(req: Request, { params }: { params: { courseId: string } }) {
  const user = await getAuthenticatedUser();
  // Same institution-wide scope as edit/reposition: the owning
  // Coordinator can always delete their own course; OMC can delete any
  // course belonging to a Coordinator under their own Chairman.
  if (!user || (user.role !== "PROGRAM_COORDINATOR" && user.role !== "OMC")) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const course = await prisma.course.findUnique({ where: { id: params.courseId }, include: { batch: true, coordinator: true } });
  if (!course || !course.batch) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (user.role === "PROGRAM_COORDINATOR" && course.batch.coordinatorId !== user.id) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (user.role === "OMC" && course.coordinator.managedById !== user.managedById) return NextResponse.json({ error: "not found" }, { status: 404 });

  try {
    await deleteCourseCompletely(params.courseId);
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || "something went wrong deleting this course" }, { status: 500 });
  }
  await writeAuditLog({ actorUserId: user.id, action: "COURSE_DELETED", entityType: "Course", entityId: params.courseId });

  return NextResponse.json({ ok: true });
}
