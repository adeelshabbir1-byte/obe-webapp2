import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../../../lib/session";
import { prisma } from "../../../../../../lib/db";
import { writeAuditLog } from "../../../../../../lib/audit";

// Builds a leaner, program-specific master curriculum from the grand
// HEC curriculum: copies the specified courses (the shared core plus
// whichever electives were chosen for this program) along with their
// CLOs and this curriculum's own PLOs, preserving each CLO's PLO
// mapping against the new copy's own PLO records. The result is
// tracked back to its source via parentCurriculumId for the sync
// mechanism, and is itself an official (chairmanId null) curriculum,
// clonable per-institute exactly like the grand one.
export async function POST(req: NextRequest, { params }: { params: { curriculumId: string } }) {
  const user = await getAuthenticatedUser();
  if (!user || user.role !== "SUPER_USER") return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const body = await req.json();
  const { title, degreeProgram, courseIds } = body;
  if (!title?.trim() || !degreeProgram?.trim()) return NextResponse.json({ error: "title and degreeProgram are required" }, { status: 400 });
  if (!Array.isArray(courseIds) || courseIds.length === 0) return NextResponse.json({ error: "courseIds must be a non-empty array" }, { status: 400 });

  const source = await prisma.masterCurriculum.findUnique({
    where: { id: params.curriculumId },
    include: {
      plos: true,
      courses: { where: { id: { in: courseIds } }, include: { seedClos: { orderBy: { orderIndex: "asc" } } } },
    },
  });
  if (!source) return NextResponse.json({ error: "source curriculum not found" }, { status: 404 });

  const found = new Set(source.courses.map((c) => c.id));
  const missing = courseIds.filter((id: string) => !found.has(id));
  if (missing.length > 0) return NextResponse.json({ error: "some courseIds were not found in the source curriculum", missing }, { status: 400 });

  const result = await prisma.$transaction(async (tx) => {
    const newCurriculum = await tx.masterCurriculum.create({
      data: {
        authority: source.authority,
        title: title.trim(),
        version: source.version,
        sourceReference: source.sourceReference,
        degreeProgram: degreeProgram.trim(),
        parentCurriculumId: source.id,
      },
    });

    const ploIdMap = new Map<string, string>();
    for (const plo of source.plos) {
      const newPlo = await tx.masterPLO.create({
        data: { masterCurriculumId: newCurriculum.id, number: plo.number, title: plo.title, description: plo.description },
      });
      ploIdMap.set(plo.id, newPlo.id);
    }

    for (const course of source.courses) {
      const newCourse = await tx.masterCourse.create({
        data: {
          masterCurriculumId: newCurriculum.id,
          code: course.code,
          title: course.title,
          creditHours: course.creditHours,
          category: course.category,
          semesterNumber: course.semesterNumber,
          textbook: course.textbook,
          catalogDescription: course.catalogDescription,
          referenceMaterial: course.referenceMaterial,
        },
      });
      for (const clo of course.seedClos) {
        await tx.masterCourseClo.create({
          data: {
            masterCourseId: newCourse.id,
            statement: clo.statement,
            bloomLevel: clo.bloomLevel,
            orderIndex: clo.orderIndex,
            mappedPloId: clo.mappedPloId ? ploIdMap.get(clo.mappedPloId) ?? null : null,
          },
        });
      }
    }

    return newCurriculum;
  });

  await writeAuditLog({
    actorUserId: user.id, action: "ADMIN_PROGRAM_COPY_CREATED", entityType: "MasterCurriculum", entityId: result.id,
    metadata: { sourceCurriculumId: source.id, degreeProgram, courseCount: courseIds.length },
  });

  return NextResponse.json({ curriculumId: result.id });
}
