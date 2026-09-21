import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../lib/session";
import { prisma } from "../../../../lib/db";
import { findOwnInstitutionCurriculum } from "../../../../lib/institutionCurriculum";

// Every Domain Elective course from the OMC's own institution's
// curriculum copy — for the "fill this elective slot" picker on the
// Course Repositioning page.
export async function GET() {
  const user = await getAuthenticatedUser();
  if (!user || user.role !== "OMC") return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const curriculum = await findOwnInstitutionCurriculum(user.id);
  if (!curriculum) return NextResponse.json({ courses: [] });

  const courses = await prisma.masterCourse.findMany({
    where: { masterCurriculumId: curriculum.id, category: "Domain Elective" },
    select: { id: true, code: true, title: true, domain: true },
    orderBy: [{ domain: "asc" }, { title: "asc" }],
  });

  return NextResponse.json({ courses });
}
