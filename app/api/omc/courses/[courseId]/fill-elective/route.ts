import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../../../lib/session";
import { prisma } from "../../../../../../lib/db";
import { writeAuditLog } from "../../../../../../lib/audit";
import { seedFromMasterCourseIfAvailable } from "../../../../../../lib/benchmarkCopy";
import { findOwningChairmanId } from "../../../../../../lib/institutionCurriculum";

// Fills a generic elective placeholder (e.g. "Elective-I") with a real,
// named course chosen from the institution's own curriculum — renames
// the course, links masterCourseId, and seeds its CLOs/textbook from
// the template, same as importing normally would have. Only intended
// for courses that are still an unnamed placeholder (courseType
// "Elective" with no masterCourseId yet) — use the Equivalence page's
// "equate" instead for an already-named, already-taught course.
export async function PUT(req: NextRequest, { params }: { params: { courseId: string } }) {
  const user = await getAuthenticatedUser();
  if (!user || user.role !== "OMC") return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const body = await req.json();
  if (!body.masterCourseId) return NextResponse.json({ error: "masterCourseId is required" }, { status: 400 });

  const course = await prisma.course.findUnique({ where: { id: params.courseId } });
  if (!course) return NextResponse.json({ error: "course not found" }, { status: 404 });
  if (course.isOffered) return NextResponse.json({ error: "this course is already offered — can't be changed" }, { status: 400 });

  const masterCourse = await prisma.masterCourse.findUnique({ where: { id: body.masterCourseId }, include: { masterCurriculum: { select: { chairmanId: true } } } });
  if (!masterCourse) return NextResponse.json({ error: "that curriculum course wasn't found" }, { status: 404 });

  // Same defense-in-depth check as import-hec: never trust that a
  // client-supplied masterCourseId actually belongs to this OMC's own
  // institution — that mismatch is exactly how courses have ended up
  // mis-linked to a different institution's curriculum clone before.
  const owningChairmanId = await findOwningChairmanId(user.id);
  const belongsHere = masterCourse.masterCurriculum.chairmanId === null || masterCourse.masterCurriculum.chairmanId === owningChairmanId;
  if (!belongsHere) return NextResponse.json({ error: "that course doesn't belong to your institution's curriculum" }, { status: 403 });

  // Avoid a duplicate code within the same batch
  let code = masterCourse.code;
  const codeTaken = await prisma.course.findFirst({ where: { batchId: course.batchId, code, id: { not: course.id } } });
  if (codeTaken) code = `${masterCourse.code}-E`;

  const updated = await prisma.course.update({
    where: { id: course.id },
    data: {
      code, title: masterCourse.title, creditHours: masterCourse.creditHours,
      textbook: masterCourse.textbook, catalogDescription: masterCourse.catalogDescription, referenceMaterial: masterCourse.referenceMaterial,
      masterCourseId: masterCourse.id,
    },
  });

  const existingClos = await prisma.cLO.count({ where: { courseId: course.id } });
  if (existingClos === 0) await seedFromMasterCourseIfAvailable(course.id, masterCourse.id);

  await writeAuditLog({ actorUserId: user.id, action: "ELECTIVE_SLOT_FILLED", entityType: "Course", entityId: course.id, metadata: { masterCourseId: masterCourse.id, title: masterCourse.title } });

  return NextResponse.json({ course: updated });
}
