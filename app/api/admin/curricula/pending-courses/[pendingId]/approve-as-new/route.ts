import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../../../../lib/session";
import { prisma } from "../../../../../../../lib/db";
import { writeAuditLog } from "../../../../../../../lib/audit";

// Confirms a pending course as a genuinely new, distinct course —
// creates the real MasterCourse (+ CLOs) from the staged data.
export async function POST(req: NextRequest, { params }: { params: { pendingId: string } }) {
  const user = await getAuthenticatedUser();
  if (!user || user.role !== "SUPER_USER") return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const pending = await prisma.pendingMasterCourse.findUnique({ where: { id: params.pendingId }, include: { clos: { orderBy: { orderIndex: "asc" } } } });
  if (!pending) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (pending.status !== "PENDING") return NextResponse.json({ error: "already reviewed" }, { status: 409 });

  const body = await req.json().catch(() => ({}));
  const code = body.code || pending.suggestedCode;
  const category = body.category || pending.category;
  if (!code?.trim() || !category?.trim()) return NextResponse.json({ error: "code and category are required (either on the pending record or in the request body)" }, { status: 400 });

  const existing = await prisma.masterCourse.findFirst({ where: { masterCurriculumId: pending.masterCurriculumId, code } });
  if (existing) return NextResponse.json({ error: "a course with this code already exists in this curriculum — choose a different code" }, { status: 409 });

  const newCourse = await prisma.masterCourse.create({
    data: {
      masterCurriculumId: pending.masterCurriculumId, code, title: pending.title,
      creditHours: body.creditHours ? parseInt(body.creditHours, 10) : 3,
      category, domain: pending.domain,
      catalogDescription: `Source: ${pending.source}`,
    },
  });
  for (const clo of pending.clos) {
    await prisma.masterCourseClo.create({
      data: { masterCourseId: newCourse.id, statement: clo.statement, bloomLevel: clo.bloomLevel, orderIndex: clo.orderIndex },
    });
  }

  await prisma.pendingMasterCourse.update({
    where: { id: pending.id }, data: { status: "APPROVED", reviewedByUserId: user.id, reviewedAt: new Date() },
  });
  await writeAuditLog({ actorUserId: user.id, action: "PENDING_MASTER_COURSE_APPROVED_AS_NEW", entityType: "MasterCourse", entityId: newCourse.id, metadata: { pendingId: pending.id } });

  return NextResponse.json({ courseId: newCourse.id });
}
