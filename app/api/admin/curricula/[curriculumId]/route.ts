import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../../lib/session";
import { prisma } from "../../../../../lib/db";
import { adminCan, adminCurriculum } from "../../../../../lib/platformTeam";
import { withErrors } from "../../../../../lib/apiHandler";

async function DELETE_handler(req: Request, { params }: { params: { curriculumId: string } }) {
  const user = await getAuthenticatedUser();
  if (!user || !(await adminCurriculum(user, params.curriculumId))) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const curriculum = await prisma.masterCurriculum.findUnique({ where: { id: params.curriculumId } });
  if (!curriculum) return NextResponse.json({ error: "not found" }, { status: 404 });

  const masterCourses = await prisma.masterCourse.findMany({ where: { masterCurriculumId: curriculum.id } });
  const masterCourseIds = masterCourses.map((c) => c.id);

  await prisma.$transaction([
    // Detach any real, already-adopted courses from this curriculum's master
    // courses first — masterCourseId is traceability only, so this is safe;
    // the adopted course itself is untouched.
    prisma.course.updateMany({ where: { masterCourseId: { in: masterCourseIds } }, data: { masterCourseId: null } }),
    prisma.masterCourseClo.deleteMany({ where: { masterCourseId: { in: masterCourseIds } } }),
    prisma.masterCourseTopic.deleteMany({ where: { masterCourseId: { in: masterCourseIds } } }),
    prisma.masterCourse.deleteMany({ where: { masterCurriculumId: curriculum.id } }),
    prisma.masterPLO.deleteMany({ where: { masterCurriculumId: curriculum.id } }),
    prisma.masterCurriculum.delete({ where: { id: curriculum.id } }),
  ]);

  return NextResponse.json({ ok: true });
}
export const DELETE = withErrors(DELETE_handler);
