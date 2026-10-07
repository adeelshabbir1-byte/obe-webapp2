import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../lib/session";
import { prisma } from "../../../../lib/db";
import { writeAuditLog } from "../../../../lib/audit";

// Names the Lab Engineer of a Lab course (or clears it).
export async function POST(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user || user.role !== "PROGRAM_COORDINATOR") return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  if (!body.courseId) return NextResponse.json({ error: "courseId is required" }, { status: 400 });
  const course = await prisma.course.findFirst({ where: { id: body.courseId, coordinatorId: user.id, courseType: "Lab" } });
  if (!course) return NextResponse.json({ error: "lab course not found" }, { status: 404 });
  let labEngineerId: string | null = null;
  if (body.labEngineerId) {
    const eng = await prisma.user.findFirst({ where: { id: body.labEngineerId, role: "LAB_ENGINEER", managedById: user.id } });
    if (!eng) return NextResponse.json({ error: "Lab Engineer not found" }, { status: 404 });
    labEngineerId = eng.id;
  }
  await prisma.course.update({ where: { id: course.id }, data: { labEngineerId } });
  await writeAuditLog({ actorUserId: user.id, action: "LAB_ENGINEER_SET", entityType: "Course", entityId: course.id, metadata: { labEngineerId: labEngineerId || "none" } });
  return NextResponse.json({ ok: true });
}
