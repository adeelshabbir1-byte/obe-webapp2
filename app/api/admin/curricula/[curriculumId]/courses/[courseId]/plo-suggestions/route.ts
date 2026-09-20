import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../../../../../lib/session";
import { prisma } from "../../../../../../../../lib/db";
import { writeAuditLog } from "../../../../../../../../lib/audit";

// Replaces the full set of suggested PLO numbers for this course's code.
// HecPloSuggestion is keyed by the bare course code, shared across
// every curriculum (and every chairman's clone) using that same code —
// editing it here, on the official copy, is exactly the place a fix
// benefits every institution at once.
export async function PUT(req: NextRequest, { params }: { params: { curriculumId: string; courseId: string } }) {
  const user = await getAuthenticatedUser();
  if (!user || user.role !== "SUPER_USER") return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const body = await req.json();
  const ploNumbers: number[] = Array.isArray(body.ploNumbers) ? body.ploNumbers.map(Number) : [];

  const course = await prisma.masterCourse.findUnique({ where: { id: params.courseId } });
  if (!course) return NextResponse.json({ error: "not found" }, { status: 404 });

  await prisma.hecPloSuggestion.deleteMany({ where: { courseCode: course.code } });
  if (ploNumbers.length > 0) {
    await prisma.hecPloSuggestion.createMany({ data: ploNumbers.map((n) => ({ courseCode: course.code, ploNumber: n })), skipDuplicates: true });
  }
  await writeAuditLog({ actorUserId: user.id, action: "ADMIN_HEC_PLO_SUGGESTIONS_UPDATED", entityType: "MasterCourse", entityId: params.courseId, metadata: { courseCode: course.code, ploNumbers: ploNumbers.join(",") } });

  return NextResponse.json({ ok: true });
}
