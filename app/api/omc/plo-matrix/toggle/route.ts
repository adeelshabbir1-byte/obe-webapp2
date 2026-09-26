import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../../lib/session";
import { prisma } from "../../../../../lib/db";
import { writeAuditLog } from "../../../../../lib/audit";

export async function PUT(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user || user.role !== "OMC") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const { courseId, ploId, mapped } = body;
  // Only trusted when the client is reporting that this checkbox was
  // shown as an HEC suggestion at the moment it got checked — anything
  // else (including no value at all) is a plain manual check.
  const source = body.source === "HEC" ? "HEC" : "MANUAL";
  if (!courseId || !ploId || typeof mapped !== "boolean") {
    return NextResponse.json({ error: "courseId, ploId, mapped are required" }, { status: 400 });
  }

  // Verify this course/PLO belong to a coordinator this OMC member can see,
  // AND that the PLO actually belongs to the SAME batch as the course
  // (PLOs are batch-scoped — a course must only map to its own batch's PLOs).
  const course = await prisma.course.findUnique({ where: { id: courseId }, include: { coordinator: true } });
  const plo = await prisma.pLO.findUnique({ where: { id: ploId } });
  if (!course || !plo || course.coordinator.managedById !== user.managedById || plo.batchId !== course.batchId) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  if (mapped) {
    await prisma.coursePloMapping.upsert({
      where: { courseId_ploId: { courseId, ploId } },
      create: { courseId, ploId, assignedById: user.id, source },
      update: {}, // re-checking an already-mapped cell doesn't happen (checkbox already showed checked), but if it ever does, leave its recorded source alone
    });
  } else {
    await prisma.coursePloMapping.deleteMany({ where: { courseId, ploId } });
  }

  await writeAuditLog({
    actorUserId: user.id, action: mapped ? "COURSE_PLO_MAPPED" : "COURSE_PLO_UNMAPPED",
    entityType: "Course", entityId: courseId, metadata: { ploId },
  });

  return NextResponse.json({ ok: true });
}
