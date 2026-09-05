import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../../../lib/session";
import { prisma } from "../../../../../../lib/db";
import { writeAuditLog } from "../../../../../../lib/audit";
import { canEditReport } from "../../../../../../lib/reportAcl";

export async function PUT(req: NextRequest, { params }: { params: { courseId: string } }) {
  const user = await getAuthenticatedUser();
  if (!user || user.role !== "CHAIRMAN") return NextResponse.json({ error: "forbidden" }, { status: 403 });
  if (!(await canEditReport(user, "omc.reports.result-mate"))) return NextResponse.json({ error: "edit access to this report is restricted" }, { status: 403 });

  const course = await prisma.course.findUnique({ where: { id: params.courseId }, include: { coordinator: true } });
  if (!course || course.coordinator.managedById !== user.id) return NextResponse.json({ error: "not found" }, { status: 404 });

  const body = await req.json();
  const cutoffs: { letter: string; minPercent: number }[] = body.cutoffs || [];
  if (cutoffs.length === 0) return NextResponse.json({ error: "at least one cutoff is required" }, { status: 400 });

  for (const c of cutoffs) {
    await prisma.courseGradeCutoff.upsert({
      where: { courseId_letter: { courseId: course.id, letter: c.letter } },
      create: { courseId: course.id, letter: c.letter, minPercent: c.minPercent, setById: user.id },
      update: { minPercent: c.minPercent, setById: user.id },
    });
  }

  await writeAuditLog({ actorUserId: user.id, action: "GRADE_CUTOFFS_OVERRIDDEN_BY_CHAIRMAN", entityType: "Course", entityId: course.id });

  const saved = await prisma.courseGradeCutoff.findMany({ where: { courseId: course.id } });
  return NextResponse.json({ cutoffs: saved });
}
