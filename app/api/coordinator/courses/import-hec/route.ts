import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../../lib/session";
import { prisma } from "../../../../../lib/db";
import { writeAuditLog } from "../../../../../lib/audit";

export async function POST() {
  const user = await getAuthenticatedUser();
  if (!user || user.role !== "PROGRAM_COORDINATOR") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const hecCurriculum = await prisma.masterCurriculum.findFirst({
    where: { authority: "HEC" },
    include: { courses: true },
  });
  if (!hecCurriculum) return NextResponse.json({ error: "no HEC curriculum found" }, { status: 404 });

  const alreadyImported = await prisma.course.findMany({
    where: { coordinatorId: user.id, masterCourseId: { not: null } },
    select: { masterCourseId: true },
  });
  const importedIds = new Set(alreadyImported.map((c) => c.masterCourseId));

  const toImport = hecCurriculum.courses.filter((mc) => !importedIds.has(mc.id));

  let created = 0;
  for (const mc of toImport) {
    // Course codes must be unique per coordinator — if a manual course already
    // used this exact code, append a suffix rather than fail the whole import.
    let code = mc.code;
    const codeClash = await prisma.course.findFirst({ where: { coordinatorId: user.id, code } });
    if (codeClash) code = `${mc.code}-HEC`;

    await prisma.course.create({
      data: {
        code, title: mc.title, creditHours: mc.creditHours,
        courseType: mc.category, semesterNumber: mc.semesterNumber,
        coordinatorId: user.id, masterCourseId: mc.id,
      },
    });
    created++;
  }

  await writeAuditLog({ actorUserId: user.id, action: "HEC_CURRICULUM_BULK_IMPORTED", metadata: { count: created } });

  return NextResponse.json({ created, skipped: toImport.length - created, alreadyPresent: importedIds.size });
}
