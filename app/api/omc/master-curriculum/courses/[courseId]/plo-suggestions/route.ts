import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../../../../lib/session";
import { prisma } from "../../../../../../../lib/db";
import { writeAuditLog } from "../../../../../../../lib/audit";

// Replaces the FULL set of suggested PLO numbers for this course's code
// at once — simpler and less error-prone from the UI than individual
// add/remove calls for a set of checkboxes. HecPloSuggestion is keyed
// by the bare course code string, not a foreign key to MasterCourse, so
// this looks up the course's current code first.
export async function PUT(req: NextRequest, { params }: { params: { courseId: string } }) {
  const user = await getAuthenticatedUser();
  if (!user || user.role !== "OMC") return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const body = await req.json();
  const ploNumbers: number[] = Array.isArray(body.ploNumbers) ? body.ploNumbers.map(Number) : [];

  const course = await prisma.masterCourse.findUnique({ where: { id: params.courseId } });
  if (!course) return NextResponse.json({ error: "not found" }, { status: 404 });

  await prisma.hecPloSuggestion.deleteMany({ where: { courseCode: course.code } });
  if (ploNumbers.length > 0) {
    await prisma.hecPloSuggestion.createMany({
      data: ploNumbers.map((n) => ({ courseCode: course.code, ploNumber: n })),
      skipDuplicates: true,
    });
  }
  await writeAuditLog({ actorUserId: user.id, action: "HEC_PLO_SUGGESTIONS_UPDATED", entityType: "MasterCourse", entityId: params.courseId, metadata: { courseCode: course.code, ploNumbers: ploNumbers.join(",") } });

  return NextResponse.json({ ok: true });
}
