import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../../../../lib/session";
import { prisma } from "../../../../../../../lib/db";
import { writeAuditLog } from "../../../../../../../lib/audit";

// Confirms a pending course is the SAME as an existing MasterCourse —
// the "equate" action. Optionally merges the staged CLOs into the
// existing course (only the ones that don't already exist there, by
// statement text) rather than just discarding the duplicate.
export async function POST(req: NextRequest, { params }: { params: { pendingId: string } }) {
  const user = await getAuthenticatedUser();
  if (!user || user.role !== "SUPER_USER") return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const pending = await prisma.pendingMasterCourse.findUnique({ where: { id: params.pendingId }, include: { clos: true } });
  if (!pending) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (pending.status !== "PENDING") return NextResponse.json({ error: "already reviewed" }, { status: 409 });

  const body = await req.json();
  if (!body.existingCourseId) return NextResponse.json({ error: "existingCourseId is required" }, { status: 400 });

  const existingCourse = await prisma.masterCourse.findUnique({ where: { id: body.existingCourseId }, include: { seedClos: true } });
  if (!existingCourse || existingCourse.masterCurriculumId !== pending.masterCurriculumId) {
    return NextResponse.json({ error: "existing course not found in this curriculum" }, { status: 404 });
  }

  let mergedCount = 0;
  if (body.mergeClos) {
    const existingStatements = new Set(existingCourse.seedClos.map((c) => c.statement.trim().toLowerCase()));
    let nextOrder = existingCourse.seedClos.length;
    for (const clo of pending.clos) {
      if (existingStatements.has(clo.statement.trim().toLowerCase())) continue;
      await prisma.masterCourseClo.create({
        data: { masterCourseId: existingCourse.id, statement: clo.statement, bloomLevel: clo.bloomLevel, orderIndex: nextOrder },
      });
      nextOrder++;
      mergedCount++;
    }
  }

  await prisma.pendingMasterCourse.update({
    where: { id: pending.id }, data: { status: "APPROVED", reviewedByUserId: user.id, reviewedAt: new Date() },
  });
  await writeAuditLog({
    actorUserId: user.id, action: "PENDING_MASTER_COURSE_EQUATED", entityType: "MasterCourse", entityId: existingCourse.id,
    metadata: { pendingId: pending.id, mergedClos: mergedCount },
  });

  return NextResponse.json({ courseId: existingCourse.id, mergedClos: mergedCount });
}
